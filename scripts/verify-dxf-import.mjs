/**
 * CAD import regression checks for the DXF/DWG shared parser path.
 *
 * Run from client root:
 *   node scripts/verify-dxf-import.mjs [path/to/file-or-folder]
 */
import fs from "fs";
import os from "os";
import path from "path";
import { default as DxfParser } from "dxf-parser";

const MAX_DIM = 2000;
const inputPath =
  process.argv[2] || path.join(os.homedir(), "Downloads", "giraffe360_demo_residential.dxf");

const DWG_VERSION_LABELS = {
  AC1015: "AutoCAD 2000",
  AC1018: "AutoCAD 2004",
  AC1021: "AutoCAD 2007",
  AC1024: "AutoCAD 2010",
  AC1027: "AutoCAD 2013",
  AC1032: "AutoCAD 2018+",
};

function expand(b, x, y) {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}

function emptyBBox() {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function bboxDiag(b) {
  return Math.hypot(Math.max(0, b.maxX - b.minX), Math.max(0, b.maxY - b.minY));
}

function bboxArea(b) {
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
}

function bboxCenter(b) {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

function getPoint(value) {
  return value &&
    typeof value === "object" &&
    typeof value.x === "number" &&
    typeof value.y === "number"
    ? { x: value.x, y: value.y }
    : null;
}

function normalizeRotationRad(rotation) {
  if (typeof rotation !== "number" || !Number.isFinite(rotation)) return 0;
  return Math.abs(rotation) > Math.PI * 2 ? (rotation * Math.PI) / 180 : rotation;
}

function transformPoint(point, transform) {
  const x = (point.x - transform.base.x) * transform.scaleX;
  const y = (point.y - transform.base.y) * transform.scaleY;
  const cos = Math.cos(transform.rotationRad);
  const sin = Math.sin(transform.rotationRad);
  return {
    x: transform.origin.x + x * cos - y * sin,
    y: transform.origin.y + x * sin + y * cos,
  };
}

function getEntityPoint(entity, keys) {
  for (const key of keys) {
    const point = getPoint(entity?.[key]);
    if (point) return point;
  }
  return null;
}

function forEachPointList(value, cb) {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const point = getPoint(item);
    if (point) cb(point.x, point.y);
  }
}

function forEachArcPoint(entity, cb) {
  const c = getPoint(entity.center);
  const radius = typeof entity.radius === "number" ? entity.radius : 0;
  if (!c || radius <= 0) return;
  let start = normalizeRotationRad(entity.startAngle ?? 0);
  let end = normalizeRotationRad(entity.endAngle ?? Math.PI * 2);
  const span = end >= start ? end - start : end + Math.PI * 2 - start;
  const steps = Math.max(8, Math.ceil(span / (Math.PI / 12)));
  for (let i = 0; i <= steps; i++) {
    const angle = start + (span * i) / steps;
    cb(c.x + Math.cos(angle) * radius, c.y + Math.sin(angle) * radius);
  }
}

function forEachVertex(entity, cb) {
  const type = entity?.type;
  if (type === "LINE" || type === "LWPOLYLINE" || type === "POLYLINE") {
    forEachPointList(entity.vertices, cb);
    const start = getEntityPoint(entity, ["startPoint", "start", "p1"]);
    const end = getEntityPoint(entity, ["endPoint", "end", "p2"]);
    if (start && end) {
      cb(start.x, start.y);
      cb(end.x, end.y);
    }
  } else if (type === "CIRCLE") {
    const c = entity.center;
    const r = entity.radius || 0;
    if (c) {
      cb(c.x - r, c.y - r);
      cb(c.x + r, c.y + r);
    }
  } else if (type === "ARC") {
    forEachArcPoint(entity, cb);
  } else if (type === "SPLINE") {
    forEachPointList(entity.fitPoints, cb);
    forEachPointList(entity.controlPoints, cb);
  } else if (type === "TEXT" || type === "MTEXT") {
    const p = getEntityPoint(entity, ["startPoint", "position"]);
    if (p) cb(p.x, p.y);
  }
}

function entityBBox(entity) {
  const b = emptyBBox();
  let has = false;
  forEachVertex(entity, (x, y) => {
    expand(b, x, y);
    has = true;
  });
  return has && Number.isFinite(b.minX) && b.maxX > b.minX && b.maxY > b.minY ? b : null;
}

function makeInsertTransform(insert, block) {
  return {
    origin: getPoint(insert.position) ?? { x: 0, y: 0 },
    base: getPoint(block?.position) ?? getPoint(block?.basePoint) ?? { x: 0, y: 0 },
    scaleX: typeof insert.xScale === "number" ? insert.xScale : 1,
    scaleY: typeof insert.yScale === "number" ? insert.yScale : 1,
    rotationRad: normalizeRotationRad(insert.rotation),
  };
}

function transformEntity(e, transform) {
  if (e.type === "LINE" || e.type === "LWPOLYLINE" || e.type === "POLYLINE") {
    return {
      ...e,
      vertices: (e.vertices || []).map((v) => ({ ...v, ...transformPoint(v, transform) })),
    };
  }
  if (e.type === "TEXT" || e.type === "MTEXT") {
    const p = e.startPoint || e.position || { x: 0, y: 0 };
    const point = transformPoint(p, transform);
    return { ...e, startPoint: point, position: point };
  }
  return e;
}

function flattenEntities(entities, blocks, depth = 0) {
  if (depth > 8) return entities;
  const out = [];
  for (const e of entities) {
    if (e?.type === "INSERT" && e.position) {
      const block = blocks?.[e.name];
      if (block?.entities?.length) {
        const transform = makeInsertTransform(e, block);
        const flattenedBlock = flattenEntities(block.entities, blocks, depth + 1);
        out.push(...flattenedBlock.filter((be) => be?.type !== "INSERT").map((be) => transformEntity(be, transform)));
        continue;
      }
    }
    out.push(e);
  }
  return out;
}

function computeEntitiesBBox(entities) {
  const b = emptyBBox();
  for (const e of entities) {
    const eb = entityBBox(e);
    if (eb) {
      expand(b, eb.minX, eb.minY);
      expand(b, eb.maxX, eb.maxY);
    }
  }
  return b;
}

function entityInCluster(entity, cluster, pad) {
  const eb = entityBBox(entity);
  if (!eb) return false;
  const cx = (eb.minX + eb.maxX) / 2;
  const cy = (eb.minY + eb.maxY) / 2;
  return cx >= cluster.minX - pad && cx <= cluster.maxX + pad && cy >= cluster.minY - pad && cy <= cluster.maxY + pad;
}

function isConfidentMultiPlanSplit(regions, entities, overall) {
  if (regions.length < 2 || regions.length > 6) return false;
  const span = Math.max(overall.maxX - overall.minX, overall.maxY - overall.minY);
  const pad = 0.04 * span;
  const counts = regions.map((r) => entities.filter((e) => entityInCluster(e, r, pad)).length);
  const totalAssigned = counts.reduce((sum, n) => sum + n, 0);
  const minRequired = Math.max(15, Math.round(entities.length * 0.12));
  if (Math.min(...counts) < minRequired) return false;
  if (Math.max(...counts) > entities.length * 0.6) return false;
  if (totalAssigned < entities.length * 0.8) return false;
  const areas = regions.map(bboxArea).sort((a, b) => a - b);
  return areas[0] >= areas[areas.length - 1] * 0.1;
}

function detectPlanRegions(entities, overall) {
  const overallDiag = bboxDiag(overall);
  if (overallDiag <= 0) return [overall];
  const boxed = entities.map((entity) => ({ bbox: entityBBox(entity) })).filter(({ bbox }) => bbox);
  if (boxed.length < 8) return [overall];
  const seeds = boxed.filter(({ bbox }) => bboxDiag(bbox) <= overallDiag * 0.32);
  if (seeds.length < 8) return [overall];
  const spanW = overall.maxX - overall.minX;
  const spanH = overall.maxY - overall.minY;
  const GH = 200;
  const GW = Math.max(40, Math.min(400, Math.round((GH * spanW) / spanH)));
  const grid = new Uint8Array(GW * GH);
  for (const { bbox } of seeds) {
    const x0 = Math.max(0, Math.floor(((bbox.minX - overall.minX) / spanW) * GW));
    const x1 = Math.min(GW - 1, Math.floor(((bbox.maxX - overall.minX) / spanW) * GW));
    const y0 = Math.max(0, Math.floor(((bbox.minY - overall.minY) / spanH) * GH));
    const y1 = Math.min(GH - 1, Math.floor(((bbox.maxY - overall.minY) / spanH) * GH));
    for (let gy = y0; gy <= y1; gy++) {
      const row = gy * GW;
      for (let gx = x0; gx <= x1; gx++) grid[row + gx] = 1;
    }
  }
  const visited = new Uint8Array(GW * GH);
  const comps = [];
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const start = gy * GW + gx;
      if (!grid[start] || visited[start]) continue;
      const comp = { minGX: gx, maxGX: gx, minGY: gy, maxGY: gy, cells: 0 };
      const stack = [start];
      visited[start] = 1;
      while (stack.length) {
        const cur = stack.pop();
        const cx = cur % GW;
        const cy = (cur - cx) / GW;
        comp.cells++;
        if (cx < comp.minGX) comp.minGX = cx;
        if (cx > comp.maxGX) comp.maxGX = cx;
        if (cy < comp.minGY) comp.minGY = cy;
        if (cy > comp.maxGY) comp.maxGY = cy;
        for (const next of [cur - 1, cur + 1, cur - GW, cur + GW]) {
          if (next >= 0 && next < grid.length && grid[next] && !visited[next]) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
      comps.push(comp);
    }
  }
  if (comps.length < 2) return [overall];
  let regions = comps.map((c) => ({
    minX: overall.minX + (c.minGX / GW) * spanW,
    maxX: overall.minX + ((c.maxGX + 1) / GW) * spanW,
    minY: overall.minY + (c.minGY / GH) * spanH,
    maxY: overall.minY + ((c.maxGY + 1) / GH) * spanH,
  }));
  const areas = regions.map(bboxArea).sort((a, b) => a - b);
  const median = areas[Math.floor(areas.length / 2)] || areas[0];
  regions = regions.filter((r) => bboxArea(r) >= Math.max(median * 0.15, overallDiag * overallDiag * 0.0004));
  if (regions.length < 2) return [overall];
  const totalArea = bboxArea(overall);
  if (regions.some((r) => bboxArea(r) > totalArea * 0.55)) return [overall];
  if (regions.reduce((sum, r) => sum + bboxArea(r), 0) < totalArea * 0.15) return [overall];
  if (!isConfidentMultiPlanSplit(regions, entities, overall)) return [overall];
  return regions.sort((a, b) => bboxCenter(b).y - bboxCenter(a).y || bboxCenter(a).x - bboxCenter(b).x);
}

function analyzeDxfText(text) {
  const dxf = new DxfParser().parseSync(text);
  const entities = flattenEntities(dxf.entities || [], dxf.blocks || {});
  const bbox = computeEntitiesBBox(entities);
  const clusters = detectPlanRegions(entities, bbox);
  const drawW = bbox.maxX - bbox.minX;
  const drawH = bbox.maxY - bbox.minY;
  const pxScale = Math.min(MAX_DIM / (drawW * 1.08), MAX_DIM / (drawH * 1.08));
  return {
    entities: entities.length,
    bbox,
    clusters,
    canvas: { width: Math.round(drawW * pxScale), height: Math.round(drawH * pxScale) },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function listCadInputs(targetPath) {
  if (!fs.existsSync(targetPath)) return [];
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];
  return fs
    .readdirSync(targetPath)
    .filter((name) => /\.(dxf|dwg)$/i.test(name))
    .map((name) => path.join(targetPath, name));
}

function inspectDwg(filePath) {
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(6);
  fs.readSync(fd, buffer, 0, 6, 0);
  fs.closeSync(fd);
  const code = buffer.toString("ascii");
  const label = DWG_VERSION_LABELS[code] || "unknown/new DWG";
  const isDemoSafe = code && code !== "AC1032" && code in DWG_VERSION_LABELS;
  console.log(
    `dwg:${path.basename(filePath)} version=${code || "unknown"} (${label}) ${isDemoSafe ? "CHECK-BACKEND" : "RISKY-CONVERT-TO-DXF"}`
  );
  return { code, label, isDemoSafe };
}

function makeSyntheticBlockDxf() {
  return `0
SECTION
2
HEADER
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
BLOCKS
0
BLOCK
2
ROOM
10
0
20
0
0
LWPOLYLINE
90
4
70
1
10
0
20
0
10
4000
20
0
10
4000
20
3000
10
0
20
3000
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
2
ROOM
10
10000
20
5000
41
1
42
1
50
90
0
ENDSEC
0
EOF`;
}

function runCase(name, text, expectations) {
  const result = analyzeDxfText(text);
  console.log(`${name}: entities=${result.entities} clusters=${result.clusters.length} canvas=${result.canvas.width}x${result.canvas.height}`);
  if (expectations.clusters != null) {
    assert(result.clusters.length === expectations.clusters, `${name}: expected ${expectations.clusters} cluster(s), got ${result.clusters.length}`);
  }
  if (expectations.minEntities != null) {
    assert(result.entities >= expectations.minEntities, `${name}: expected at least ${expectations.minEntities} entities, got ${result.entities}`);
  }
  assert(result.canvas.width > 100 && result.canvas.height > 100, `${name}: canvas is too small`);
}

const inputs = listCadInputs(inputPath);
let checkedRealDxf = false;
let riskyDwgCount = 0;

if (inputs.length > 0) {
  for (const filePath of inputs) {
    if (/\.dwg$/i.test(filePath)) {
      const result = inspectDwg(filePath);
      if (!result.isDemoSafe) riskyDwgCount++;
      continue;
    }

    runCase(`real:${path.basename(filePath)}`, fs.readFileSync(filePath, "utf8"), {
      clusters: 1,
      minEntities: 1,
    });
    checkedRealDxf = true;
  }
} else {
  console.warn(`Skipping real CAD case; file/folder not found or has no CAD files: ${inputPath}`);
}

runCase("synthetic:rotated-block", makeSyntheticBlockDxf(), {
  clusters: 1,
  minEntities: 1,
});

if (riskyDwgCount > 0) {
  console.warn(`WARN: ${riskyDwgCount} DWG file(s) are risky for browser demo. Export those to ASCII DXF before presenting.`);
}

console.log(`PASS: CAD import checks passed${checkedRealDxf ? "" : " (no real DXF parsed)"}`);
