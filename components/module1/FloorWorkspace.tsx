"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Cloud,
  Crosshair,
  Download,
  Eye,
  Hand,
  Hexagon,
  Info,
  Laptop,
  MapPin,
  Maximize2,
  MousePointer2,
  Pencil,
  Ruler,
  Scissors,
  Settings2,
  ShieldCheck,
  Sparkles,
  Spline,
  Trash2,
  TriangleAlert,
  Undo2,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn, formatAED } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { useNotifications } from "@/components/NotificationProvider";
import { uid, type ProjectsStore } from "./lib/store";
import {
  areaToM2,
  buildCalibration,
  elementQuantity,
  lengthToM,
  polygonAreaPx,
  polylineLengthPx,
  roomDimensionsM,
  round,
} from "./lib/geometry";
import { computeFloorBoq } from "./lib/boq";
import type { UseLiveRates } from "./lib/liveRates";
import { detectRoomAt } from "./lib/vision";
import { runTakeoff } from "./lib/ai/provider";
import type { ScaleProposal } from "./lib/ai/schema";
import { ROOM_TYPE_META, type RoomType } from "./lib/roomTypes";
import {
  DEFAULT_WALL_HEIGHT_M,
  ELEMENT_KIND_META,
  type ElementKind,
  type Floor,
  type Point,
  type Project,
  type ScaleCalibration,
  type TakeoffElement,
} from "./lib/types";

interface ReviewItem {
  id: string;
  kind: ElementKind;
  geometryType: TakeoffElement["geometryType"];
  points: Point[];
  label: string;
  confidence: number;
  source: string;
  layer?: string;
  wallHeightM?: number;
  roomType?: RoomType;
  printedDimensions?: string;
  decision: "accepted" | "pending" | "rejected";
}

interface ReviewState {
  items: ReviewItem[];
  scale: ScaleProposal | null;
  applyScale: boolean;
  warnings: string[];
  engine: string;
}

type Tool = "select" | "pan" | "calibrate" | "verify" | "area" | "wall" | "count" | "magic" | "cut";

interface FloorWorkspaceProps {
  store: ProjectsStore;
  projectId: string;
  floorId: string;
  rates: UseLiveRates;
  onBack: () => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y,
      xj = poly[j].x,
      yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker path simplification — reduces an over-detailed
 *  outline (e.g. an AI-traced whole floor) to a few clean anchor points. */
function rdp(pts: Point[], eps: number): Point[] {
  if (pts.length < 3) return pts;
  let dmax = 0;
  let idx = 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i], a, b);
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax > eps) {
    const left = rdp(pts.slice(0, idx + 1), eps);
    const right = rdp(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

function simplifyPath(points: Point[], eps: number, closed: boolean): Point[] {
  if (points.length <= (closed ? 4 : 3)) return points;
  if (closed) {
    const arr = rdp([...points, points[0]], eps);
    arr.pop();
    return arr.length >= 3 ? arr : points;
  }
  return rdp(points, eps);
}

/** Closest point on segment ab to p (for inserting a vertex on an edge). */
function projectOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = clamp(t, 0, 1);
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function centroid(points: Point[]): Point {
  const c = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: c.x / points.length, y: c.y / points.length };
}

/** Signed side of point p relative to the infinite line through a→b. */
function sideOfLine(p: Point, a: Point, b: Point): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

/**
 * Split a polygon by the infinite line through a→b into two polygons.
 * Works for cuts that cross the boundary exactly twice (a straight slice);
 * returns null otherwise so the caller can warn the user.
 */
function splitPolygonByLine(poly: Point[], a: Point, b: Point): [Point[], Point[]] | null {
  const left: Point[] = [];
  const right: Point[] = [];
  let crossings = 0;
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % poly.length];
    const sc = sideOfLine(cur, a, b);
    if (sc >= 0) left.push(cur);
    if (sc < 0) right.push(cur);
    const sn = sideOfLine(nxt, a, b);
    if (sc < 0 !== sn < 0) {
      const t = sc / (sc - sn);
      const ip = { x: cur.x + t * (nxt.x - cur.x), y: cur.y + t * (nxt.y - cur.y) };
      left.push(ip);
      right.push(ip);
      crossings++;
    }
  }
  if (crossings !== 2 || left.length < 3 || right.length < 3) return null;
  return [left, right];
}

export function FloorWorkspace({ store, projectId, floorId, rates, onBack }: FloorWorkspaceProps) {
  const project = store.getProject(projectId);
  const floor = store.getFloor(projectId, floorId);

  if (!project || !floor) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <p className="text-sm text-muted-foreground">This floor no longer exists.</p>
      </div>
    );
  }

  return <FloorWorkspaceInner key={floor.id} store={store} project={project} floor={floor} rates={rates} onBack={onBack} />;
}

interface FloorWorkspaceInnerProps {
  store: ProjectsStore;
  project: Project;
  floor: Floor;
  rates: UseLiveRates;
  onBack: () => void;
}

