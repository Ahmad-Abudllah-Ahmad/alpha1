import type { AiSettings } from "../store";
import type { Floor } from "../types";
import type { TakeoffProposal } from "./schema";
import { localDetectTakeoff } from "./localProvider";
import { apiDetectTakeoff } from "./apiProvider";

export interface TakeoffProvider {
  id: "local" | "api";
  name: string;
  detectTakeoff: (floor: Floor) => Promise<TakeoffProposal>;
}

/**
 * Runs detection using the selected engine. When "api" is chosen but the
 * backend is unreachable, we fall back to the in-browser engine and add a
 * warning so the user always gets a result.
 */
export async function runTakeoff(floor: Floor, settings: AiSettings): Promise<TakeoffProposal> {
  if (settings.engine === "api") {
    try {
      return await apiDetectTakeoff(floor, settings.backendUrl);
    } catch (err) {
      const local = await localDetectTakeoff(floor);
      const reason = err instanceof Error ? err.message : "backend unreachable";
      return {
        ...local,
        warnings: [
          `Cloud engine unavailable (${reason}) — using Standard engine instead.`,
          ...local.warnings,
        ],
      };
    }
  }
  return localDetectTakeoff(floor);
}