function FloorWorkspaceInner({ store, project, floor, rates, onBack }: FloorWorkspaceInnerProps) {
  const projectId = project.id;
  const floorId = floor.id;
  const { push: pushNotification } = useNotifications();

  const [tool, setTool] = useState<Tool>("select");
  const [countKind, setCountKind] = useState<Exclude<ElementKind, "room" | "wall">>("door");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draft, setDraft] = useState<Point[]>([]);
  const [twoPoint, setTwoPoint] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detectBusy, setDetectBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "error" | "ok"; msg: string } | null>(null);
  const [boqView, setBoqView] = useState<"trade" | "material">("trade");
  // Live points while dragging an element (vertex or whole shape); committed on release.
  const [dragPoints, setDragPoints] = useState<{ id: string; points: Point[] } | null>(null);
  // Which element kinds are shown on the map (layer filter / "checker").
  const [visibleKinds, setVisibleKinds] = useState<Set<ElementKind>>(
    () => new Set<ElementKind>(["room", "wall", "door", "window", "column"])
  );
  // When set, ONLY this element shows on the map (isolation / edit mode) and its
  // reshape handles appear — everything else is hidden to keep the map clean.
  const [focusId, setFocusId] = useState<string | null>(null);
  // Inline rename in the takeoff list.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [aiBusy, setAiBusy] = useState(false);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [hoverProposal, setHoverProposal] = useState<string | null>(null);
  const [showAiSettings, setShowAiSettings] = useState(false);

  const [finishModal, setFinishModal] = useState<
    { type: ElementKind; points: Point[]; label: string; wallHeight: number; roomType: RoomType } | null
  >(null);
  const [calibModal, setCalibModal] = useState<
    { p1: Point; p2: Point; pixelDist: number; known: string } | null
  >(null);
  const [verifyModal, setVerifyModal] = useState<
    { measuredM: number; expected: string } | null
  >(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panState = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const imageDataRef = useRef<{ id: string; data: ImageData } | null>(null);
  const dragRef = useRef<{
    id: string;
    mode: "vertex" | "move";
    vertexIndex: number;
    start: Point;
    original: Point[];
  } | null>(null);

  const anyModalOpen = !!finishModal || !!calibModal || !!verifyModal || showAiSettings;

  const nw = floor.naturalWidth;
  const nh = floor.naturalHeight;
  const unit = nw / 100;

  const elements = floor.elements;
  // While an element is being dragged/reshaped we swap in the live points so the
  // BOQ + summary bar recalculate instantly (before the change is committed).
  const liveElements = useMemo(
    () =>
      dragPoints
        ? elements.map((el) => (el.id === dragPoints.id ? { ...el, points: dragPoints.points } : el))
        : elements,
    [elements, dragPoints]
  );
  // Recompute when the floor changes OR when material rates change (live feed,
  // manual overrides, or custom materials) — costs are derived from those.
  const boq = useMemo(
    () => computeFloorBoq({ ...floor, elements: liveElements }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveElements, floor, rates.card, store.settings.rateOverrides, store.settings.customMaterials]
  );

  const KIND_ORDER: ElementKind[] = ["room", "wall", "door", "window", "column"];
  // Which kinds actually exist on this floor (for the filter chips).
  const kindsPresent = useMemo(() => {
    const present = new Set(elements.map((e) => e.kind));
    return KIND_ORDER.filter((k) => present.has(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  // Elements actually drawn on the map: a single isolated item when focused,
  // otherwise everything whose kind is toggled on.
  const visibleElements = useMemo(
    () => (focusId ? elements.filter((e) => e.id === focusId) : elements.filter((e) => visibleKinds.has(e.kind))),
    [elements, visibleKinds, focusId]
  );

  const showToast = useCallback((kind: "error" | "ok", msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const commitElements = useCallback(
    (next: TakeoffElement[]) => store.setElements(projectId, floorId, next),
    [store, projectId, floorId]
  );

  const cancelDrafts = useCallback(() => {
    setDraft([]);
    setTwoPoint([]);
    setCursor(null);
  }, []);

  // Keep the drawing from being panned/zoomed completely out of the stage:
  // require at least `margin` px of content to stay visible on every edge.
  const clampPan = useCallback(
    (p: { x: number; y: number }, z: number) => {
      const el = containerRef.current;
      if (!el) return p;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const contentW = cw * z;
      const contentH = cw * (nh / nw) * z;
      const margin = Math.min(64, contentW * 0.4, contentH * 0.4);
      return {
        x: clamp(p.x, margin - contentW, cw - margin),
        y: clamp(p.y, margin - contentH, ch - margin),
      };
    },
    [nw, nh]
  );

  // Native non-passive wheel handler: scroll = pan, Ctrl/⌘+scroll = zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom toward the cursor.
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        setZoom((prevZoom) => {
          const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
          const next = clamp(prevZoom * factor, 0.5, 10);
          setPan((prevPan) =>
            clampPan(
              {
                x: mx - ((mx - prevPan.x) * next) / prevZoom,
                y: my - ((my - prevPan.y) * next) / prevZoom,
              },
              next
            )
          );
          return next;
        });
        return;
      }
      // Otherwise scroll/pan the drawing. Shift (or a horizontal wheel) pans left/right.
      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      setPan((prevPan) => clampPan({ x: prevPan.x - dx, y: prevPan.y - dy }, zoom));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clampPan, zoom]);

  // Re-clamp after any zoom change from the toolbar buttons.
  useEffect(() => {
    setPan((p) => clampPan(p, zoom));
  }, [zoom, clampPan]);

  // Fit the sheet to the stage on first mount so it opens centered.
  useEffect(() => {
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anyModalOpen) return;
      if (renamingId) return;
      if (e.key === "Escape") {
        cancelDrafts();
        if (focusId) exitFocus();
      }
      if (e.key === "Enter") {
        if ((tool === "area" && draft.length >= 3) || (tool === "wall" && draft.length >= 2)) {
          finishDraft();
        }
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        commitElements(elements.filter((el) => el.id !== selectedId));
        if (focusId === selectedId) setFocusId(null);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyModalOpen, tool, draft, selectedId, elements, focusId, renamingId]);

  const scale = floor.scale;

  function toNatural(clientX: number, clientY: number): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * nw;
    const y = ((clientY - rect.top) / rect.height) * nh;
    return { x: clamp(x, 0, nw), y: clamp(y, 0, nh) };
  }

  function nextLabel(kind: ElementKind): string {
    const base = ELEMENT_KIND_META[kind].label.split(" ")[0];
    const n = elements.filter((e) => e.kind === kind).length + 1;
    return `${base} ${n}`;
  }

  function addElement(el: TakeoffElement) {
    commitElements([...elements, el]);
  }

  function finishDraft() {
    if (tool === "area" && draft.length >= 3) {
      setFinishModal({ type: "room", points: draft, label: nextLabel("room"), wallHeight: DEFAULT_WALL_HEIGHT_M, roomType: "generic" });
      setDraft([]);
    } else if (tool === "wall" && draft.length >= 2) {
      setFinishModal({ type: "wall", points: draft, label: nextLabel("wall"), wallHeight: DEFAULT_WALL_HEIGHT_M, roomType: "generic" });
      setDraft([]);
    }
  }

  async function getImageData(): Promise<ImageData | null> {
    if (imageDataRef.current?.id === floor.id) return imageDataRef.current.data;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = nw;
        canvas.height = nh;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, nw, nh);
        try {
          const data = ctx.getImageData(0, 0, nw, nh);
          imageDataRef.current = { id: floor.id, data };
          resolve(data);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = floor.imageDataUrl;
    });
  }

  async function runMagicRoom(p: Point) {
    setDetectBusy(true);
    try {
      const data = await getImageData();
      if (!data) {
        showToast("error", "Couldn't read the image pixels for detection.");
        return;
      }
      const res = detectRoomAt(data, p.x, p.y);
      if (!res.ok) {
        showToast("error", res.message);
        return;
      }
      setFinishModal({ type: "room", points: res.points, label: nextLabel("room"), wallHeight: DEFAULT_WALL_HEIGHT_M, roomType: "generic" });
      showToast("ok", "Room detected — review the outline and confirm.");
    } finally {
      setDetectBusy(false);
    }
  }

  /** Hit test for a count marker (dot for columns, rectangle for doors/windows). */
  function countHit(el: TakeoffElement, p: Point): boolean {
    if (el.geometryType !== "count") return false;
    const c = el.points[0];
    if (el.kind === "column") return Math.hypot(c.x - p.x, c.y - p.y) < unit * 2;
    const rw = unit * (el.kind === "window" ? 5 : 4.4);
    const rh = unit * 1.8;
    return Math.abs(p.x - c.x) <= rw / 2 + unit * 0.5 && Math.abs(p.y - c.y) <= rh / 2 + unit * 0.5;
  }

  function hitTest(p: Point): string | null {
    const linTol = unit * 1.2;
    const els = visibleElements;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      if (el.geometryType === "polygon" && pointInPolygon(p, el.points)) return el.id;
      if (el.geometryType === "count" && countHit(el, p)) return el.id;
      if (el.geometryType === "polyline") {
        for (let s = 0; s < el.points.length - 1; s++) {
          if (distToSegment(p, el.points[s], el.points[s + 1]) < linTol) return el.id;
        }
      }
    }
    return null;
  }

  function nearPolyline(p: Point, pts: Point[], tol: number): boolean {
    for (let s = 0; s < pts.length - 1; s++) {
      if (distToSegment(p, pts[s], pts[s + 1]) < tol) return true;
    }
    return false;
  }

  /** Begin editing (select tool): reshape the focused shape from anywhere on its
   *  outline (grab a corner, or bend an edge), move a count marker, or move a shape. */
  function beginEdit(p: Point): boolean {
    // 1) The FOCUSED (isolated) shape → reshape like a vector path.
    if (focusId) {
      const el = elements.find((e) => e.id === focusId);
      if (el && el.geometryType !== "count") {
        // Same band as the visible handle, so you can grab wherever it appears.
        const band = nw * 0.06;
        // Nearest corner.
        let bv = Infinity;
        let vi = -1;
        el.points.forEach((pt, i) => {
          const d = Math.hypot(pt.x - p.x, pt.y - p.y);
          if (d < bv) {
            bv = d;
            vi = i;
          }
        });
        // Nearest point on any edge.
        const segN = el.geometryType === "polygon" ? el.points.length : el.points.length - 1;
        let be = Infinity;
        let bs = -1;
        let bp: Point | null = null;
        for (let s = 0; s < segN; s++) {
          const a = el.points[s];
          const b = el.points[(s + 1) % el.points.length];
          const pr = projectOnSegment(p, a, b);
          const d = Math.hypot(pr.x - p.x, pr.y - p.y);
          if (d < be) {
            be = d;
            bs = s;
            bp = pr;
          }
        }
        // Prefer moving an existing corner; otherwise bend the edge (adds a point).
        if (vi >= 0 && bv <= band && bv <= be + unit * 1.2) {
          dragRef.current = { id: el.id, mode: "vertex", vertexIndex: vi, start: p, original: el.points };
          return true;
        }
        if (bp && be <= band) {
          const np = [...el.points];
          np.splice(bs + 1, 0, bp);
          dragRef.current = { id: el.id, mode: "vertex", vertexIndex: bs + 1, start: p, original: np };
          setDragPoints({ id: el.id, points: np });
          return true;
        }
      }
    }
    // 2) A visible count marker (topmost first) → move the dot / rectangle.
    for (let i = visibleElements.length - 1; i >= 0; i--) {
      const el = visibleElements[i];
      if (el.geometryType !== "count") continue;
      if (countHit(el, p)) {
        setSelectedId(el.id);
        dragRef.current = { id: el.id, mode: "move", vertexIndex: -1, start: p, original: el.points };
        return true;
      }
    }
    // 3) The body of the already-selected shape → move the whole thing.
    if (selectedId) {
      const sel = visibleElements.find((e) => e.id === selectedId);
      if (sel) {
        const insideBody =
          (sel.geometryType === "polygon" && pointInPolygon(p, sel.points)) ||
          (sel.geometryType === "polyline" && nearPolyline(p, sel.points, unit * 1.4));
        if (insideBody) {
          dragRef.current = { id: sel.id, mode: "move", vertexIndex: -1, start: p, original: sel.points };
          return true;
        }
      }
    }
    return false;
  }

  const isPanTool = tool === "pan";

  function onPointerDown(e: React.PointerEvent) {
    if (anyModalOpen) return;
    const panning = isPanTool || e.button === 1 || (e.button === 0 && e.altKey);
    if (panning) {
      panState.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    // While reviewing AI proposals, the canvas is view-only (accept/reject from the panel).
    if (review) return;
    if (e.button !== 0) return;
    const p = toNatural(e.clientX, e.clientY);

    switch (tool) {
      case "select": {
        if (beginEdit(p)) {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          break;
        }
        setSelectedId(hitTest(p));
        break;
      }
      case "calibrate":
      case "verify": {
        const next = [...twoPoint, p];
        if (next.length >= 2) {
          const pixelDist = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y);
          if (pixelDist < 3) {
            showToast("error", "Points are too close together. Zoom in and pick two distinct ends.");
            setTwoPoint([]);
            return;
          }
          if (tool === "calibrate") {
            setCalibModal({ p1: next[0], p2: next[1], pixelDist, known: "" });
          } else if (scale) {
            setVerifyModal({ measuredM: lengthToM(pixelDist, scale), expected: "" });
          }
          setTwoPoint([]);
        } else {
          setTwoPoint(next);
        }
        break;
      }
      case "area": {
        // Click near the first point to close the shape (mask-style completion).
        if (draft.length >= 3 && Math.hypot(draft[0].x - p.x, draft[0].y - p.y) < unit * 2.5) {
          finishDraft();
          break;
        }
        setDraft((d) => [...d, p]);
        break;
      }
      case "wall":
        setDraft((d) => [...d, p]);
        break;
      case "count": {
        addElement({
          id: uid("el"),
          kind: countKind,
          geometryType: "count",
          label: nextLabel(countKind),
          points: [p],
          createdAt: Date.now(),
        });
        break;
      }
      case "magic":
        void runMagicRoom(p);
        break;
      case "cut": {
        const next = [...twoPoint, p];
        if (next.length >= 2) {
          if (Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y) < 3) {
            showToast("error", "Draw a longer slice line across the area.");
          } else {
            performCut(next[0], next[1]);
          }
          setTwoPoint([]);
        } else {
          setTwoPoint(next);
        }
        break;
      }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (panState.current) {
      setPan(
        clampPan(
          {
            x: panState.current.panX + (e.clientX - panState.current.x),
            y: panState.current.panY + (e.clientY - panState.current.y),
          },
          zoom
        )
      );
      return;
    }
    // Live element editing (select tool).
    if (dragRef.current) {
      const d = dragRef.current;
      const p = toNatural(e.clientX, e.clientY);
      let pts: Point[];
      if (d.mode === "vertex") {
        pts = d.original.map((pt, i) =>
          i === d.vertexIndex ? { x: clamp(p.x, 0, nw), y: clamp(p.y, 0, nh) } : pt
        );
      } else {
        const dx = p.x - d.start.x;
        const dy = p.y - d.start.y;
        pts = d.original.map((pt) => ({ x: clamp(pt.x + dx, 0, nw), y: clamp(pt.y + dy, 0, nh) }));
      }
      setDragPoints({ id: d.id, points: pts });
      return;
    }
    if (tool === "area" || tool === "wall" || tool === "calibrate" || tool === "verify" || tool === "cut") {
      setCursor(toNatural(e.clientX, e.clientY));
    } else if (tool === "select" && focusId) {
      // Track the pointer so we can reveal reshape handles only near it.
      setCursor(toNatural(e.clientX, e.clientY));
    }
  }

  function onPointerUp() {
    panState.current = null;
    if (dragRef.current && dragPoints && dragPoints.id === dragRef.current.id) {
      const id = dragRef.current.id;
      const pts = dragPoints.points;
      commitElements(elements.map((el) => (el.id === id ? { ...el, points: pts } : el)));
    }
    dragRef.current = null;
    setDragPoints(null);
  }

  function onDoubleClick(e: React.MouseEvent) {
    if ((tool === "area" && draft.length >= 3) || (tool === "wall" && draft.length >= 2)) {
      finishDraft();
      return;
    }
    if (tool !== "select") return;
    const p = toNatural(e.clientX, e.clientY);
    // Not focused yet → double-click isolates whatever is under the cursor so you
    // can edit just that one shape.
    if (!focusId) {
      const hit = hitTest(p);
      if (hit) focusElement(hit);
      return;
    }
    // Focused → mask-style editing: double-click a point to delete it, or an edge
    // of the room/wall to insert a new point there.
    const el = elements.find((x) => x.id === focusId);
    if (!el || el.geometryType === "count") return;
    const minPts = el.geometryType === "polygon" ? 3 : 2;

    const vi = el.points.findIndex((pt) => Math.hypot(pt.x - p.x, pt.y - p.y) < unit * 1.9);
    if (vi >= 0) {
      if (el.points.length <= minPts) {
        showToast("error", `A ${el.geometryType === "polygon" ? "room" : "line"} needs at least ${minPts} points.`);
        return;
      }
      const pts = el.points.filter((_, i) => i !== vi);
      commitElements(elements.map((x) => (x.id === el.id ? { ...x, points: pts } : x)));
      return;
    }

    const segCount = el.geometryType === "polygon" ? el.points.length : el.points.length - 1;
    let best = { d: Infinity, seg: -1, proj: p };
    for (let s = 0; s < segCount; s++) {
      const a = el.points[s];
      const b = el.points[(s + 1) % el.points.length];
      const proj = projectOnSegment(p, a, b);
      const d = Math.hypot(proj.x - p.x, proj.y - p.y);
      if (d < best.d) best = { d, seg: s, proj };
    }
    if (best.seg >= 0 && best.d < unit * 2) {
      const pts = [...el.points];
      pts.splice(best.seg + 1, 0, best.proj);
      commitElements(elements.map((x) => (x.id === el.id ? { ...x, points: pts } : x)));
    }
  }

  /** Slice polygons with the line a→b into separate labelled sections. */
  function performCut(a: Point, b: Point) {
    const targetIds = new Set(
      (focusId
        ? elements.filter((e) => e.id === focusId && e.geometryType === "polygon")
        : elements.filter((e) => e.geometryType === "polygon")
      ).map((e) => e.id)
    );
    const next: TakeoffElement[] = [];
    let splitCount = 0;
    let newFirstId: string | null = null;
    for (const el of elements) {
      if (el.geometryType === "polygon" && targetIds.has(el.id)) {
        const res = splitPolygonByLine(el.points, a, b);
        if (res) {
          splitCount++;
          const idA = uid("el");
          if (!newFirstId) newFirstId = idA;
          next.push({ ...el, id: idA, label: `${el.label} A`, points: res[0], printedDimensions: undefined, createdAt: Date.now() });
          next.push({ ...el, id: uid("el"), label: `${el.label} B`, points: res[1], printedDimensions: undefined, createdAt: Date.now() });
          continue;
        }
      }
      next.push(el);
    }
    if (splitCount === 0) {
      showToast(
        "error",
        "Cut didn't cross an area cleanly. Draw a straight slice fully across one area — the line must cross its outline exactly twice."
      );
      return;
    }
    commitElements(next);
    setFocusId(null);
    setSelectedId(newFirstId);
    showToast("ok", `Split into ${splitCount * 2} sections — rename each and set its type/materials.`);
  }

  function fitView() {
    const el = containerRef.current;
    if (!el) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    // Contain the whole sheet, then center it in the stage.
    const fitZoom = clamp(Math.min(1, ch / (cw * (nh / nw))), 0.5, 10);
    const contentW = cw * fitZoom;
    const contentH = cw * (nh / nw) * fitZoom;
    setZoom(fitZoom);
    setPan({ x: (cw - contentW) / 2, y: Math.max(0, (ch - contentH) / 2) });
  }

  /** Zoom/pan so the given points fill most of the stage (used when isolating). */
  function zoomToPoints(pts: Point[]) {
    const el = containerRef.current;
    if (!el || pts.length === 0) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = nw * 0.08;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    const bw = Math.max(maxX - minX, nw * 0.04);
    const bh = Math.max(maxY - minY, nh * 0.04);
    const z = clamp(Math.min(nw / bw, (ch * nw) / (cw * bh)), 0.5, 12);
    const k = (cw / nw) * z;
    setZoom(z);
    setPan(clampPan({ x: cw / 2 - ((minX + maxX) / 2) * k, y: ch / 2 - ((minY + maxY) / 2) * k }, z));
  }

  function toggleKind(k: ElementKind) {
    setVisibleKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  /** Isolate a single element on the map for comfortable editing. */
  function focusElement(id: string) {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    setTool("select");
    setSelectedId(id);
    setFocusId(id);
    // Auto-clean an over-detailed AI outline so editing starts with a few tidy
    // anchors instead of dozens of noisy points.
    if (el.geometryType !== "count" && el.points.length > 16) {
      const closed = el.geometryType === "polygon";
      const simplified = simplifyPath(el.points, nw * 0.006, closed);
      if (simplified.length >= (closed ? 3 : 2) && simplified.length < el.points.length) {
        commitElements(elements.map((x) => (x.id === id ? { ...x, points: simplified } : x)));
      }
    }
    zoomToPoints(el.points);
  }

  function exitFocus() {
    setFocusId(null);
    fitView();
  }

  /** Reduce an over-detailed outline to a few clean, easy-to-drag anchors. */
  function simplifyFocused() {
    if (!focusId) return;
    const el = elements.find((e) => e.id === focusId);
    if (!el || el.geometryType === "count") return;
    const closed = el.geometryType === "polygon";
    const eps = nw * 0.007;
    const simplified = simplifyPath(el.points, eps, closed);
    if (simplified.length >= el.points.length) {
      showToast("ok", "Outline is already clean.");
      return;
    }
    commitElements(elements.map((x) => (x.id === el.id ? { ...x, points: simplified } : x)));
    showToast("ok", `Simplified to ${simplified.length} anchor points — easier to reshape now.`);
  }

  function commitRename(id: string) {
    const name = renameValue.trim();
    if (name) commitElements(elements.map((el) => (el.id === id ? { ...el, label: name } : el)));
    setRenamingId(null);
    setRenameValue("");
  }

  function confirmFinish() {
    if (!finishModal) return;
    const el: TakeoffElement = {
      id: uid("el"),
      kind: finishModal.type,
      geometryType: finishModal.type === "room" ? "polygon" : "polyline",
      label: finishModal.label.trim() || nextLabel(finishModal.type),
      points: finishModal.points,
      wallHeightM: finishModal.type === "wall" ? finishModal.wallHeight : undefined,
      roomType: finishModal.type === "room" ? finishModal.roomType : undefined,
      createdAt: Date.now(),
    };
    addElement(el);
    setFinishModal(null);
  }

  function confirmCalibration() {
    if (!calibModal) return;
    const known = parseFloat(calibModal.known);
    if (!isFinite(known) || known <= 0) {
      showToast("error", "Enter a valid real-world length in metres.");
      return;
    }
    const cal = buildCalibration(calibModal.p1, calibModal.p2, known);
    store.updateFloor(projectId, floorId, { scale: cal });
    setCalibModal(null);
    setTool("select");
    showToast("ok", `Scale set — 1 m ≈ ${round(1 / cal.metersPerPixel, 0)} px. Now verify against a second dimension.`);
  }

  function confirmVerify() {
    if (!verifyModal || !scale) return;
    const expected = parseFloat(verifyModal.expected);
    if (!isFinite(expected) || expected <= 0) {
      showToast("error", "Enter the expected real length in metres.");
      return;
    }
    const errPct = Math.abs(verifyModal.measuredM - expected) / expected * 100;
    store.updateFloor(projectId, floorId, {
      scale: {
        ...scale,
        verified: errPct <= 2,
        verifiedLengthM: round(verifyModal.measuredM, 3),
        verifiedExpectedM: expected,
      },
    });
    setVerifyModal(null);
    setTool("select");
    if (errPct <= 2) showToast("ok", `Scale verified — measured ${round(verifyModal.measuredM, 2)} m vs expected ${expected} m (${round(errPct, 1)}% off).`);
    else showToast("error", `Scale off by ${round(errPct, 1)}% (measured ${round(verifyModal.measuredM, 2)} m). Re-calibrate before trusting quantities.`);
  }

  function exportCsv() {
    if (!boq) return;
    const rows: (string | number)[][] = [
      ["ADICC — Bill of Quantities"],
      [`Project`, project.name],
      [`Floor`, floor.name],
      [`Scale`, scale ? `1 px = ${round(scale.metersPerPixel, 5)} m${scale.verified ? " (verified)" : ""}` : "NOT CALIBRATED"],
      [],
      ["Item", "Description", "Unit", "Qty", "Rate (AED)", "Amount (AED)"],
    ];
    boq.lines.forEach((l, i) => {
      rows.push([
        String(i + 1),
        l.description,
        l.unit,
        String(round(l.quantity, 2)),
        String(round(l.rate, 2)),
        String(round(l.amount, 2)),
      ]);
      // Indented material build-up beneath each trade line.
      l.materials.forEach((m) => {
        rows.push(["", `    ${m.label}`, m.unit, String(round(m.quantity, 2)), String(round(m.rate, 2)), String(round(m.amount, 2))]);
      });
    });
    rows.push([]);
    rows.push(["", "", "", "", "Subtotal", String(round(boq.subtotal, 2))]);
    rows.push([]);
    rows.push(["Materials summary (this floor)"]);
    rows.push(["Material", "Unit", "Qty", "Rate (AED)", "Amount (AED)"]);
    boq.materials.forEach((m) => {
      rows.push([m.label, m.unit, String(round(m.quantity, 2)), String(round(m.rate, 2)), String(round(m.amount, 2))]);
    });
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name}-${floor.name}-BOQ.csv`.replace(/\s+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runAutoTakeoff() {
    setAiBusy(true);
    setSelectedId(null);
    cancelDrafts();
    try {
      const res = await runTakeoff(floor, store.settings);
      const items: ReviewItem[] = res.elements.map((e, i) => ({
        id: `prop_${Date.now()}_${i}`,
        kind: e.kind,
        geometryType: e.geometryType,
        points: e.points,
        label: e.label,
        confidence: e.confidence,
        source: e.source,
        layer: e.layer,
        wallHeightM: e.wallHeightM,
        roomType: e.roomType,
        printedDimensions: e.printedDimensions,
        decision: e.confidence >= 0.6 ? "accepted" : "pending",
      }));
      setReview({
        items,
        scale: res.scale,
        applyScale: !!res.scale && (!scale || res.scale.confidence >= 0.9),
        warnings: res.warnings,
        engine: res.engine,
      });
      if (items.length === 0) {
        showToast("error", res.warnings[0] ?? "Nothing detected automatically.");
      } else {
        showToast(
          "ok",
          `${res.engine === "api" ? "Backend" : "In-browser"} engine proposed ${items.length} item${items.length === 1 ? "" : "s"} — review before adding.`
        );
      }
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Auto-takeoff failed.");
    } finally {
      setAiBusy(false);
    }
  }

  function setDecision(id: string, decision: ReviewItem["decision"]) {
    setReview((r) =>
      r ? { ...r, items: r.items.map((it) => (it.id === id ? { ...it, decision } : it)) } : r
    );
  }

  function setAllDecisions(decision: ReviewItem["decision"]) {
    setReview((r) => (r ? { ...r, items: r.items.map((it) => ({ ...it, decision })) } : r));
  }

  function applyReview() {
    if (!review) return;
    const accepted = review.items.filter((it) => it.decision === "accepted");

    if (review.scale && review.applyScale) {
      const mpp = review.scale.metersPerPixel;
      const cal: ScaleCalibration = {
        metersPerPixel: mpp,
        knownLengthM: round(mpp * 1000, 4),
        pixelDistance: 1000,
        method: review.scale.method === "dxf-native" ? "dxf-native" : "two-point",
        verified: review.scale.confidence >= 0.9,
        createdAt: Date.now(),
      };
      store.updateFloor(projectId, floorId, { scale: cal });
    }

    if (accepted.length > 0) {
      const newEls: TakeoffElement[] = accepted.map((it) => ({
        id: uid("el"),
        kind: it.kind,
        geometryType: it.geometryType,
        label: it.label,
        points: it.points,
        wallHeightM: it.wallHeightM,
        confidence: it.confidence,
        status: "confirmed",
        source: it.source,
        layer: it.layer,
        roomType: it.roomType,
        printedDimensions: it.printedDimensions,
        createdAt: Date.now(),
      }));
      commitElements([...elements, ...newEls]);
    }

    setReview(null);
    setHoverProposal(null);
    showToast("ok", `Added ${accepted.length} confirmed item${accepted.length === 1 ? "" : "s"} to the takeoff.`);
    if (accepted.length > 0) {
      pushNotification({
        title: "Takeoff completed",
        detail: `${project.name} — ${floor.name}: ${accepted.length} element${accepted.length === 1 ? "" : "s"} confirmed.`,
        variant: "default",
      });
    }
  }

  const strokeMain = 2;
  const fontMain = unit * 2.1;

  const tools: { id: Tool; icon: typeof MousePointer2; label: string }[] = [
    { id: "select", icon: MousePointer2, label: "Select" },
    { id: "pan", icon: Hand, label: "Pan" },
    { id: "calibrate", icon: Ruler, label: "Set scale" },
    { id: "verify", icon: ShieldCheck, label: "Verify" },
    { id: "magic", icon: Wand2, label: "Magic room" },
    { id: "area", icon: Hexagon, label: "Area" },
    { id: "wall", icon: Spline, label: "Wall" },
    { id: "count", icon: MapPin, label: "Count" },
    { id: "cut", icon: Scissors, label: "Cut" },
  ];

  const toolHint: Record<Tool, string> = {
    select: "Click a shape to isolate & edit it; grab its outline anywhere to reshape, drag inside to move. Scroll to pan the drawing, Ctrl+scroll (or the +/− buttons) to zoom. Press Delete to remove.",
    pan: "Scroll to move around (Shift-scroll for left/right), or drag. Zoom with Ctrl+scroll or the +/− buttons.",
    calibrate: "Click the two ends of a known dimension (e.g. a 6.00 m grid line), then type its real length.",
    verify: scale
      ? "Click a second known dimension to check the scale is accurate before measuring."
      : "Set the scale first, then verify it here.",
    magic: "Click inside an enclosed room — it auto-traces the outline. Review before confirming.",
    area: "Click each corner of the area — the shape fills in live with its m². Click the first point again (or double-click / Enter) to close it, then pick its type/materials.",
    wall: "Click along a wall run. Double-click or press Enter to finish, then set its height.",
    count: `Click to drop a ${countKind}. Switch type below.`,
    cut: "Split a big block into rooms: click two points to draw a slice line straight across an area. It divides into two parts you can label separately.",
  };

  const needsScale = !scale && elements.some((e) => e.geometryType !== "count");

  return (
    <div className="space-y-3">
      {/* Marching-ants animation for the mask outline of the focused element. */}
      <style>{`@keyframes adiccAnts { to { stroke-dashoffset: -22; } } .adicc-ants { animation: adiccAnts 0.7s linear infinite; }`}</style>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 surface-card px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> {project.name}
          </Button>
          <span className="text-muted-foreground/60">/</span>
          <h2 className="font-bold tracking-tight text-foreground">{floor.name}</h2>
          <Badge variant="secondary" className="uppercase text-[10px]">{floor.sourceType}</Badge>
        </div>
      </div>

      {floor.notes && (
        <div className="flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/[0.03] p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{floor.notes}</span>
        </div>
      )}

      {/* Summary bar — scale, floor estimate, and per-segment costs on top */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className={cn(
          "min-w-[140px] shrink-0 rounded-lg border px-3 py-2",
          scale ? (scale.verified ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5") : "border-amber-500/40 bg-amber-500/5"
        )}>
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Ruler className="h-3 w-3" /> Scale
          </p>
          <p className="mt-0.5 text-sm font-bold text-foreground">
            {scale ? `1 m ≈ ${round(1 / scale.metersPerPixel, 0)} px` : "Not set"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {scale ? (scale.verified ? "verified" : "unverified — verify it") : "calibrate to price areas"}
          </p>
        </div>
        <div className="min-w-[150px] shrink-0 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Floor estimate</p>
          <p className="mt-0.5 text-base font-bold text-primary">{formatAED(Math.round(boq.subtotal))}</p>
          <p className="text-[10px] text-muted-foreground">{elements.length} takeoff item{elements.length === 1 ? "" : "s"}</p>
        </div>
        {boq.lines.map((l) => (
          <div key={l.id} className="min-w-[140px] shrink-0 rounded-lg border bg-card px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ELEMENT_KIND_META[l.kind].color }} />
              <span className="truncate">{l.kind === "room" && l.roomType ? ROOM_TYPE_META[l.roomType].label : ELEMENT_KIND_META[l.kind].label}</span>
            </p>
            <p className="mt-0.5 text-sm font-bold text-foreground">{formatAED(Math.round(l.amount))}</p>
            <p className="text-[10px] text-muted-foreground">{round(l.quantity, 1).toLocaleString()} {l.unit}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {/* Canvas column */}
        <div className="space-y-2">
          {/* AI action bar */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-1.5">
            <Button size="sm" onClick={runAutoTakeoff} disabled={aiBusy || !!review}>
              <Sparkles className={cn("h-4 w-4", aiBusy && "animate-pulse")} />
              {aiBusy ? "Detecting…" : "Auto-Takeoff"}
            </Button>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {store.settings.engine === "api" ? (
                <><Cloud className="h-3.5 w-3.5" /> Online engine</>
              ) : (
                <><Laptop className="h-3.5 w-3.5" /> In-browser engine</>
              )}
            </span>
            <button
              type="button"
              onClick={() => setShowAiSettings(true)}
              className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" /> Engine
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1.5">
            {tools.map((t) => {
              const Icon = t.icon;
              const active = tool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  onClick={() => {
                    setTool(t.id);
                    cancelDrafts();
                    setSelectedId(null);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
            <div className="mx-1 h-6 w-px bg-border" />
            <button type="button" title="Zoom out" onClick={() => setZoom((z) => clamp(z / 1.2, 0.5, 10))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="w-10 text-center text-xs font-medium tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <button type="button" title="Zoom in" onClick={() => setZoom((z) => clamp(z * 1.2, 0.5, 10))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button type="button" title="Fit" onClick={fitView} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <Maximize2 className="h-4 w-4" />
            </button>
            {(draft.length > 0 || twoPoint.length > 0) && (
              <button type="button" title="Cancel" onClick={cancelDrafts} className="ml-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                <Undo2 className="h-4 w-4" /> Cancel
              </button>
            )}
          </div>

          {/* Count-kind chooser */}
          {tool === "count" && (
            <div className="flex items-center gap-1.5 rounded-lg border bg-card p-1.5 text-xs">
              <span className="px-1 font-medium text-muted-foreground">Counting:</span>
              {(["door", "window", "column"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCountKind(k)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium capitalize transition-colors",
                    countKind === k ? "text-white" : "text-muted-foreground hover:bg-muted"
                  )}
                  style={countKind === k ? { backgroundColor: ELEMENT_KIND_META[k].color } : undefined}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ELEMENT_KIND_META[k].color }} />
                  {k}
                </button>
              ))}
            </div>
          )}

          {/* Layer filter / isolation bar */}
          {elements.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card p-1.5 text-xs">
              {focusId ? (
                (() => {
                  const fel = elements.find((e) => e.id === focusId);
                  return (
                    <>
                      <span className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 font-medium text-primary">
                        <Crosshair className="h-3.5 w-3.5" /> Editing:
                      </span>
                      <input
                        value={fel?.label ?? ""}
                        onChange={(e) =>
                          commitElements(elements.map((x) => (x.id === focusId ? { ...x, label: e.target.value } : x)))
                        }
                        className="w-32 rounded-md border bg-background px-2 py-1 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
                      />
                      {fel?.kind === "room" && (
                        <select
                          value={fel.roomType ?? "generic"}
                          onChange={(e) =>
                            commitElements(
                              elements.map((x) => (x.id === focusId ? { ...x, roomType: e.target.value as RoomType } : x))
                            )
                          }
                          className="rounded-md border bg-background px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                          title="Finish package / materials"
                        >
                          {(Object.keys(ROOM_TYPE_META) as RoomType[]).map((rt) => (
                            <option key={rt} value={rt}>
                              {ROOM_TYPE_META[rt].label}
                            </option>
                          ))}
                        </select>
                      )}
                      {fel && fel.geometryType !== "count" && (
                        <button
                          type="button"
                          onClick={simplifyFocused}
                          className={cn(
                            "flex items-center gap-1 rounded-md border px-2 py-1 font-medium",
                            fel.points.length > 28
                              ? "border-amber-500/50 bg-amber-500/10 text-amber-600"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                          title="Reduce the number of anchor points"
                        >
                          <Sparkles className="h-3.5 w-3.5" /> Simplify ({fel.points.length})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={exitFocus}
                        className="ml-auto flex items-center gap-1 rounded-md border px-2 py-1 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Eye className="h-3.5 w-3.5" /> Show all
                      </button>
                    </>
                  );
                })()
              ) : (
                <>
                  <span className="px-1 font-medium text-muted-foreground">Show:</span>
                  {kindsPresent.map((k) => {
                    const on = visibleKinds.has(k);
                    const meta = ELEMENT_KIND_META[k];
                    const count = elements.filter((e) => e.kind === k).length;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => toggleKind(k)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium capitalize transition-colors",
                          on ? "bg-card text-foreground" : "border-dashed text-muted-foreground opacity-50"
                        )}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                        {meta.label.split(" ")[0]} ({count})
                      </button>
                    );
                  })}
                  {kindsPresent.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setVisibleKinds(new Set(kindsPresent))}
                      className="ml-auto rounded-md px-2 py-1 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      All
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Hint */}
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>{detectBusy ? "Detecting room…" : focusId ? "Editing this outline — grab it anywhere and drag to reshape (a handle follows your cursor), drag inside to move, double-click a corner to delete. Scroll to pan, Ctrl+scroll to zoom. ‘Simplify’ tidies points. ‘Show all’ when done." : toolHint[tool]}</span>
          </div>

          {/* Stage */}
          <div
            ref={containerRef}
            className="relative h-[560px] overflow-hidden rounded-xl border bg-neutral-100 dark:bg-neutral-900"
            style={{ touchAction: "none" }}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: "100%" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={floor.imageDataUrl}
                alt={floor.name}
                className="block w-full select-none"
                draggable={false}
              />
              <svg
                ref={svgRef}
                viewBox={`0 0 ${nw} ${nh}`}
                className={cn(
                  "absolute inset-0 h-full w-full",
                  isPanTool ? "cursor-grab" : tool === "select" ? "cursor-pointer" : "cursor-crosshair"
                )}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onDoubleClick={onDoubleClick}
              >
                {/* Committed elements (filtered by layer toggles / isolation) */}
                {visibleElements.map((el) => {
                  const meta = ELEMENT_KIND_META[el.kind];
                  const selected = el.id === selectedId;
                  // Use live drag points while this element is being edited.
                  const pts = dragPoints?.id === el.id ? dragPoints.points : el.points;
                  // Reshape handles only appear for the isolated (focused) element,
                  // so the map stays clean until you're editing one thing.
                  const editable = tool === "select" && el.id === focusId;
                  const showLabel = selected || editable;
                  const handleR = unit * 1.05;
                  // Reshape-from-anywhere: no permanent anchor dots. A single handle
                  // follows the cursor along the outline — a square when it's over an
                  // existing corner (drag to move it) or a round "+" on an edge (drag
                  // to bend / add a point). Keeps the selected shape uncluttered.
                  let hoverVertex: Point | null = null;
                  let hoverEdge: Point | null = null;
                  if (editable && cursor && el.geometryType !== "count") {
                    let bv = Infinity;
                    let bvp: Point | null = null;
                    for (const pt of pts) {
                      const d = Math.hypot(pt.x - cursor.x, pt.y - cursor.y);
                      if (d < bv) { bv = d; bvp = pt; }
                    }
                    const segN = el.geometryType === "polygon" ? pts.length : pts.length - 1;
                    let be = Infinity;
                    let bep: Point | null = null;
                    for (let s = 0; s < segN; s++) {
                      const a = pts[s];
                      const b = pts[(s + 1) % pts.length];
                      const pr = projectOnSegment(cursor, a, b);
                      const d = Math.hypot(pr.x - cursor.x, pr.y - cursor.y);
                      if (d < be) { be = d; bep = pr; }
                    }
                    const band = nw * 0.06;
                    if (bvp && bv <= band && bv <= be + unit * 1.2) hoverVertex = bvp;
                    else if (bep && be <= band) hoverEdge = bep;
                  }
                  const q = elementQuantity({ ...el, points: pts }, scale);
                  if (el.geometryType === "polygon") {
                    const c = centroid(pts);
                    const ptStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
                    return (
                      <g key={el.id}>
                        <polygon
                          points={ptStr}
                          fill={meta.color}
                          fillOpacity={editable ? 0.34 : selected ? 0.3 : 0.2}
                          stroke={meta.color}
                          strokeWidth={editable ? strokeMain + 1 : selected ? strokeMain + 1.5 : strokeMain}
                          vectorEffect="non-scaling-stroke"
                        />
                        {/* mask selection outline (marching ants) */}
                        {editable && (
                          <polygon
                            points={ptStr}
                            fill="none"
                            stroke="#fff"
                            strokeWidth={strokeMain + 0.5}
                            strokeDasharray="7 6"
                            className="adicc-ants"
                            vectorEffect="non-scaling-stroke"
                            style={{ pointerEvents: "none" }}
                          />
                        )}
                        {showLabel && (
                          <text x={c.x} y={c.y} textAnchor="middle" fontSize={fontMain} fontWeight={700} fill="#0f172a" stroke="#fff" strokeWidth={fontMain * 0.16} paintOrder="stroke">
                            {el.label}
                            {q ? ` · ${round(q.value, 1)} ${q.unit}` : ""}
                          </text>
                        )}
                        {editable && hoverEdge && (
                          <g style={{ pointerEvents: "none" }}>
                            <circle cx={hoverEdge.x} cy={hoverEdge.y} r={handleR * 1.05} fill="#fff" fillOpacity={0.85} stroke={meta.color} strokeWidth={strokeMain} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                            <text x={hoverEdge.x} y={hoverEdge.y + unit * 0.6} textAnchor="middle" fontSize={fontMain * 0.9} fontWeight={800} fill={meta.color}>+</text>
                          </g>
                        )}
                        {editable && hoverVertex && (
                          <circle cx={hoverVertex.x} cy={hoverVertex.y} r={handleR} fill="#fff" stroke={meta.color} strokeWidth={strokeMain + 1} vectorEffect="non-scaling-stroke" style={{ cursor: "grab" }} />
                        )}
                      </g>
                    );
                  }
                  if (el.geometryType === "polyline") {
                    const mid = pts[Math.floor(pts.length / 2)];
                    const ptStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
                    return (
                      <g key={el.id}>
                        <polyline
                          points={ptStr}
                          fill="none"
                          stroke={meta.color}
                          strokeWidth={selected ? strokeMain + 2 : strokeMain + 1}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                        {editable && (
                          <polyline
                            points={ptStr}
                            fill="none"
                            stroke="#fff"
                            strokeWidth={strokeMain + 0.5}
                            strokeDasharray="7 6"
                            className="adicc-ants"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                            style={{ pointerEvents: "none" }}
                          />
                        )}
                        {showLabel && (
                          <text x={mid.x} y={mid.y - unit} textAnchor="middle" fontSize={fontMain} fontWeight={700} fill="#0f172a" stroke="#fff" strokeWidth={fontMain * 0.16} paintOrder="stroke">
                            {el.label}
                            {q ? ` · ${round(q.value, 1)} ${q.unit}` : ""}
                          </text>
                        )}
                        {editable && hoverEdge && (
                          <g style={{ pointerEvents: "none" }}>
                            <circle cx={hoverEdge.x} cy={hoverEdge.y} r={handleR * 1.05} fill="#fff" fillOpacity={0.85} stroke={meta.color} strokeWidth={strokeMain} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                            <text x={hoverEdge.x} y={hoverEdge.y + unit * 0.6} textAnchor="middle" fontSize={fontMain * 0.9} fontWeight={800} fill={meta.color}>+</text>
                          </g>
                        )}
                        {editable && hoverVertex && (
                          <circle cx={hoverVertex.x} cy={hoverVertex.y} r={handleR} fill="#fff" stroke={meta.color} strokeWidth={strokeMain + 1} vectorEffect="non-scaling-stroke" style={{ cursor: "grab" }} />
                        )}
                      </g>
                    );
                  }
                  // count marker — columns stay a dot; doors/windows draw as a
                  // small rectangle glyph centered on the point.
                  const p = pts[0];
                  const isColumn = el.kind === "column";
                  const rw = unit * (el.kind === "window" ? 5 : 4.4);
                  const rh = unit * 1.8;
                  return (
                    <g key={el.id}>
                      {editable && (
                        isColumn ? (
                          <circle cx={p.x} cy={p.y} r={unit * 2.4} fill="none" stroke={meta.color} strokeWidth={strokeMain} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                        ) : (
                          <rect x={p.x - rw / 2 - unit} y={p.y - rh / 2 - unit} width={rw + unit * 2} height={rh + unit * 2} rx={unit * 0.5} fill="none" stroke={meta.color} strokeWidth={strokeMain} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                        )
                      )}
                      {isColumn ? (
                        <circle cx={p.x} cy={p.y} r={selected ? unit * 1.6 : unit * 1.2} fill={meta.color} stroke="#fff" strokeWidth={strokeMain} vectorEffect="non-scaling-stroke" style={{ cursor: editable ? "grab" : "pointer" }} />
                      ) : (
                        <rect
                          x={p.x - rw / 2}
                          y={p.y - rh / 2}
                          width={rw}
                          height={rh}
                          rx={unit * 0.35}
                          fill={meta.color}
                          fillOpacity={selected ? 0.9 : 0.75}
                          stroke="#fff"
                          strokeWidth={selected ? strokeMain + 1 : strokeMain}
                          vectorEffect="non-scaling-stroke"
                          style={{ cursor: editable ? "grab" : "pointer" }}
                        />
                      )}
                      {showLabel && (
                        <text x={p.x} y={p.y - rh / 2 - unit * 1.1} textAnchor="middle" fontSize={fontMain * 0.85} fontWeight={700} fill="#0f172a" stroke="#fff" strokeWidth={fontMain * 0.14} paintOrder="stroke">
                          {el.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* AI proposals (view-only overlay) */}
                {review?.items.map((it) => {
                  if (it.decision === "rejected") return null;
                  const meta = ELEMENT_KIND_META[it.kind];
                  const hovered = hoverProposal === it.id;
                  const accepted = it.decision === "accepted";
                  const op = accepted ? 1 : 0.55;
                  if (it.geometryType === "polygon") {
                    return (
                      <polygon
                        key={it.id}
                        points={it.points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill={meta.color}
                        fillOpacity={hovered ? 0.4 : 0.18 * op + 0.05}
                        stroke={hovered ? "#f59e0b" : meta.color}
                        strokeWidth={hovered ? strokeMain + 2 : strokeMain}
                        strokeDasharray="7 4"
                        vectorEffect="non-scaling-stroke"
                        style={{ pointerEvents: "none" }}
                      />
                    );
                  }
                  if (it.geometryType === "polyline") {
                    return (
                      <polyline
                        key={it.id}
                        points={it.points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke={hovered ? "#f59e0b" : meta.color}
                        strokeWidth={hovered ? strokeMain + 3 : strokeMain + 1}
                        strokeDasharray="7 4"
                        strokeOpacity={op}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        style={{ pointerEvents: "none" }}
                      />
                    );
                  }
                  const p = it.points[0];
                  return (
                    <circle
                      key={it.id}
                      cx={p.x}
                      cy={p.y}
                      r={hovered ? unit * 1.8 : unit * 1.2}
                      fill={meta.color}
                      fillOpacity={op}
                      stroke={hovered ? "#f59e0b" : "#fff"}
                      strokeWidth={strokeMain}
                      strokeDasharray="4 2"
                      vectorEffect="non-scaling-stroke"
                      style={{ pointerEvents: "none" }}
                    />
                  );
                })}

                {/* Draft polygon/polyline (live preview) */}
                {draft.length > 0 && (() => {
                  const isArea = tool === "area";
                  const color = isArea ? "#22c55e" : "#3b82f6";
                  const nearFirst =
                    isArea && draft.length >= 3 && !!cursor && Math.hypot(cursor.x - draft[0].x, cursor.y - draft[0].y) < unit * 2.5;
                  // While closing, snap the live edge onto the first point.
                  const tip = nearFirst ? draft[0] : cursor;
                  const preview = tip ? [...draft, tip] : draft;
                  const ptStr = preview.map((p) => `${p.x},${p.y}`).join(" ");
                  const areaVal = isArea && scale && preview.length >= 3 ? areaToM2(polygonAreaPx(preview), scale) : null;
                  const c = isArea && preview.length >= 3 ? centroid(preview) : null;
                  return (
                    <g>
                      {isArea ? (
                        <>
                          <polygon points={ptStr} fill={color} fillOpacity={0.22} stroke="none" />
                          <polygon
                            points={ptStr}
                            fill="none"
                            stroke={color}
                            strokeWidth={strokeMain}
                            strokeDasharray="6 4"
                            className="adicc-ants"
                            vectorEffect="non-scaling-stroke"
                          />
                          {c && (
                            <text x={c.x} y={c.y} textAnchor="middle" fontSize={fontMain} fontWeight={700} fill="#0f172a" stroke="#fff" strokeWidth={fontMain * 0.16} paintOrder="stroke">
                              {areaVal != null ? `${round(areaVal, 1)} m²` : `${draft.length} pt${draft.length === 1 ? "" : "s"}`}
                            </text>
                          )}
                        </>
                      ) : (
                        <polyline points={ptStr} fill="none" stroke={color} strokeWidth={strokeMain} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                      )}
                      {draft.map((p, i) => (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r={i === 0 && nearFirst ? unit * 1.5 : unit * 0.8}
                          fill={i === 0 && nearFirst ? color : "#fff"}
                          stroke={color}
                          strokeWidth={strokeMain}
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                      {nearFirst && (
                        <circle cx={draft[0].x} cy={draft[0].y} r={unit * 2.6} fill="none" stroke={color} strokeWidth={strokeMain} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                      )}
                    </g>
                  );
                })()}

                {/* Two-point (calibrate/verify) */}
                {twoPoint.length > 0 && (
                  <g>
                    <line
                      x1={twoPoint[0].x}
                      y1={twoPoint[0].y}
                      x2={(cursor ?? twoPoint[0]).x}
                      y2={(cursor ?? twoPoint[0]).y}
                      stroke="#f59e0b"
                      strokeWidth={strokeMain}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                    {twoPoint.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={unit} fill="#f59e0b" stroke="#fff" strokeWidth={strokeMain} vectorEffect="non-scaling-stroke" />
                    ))}
                  </g>
                )}
              </svg>
            </div>

            {/* Toast */}
            {toast && (
              <div
                className={cn(
                  "absolute bottom-3 left-1/2 z-10 max-w-[90%] -translate-x-1/2 rounded-lg px-3 py-2 text-xs font-medium shadow-lg",
                  toast.kind === "error" ? "bg-destructive text-destructive-foreground" : "bg-emerald-600 text-white"
                )}
              >
                {toast.msg}
              </div>
            )}
          </div>
        </div>

        {/* Below-workspace panels */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {review && (
            <div className="rounded-xl border border-primary/40 bg-card lg:col-span-2">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-card-foreground">
                  <Sparkles className="h-4 w-4 text-primary" /> Detected proposals
                  <Badge variant="secondary" className="ml-1 gap-1 font-normal">
                    {review.engine === "api" ? "Online" : "In-browser"}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReview(null);
                    setHoverProposal(null);
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Discard proposals"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2 p-3">
                {review.warnings.length > 0 && (
                  <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
                    {review.warnings.map((w, i) => (
                      <p key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-500">
                        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                      </p>
                    ))}
                  </div>
                )}

                {review.scale && (
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border bg-muted/30 p-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={review.applyScale}
                      onChange={(e) => setReview((r) => (r ? { ...r, applyScale: e.target.checked } : r))}
                    />
                    <span>
                      <span className="font-medium text-foreground">
                        Apply detected scale (1 m ≈ {round(1 / review.scale.metersPerPixel, 0)} px)
                      </span>
                      <span className="block text-muted-foreground">
                        {review.scale.method === "dxf-native" ? "From CAD units" : "Suggested"} ·{" "}
                        {Math.round(review.scale.confidence * 100)}% confidence
                      </span>
                    </span>
                  </label>
                )}

                {review.items.length > 0 && (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {review.items.filter((i) => i.decision === "accepted").length} of {review.items.length} selected
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setAllDecisions("accepted")}
                          className="rounded px-1.5 py-0.5 text-primary hover:bg-primary/10"
                        >
                          Accept all
                        </button>
                        <button
                          type="button"
                          onClick={() => setAllDecisions("rejected")}
                          className="rounded px-1.5 py-0.5 text-destructive hover:bg-destructive/10"
                        >
                          Reject all
                        </button>
                      </div>
                    </div>

                    <div className="max-h-[280px] space-y-1 overflow-auto">
                      {review.items.map((it) => (
                        <div
                          key={it.id}
                          onMouseEnter={() => setHoverProposal(it.id)}
                          onMouseLeave={() => setHoverProposal(null)}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors",
                            it.decision === "rejected" ? "border-transparent opacity-45" : "border-border",
                            hoverProposal === it.id && "bg-primary/5"
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ELEMENT_KIND_META[it.kind].color }} />
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate font-medium text-card-foreground">{it.label}</span>
                                {it.kind === "room" && it.roomType && it.roomType !== "generic" && (
                                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {ROOM_TYPE_META[it.roomType].label}
                                  </span>
                                )}
                              </span>
                              <span className="block text-[10px] text-muted-foreground">
                                {Math.round(it.confidence * 100)}% · {it.source}
                                {it.layer ? ` · ${it.layer}` : ""}
                                {(() => {
                                  if (it.kind !== "room") return null;
                                  const dims = roomDimensionsM(it.points, scale);
                                  if (it.printedDimensions) return ` · ${it.printedDimensions}`;
                                  if (dims) return ` · ${round(dims.widthM, 1)}×${round(dims.lengthM, 1)} m`;
                                  return null;
                                })()}
                              </span>
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDecision(it.id, it.decision === "accepted" ? "pending" : "accepted")}
                              className={cn(
                                "rounded p-1",
                                it.decision === "accepted"
                                  ? "bg-emerald-600 text-white"
                                  : "text-muted-foreground hover:bg-emerald-600/10 hover:text-emerald-600"
                              )}
                              aria-label="Accept"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDecision(it.id, it.decision === "rejected" ? "pending" : "rejected")}
                              className={cn(
                                "rounded p-1",
                                it.decision === "rejected"
                                  ? "bg-destructive text-destructive-foreground"
                                  : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              )}
                              aria-label="Reject"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="flex items-center gap-2 border-t pt-2">
                  <Button size="sm" className="flex-1" onClick={applyReview}>
                    <Check className="h-4 w-4" />
                    Add {review.items.filter((i) => i.decision === "accepted").length} item
                    {review.items.filter((i) => i.decision === "accepted").length === 1 ? "" : "s"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReview(null);
                      setHoverProposal(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {needsScale && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 lg:col-span-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-500">
                <TriangleAlert className="h-4 w-4" /> Scale required
              </p>
              <p className="mt-1 text-xs text-amber-700/90 dark:text-amber-500/90">
                This floor has area/length takeoffs but no scale, so their quantities are excluded. Use{" "}
                <strong>Set scale</strong> on a known dimension, then <strong>Verify</strong>.
              </p>
              <Button size="sm" className="mt-2" onClick={() => setTool("calibrate")}>
                <Ruler className="h-4 w-4" /> Set scale now
              </Button>
            </div>
          )}

          {/* BOQ */}
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <p className="text-sm font-semibold text-card-foreground">Bill of Quantities</p>
              <div className="flex items-center gap-2">
                <div className="flex overflow-hidden rounded-md border text-[11px]">
                  <button
                    type="button"
                    onClick={() => setBoqView("trade")}
                    className={cn("px-2 py-1 font-medium transition-colors", boqView === "trade" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                  >
                    Trades
                  </button>
                  <button
                    type="button"
                    onClick={() => setBoqView("material")}
                    className={cn("px-2 py-1 font-medium transition-colors", boqView === "material" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                  >
                    Materials
                  </button>
                </div>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={!boq || boq.lines.length === 0}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
              </div>
            </div>
            <div className="p-3">
              {boq && boq.lines.length > 0 ? (
                <>
                  {boqView === "trade" ? (
                    <div className="space-y-2.5">
                      {boq.lines.map((l) => (
                        <div key={l.id} className="text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 font-medium text-card-foreground">
                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ELEMENT_KIND_META[l.kind].color }} />
                                <span className="truncate">{l.description}</span>
                                {l.itemCount > 1 && <span className="shrink-0 text-[10px] text-muted-foreground">×{l.itemCount}</span>}
                              </p>
                              <p className="mt-0.5 text-muted-foreground">
                                {round(l.quantity, 2).toLocaleString()} {l.unit} × AED {round(l.rate, 2).toLocaleString()}
                                {l.unit !== "No." ? " (incl. 5% waste)" : ""}
                              </p>
                            </div>
                            <p className="shrink-0 font-semibold tabular-nums text-card-foreground">
                              {formatAED(Math.round(l.amount))}
                            </p>
                          </div>
                          {/* Material build-up for this line */}
                          {l.materials.length > 0 && (
                            <div className="ml-3.5 mt-1 space-y-0.5 border-l border-dashed border-border pl-2">
                              {l.materials.map((m) => (
                                <div key={m.key} className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                                  <span className="truncate">
                                    {m.label} · {round(m.quantity, 2).toLocaleString()} {m.unit}
                                  </span>
                                  <span className="shrink-0 tabular-nums">{formatAED(Math.round(m.amount))}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {boq.materials.map((m) => (
                        <div key={m.key} className="flex items-start justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-card-foreground">{m.label}</p>
                            <p className="mt-0.5 text-muted-foreground">
                              {round(m.quantity, 2).toLocaleString()} {m.unit} × AED {round(m.rate, 2).toLocaleString()}
                            </p>
                          </div>
                          <p className="shrink-0 font-semibold tabular-nums text-card-foreground">{formatAED(Math.round(m.amount))}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t pt-2">
                    <p className="text-sm font-semibold text-card-foreground">Floor subtotal</p>
                    <p className="text-base font-bold text-primary">{formatAED(Math.round(boq.subtotal))}</p>
                  </div>
                  {boq.unmeasuredCount > 0 && (
                    <p className="mt-2 text-[11px] text-amber-600">
                      {boq.unmeasuredCount} item{boq.unmeasuredCount === 1 ? "" : "s"} excluded (need scale).
                    </p>
                  )}
                </>
              ) : (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No quantities yet. Run Auto-Takeoff or use the tools to mark rooms, walls and counts.
                </p>
              )}
              <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                Costs are built up from live material rates (updated daily) × measured quantities. Edit any material rate in{" "}
                <strong>Rates &amp; items</strong> on the project page.
              </p>
            </div>
          </div>

          {/* Elements */}
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <p className="text-sm font-semibold text-card-foreground">
                Takeoff items ({elements.length})
              </p>
              {focusId ? (
                <button
                  type="button"
                  onClick={exitFocus}
                  className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Eye className="h-3 w-3" /> Show all
                </button>
              ) : (
                <span className="text-[10px] text-muted-foreground">Click a row to isolate &amp; edit</span>
              )}
            </div>
            <div className="max-h-[240px] overflow-auto p-2">
              {elements.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Nothing marked yet.</p>
              ) : (
                <div className="space-y-1">
                  {elements.map((el) => {
                    const q = elementQuantity(el, scale);
                    return (
                      <div
                        key={el.id}
                        onClick={() => focusElement(el.id)}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                          focusId === el.id
                            ? "bg-primary/15 ring-1 ring-primary/40"
                            : selectedId === el.id
                              ? "bg-primary/10"
                              : "hover:bg-muted"
                        )}
                        title="Click to isolate & edit this on the map"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ELEMENT_KIND_META[el.kind].color }} />
                          <span className="min-w-0">
                            {renamingId === el.id ? (
                              <input
                                autoFocus
                                value={renameValue}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={() => commitRename(el.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitRename(el.id);
                                  if (e.key === "Escape") {
                                    setRenamingId(null);
                                    setRenameValue("");
                                  }
                                }}
                                className="w-full rounded border border-primary/50 bg-background px-1 py-0.5 text-xs font-medium text-foreground outline-none"
                              />
                            ) : (
                              <span className="block truncate font-medium text-card-foreground">{el.label}</span>
                            )}
                            {el.kind === "room" && (() => {
                              const dims = roomDimensionsM(el.points, scale);
                              const txt = el.printedDimensions ?? (dims ? `${round(dims.widthM, 1)}×${round(dims.lengthM, 1)} m` : null);
                              if (!txt && (!el.roomType || el.roomType === "generic")) return null;
                              return (
                                <span className="block text-[10px] text-muted-foreground">
                                  {el.roomType && el.roomType !== "generic" ? ROOM_TYPE_META[el.roomType].label : ""}
                                  {el.roomType && el.roomType !== "generic" && txt ? " · " : ""}
                                  {txt ?? ""}
                                </span>
                              );
                            })()}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="tabular-nums text-muted-foreground">
                            {q ? `${round(q.value, 1)} ${q.unit}` : "— (scale)"}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingId(el.id);
                              setRenameValue(el.label);
                            }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Rename"
                            title="Rename"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              commitElements(elements.filter((x) => x.id !== el.id));
                              if (selectedId === el.id) setSelectedId(null);
                              if (focusId === el.id) setFocusId(null);
                            }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Finish (label) modal */}
      <Modal
        open={!!finishModal}
        onClose={() => setFinishModal(null)}
        title={finishModal?.type === "wall" ? "Label wall run" : "Label room / area"}
      >
        {finishModal && (
          <div className="space-y-3">
            <label className="space-y-1 block">
              <span className="text-xs font-medium text-foreground">Name</span>
              <Input
                autoFocus
                value={finishModal.label}
                onChange={(e) => setFinishModal({ ...finishModal, label: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && confirmFinish()}
              />
            </label>
            {finishModal.type === "room" && (
              <label className="space-y-1 block">
                <span className="text-xs font-medium text-foreground">Type / finish package (materials)</span>
                <select
                  value={finishModal.roomType}
                  onChange={(e) => setFinishModal({ ...finishModal, roomType: e.target.value as RoomType })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  {(Object.keys(ROOM_TYPE_META) as RoomType[]).map((rt) => (
                    <option key={rt} value={rt}>
                      {ROOM_TYPE_META[rt].label}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-muted-foreground">
                  {ROOM_TYPE_META[finishModal.roomType].description}. Fine-tune material rates in <strong>Rates &amp; items</strong>.
                </span>
              </label>
            )}
            {finishModal.type === "wall" && (
              <label className="space-y-1 block">
                <span className="text-xs font-medium text-foreground">Clear wall height (m)</span>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={finishModal.wallHeight}
                  onChange={(e) => setFinishModal({ ...finishModal, wallHeight: parseFloat(e.target.value) || 0 })}
                />
                <span className="text-[11px] text-muted-foreground">
                  Height × run length = wall area. Set 0 to keep it as a linear length only.
                </span>
              </label>
            )}
            {finishModal.type === "wall" && scale && (
              <p className="text-xs text-muted-foreground">
                Run length: <strong>{round(lengthToM(polylineLengthPx(finishModal.points), scale), 2)} m</strong>
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFinishModal(null)}>Cancel</Button>
              <Button onClick={confirmFinish}>Add item</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Calibration modal */}
      <Modal
        open={!!calibModal}
        onClose={() => setCalibModal(null)}
        title="Set drawing scale"
        description="You measured a line on the drawing. Enter its true real-world length."
      >
        {calibModal && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Measured pixel distance: <strong>{round(calibModal.pixelDist, 0)} px</strong>
            </p>
            <label className="space-y-1 block">
              <span className="text-xs font-medium text-foreground">Real length of this line (metres)</span>
              <Input
                autoFocus
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 6.00"
                value={calibModal.known}
                onChange={(e) => setCalibModal({ ...calibModal, known: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && confirmCalibration()}
              />
            </label>
            {calibModal.known && parseFloat(calibModal.known) > 0 && (
              <p className="text-xs text-primary">
                Resulting scale: 1 m ≈ {round(calibModal.pixelDist / parseFloat(calibModal.known), 0)} px
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCalibModal(null)}>Cancel</Button>
              <Button onClick={confirmCalibration}>Set scale</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Verify modal */}
      <Modal
        open={!!verifyModal}
        onClose={() => setVerifyModal(null)}
        title="Verify scale"
        description="Check the current scale against a second known dimension."
      >
        {verifyModal && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Measured length at current scale:{" "}
              <strong>{round(verifyModal.measuredM, 2)} m</strong>
            </p>
            <label className="space-y-1 block">
              <span className="text-xs font-medium text-foreground">Expected real length (metres)</span>
              <Input
                autoFocus
                type="number"
                step="0.01"
                min="0"
                value={verifyModal.expected}
                onChange={(e) => setVerifyModal({ ...verifyModal, expected: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && confirmVerify()}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setVerifyModal(null)}>Cancel</Button>
              <Button onClick={confirmVerify}>Check</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* AI engine settings modal */}
      <Modal
        open={showAiSettings}
        onClose={() => setShowAiSettings(false)}
        title="Takeoff Engine"
        description="Choose how ADICC detects rooms, walls, doors, and windows on this drawing."
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => store.updateSettings({ engine: "local" })}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                store.settings.engine === "local" ? "border-primary bg-primary/5" : "hover:bg-muted"
              )}
            >
              <Laptop className="mt-0.5 h-5 w-5 text-primary" />
              <span>
                <span className="block text-sm font-medium text-foreground">Standard (recommended)</span>
                <span className="block text-xs text-muted-foreground">
                  Fast, private takeoff that runs instantly in your browser — no setup, nothing to configure.
                </span>
              </span>
              {store.settings.engine === "local" && <Check className="ml-auto h-4 w-4 text-primary" />}
            </button>

            <button
              type="button"
              onClick={() => store.updateSettings({ engine: "api" })}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                store.settings.engine === "api" ? "border-primary bg-primary/5" : "hover:bg-muted"
              )}
            >
              <Cloud className="mt-0.5 h-5 w-5 text-primary" />
              <span>
                <span className="block text-sm font-medium text-foreground">Advanced (enhanced)</span>
                <span className="block text-xs text-muted-foreground">
                  Higher-accuracy detection with assisted room labeling for scanned or photographed drawings. Falls back to Standard if unavailable.
                </span>
              </span>
              {store.settings.engine === "api" && <Check className="ml-auto h-4 w-4 text-primary" />}
            </button>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setShowAiSettings(false)}>Done</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
