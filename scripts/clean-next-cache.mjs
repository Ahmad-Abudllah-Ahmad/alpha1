import fs from "node:fs";
import path from "node:path";

const nextDir = path.join(process.cwd(), ".next");

if (!fs.existsSync(nextDir)) {
  process.exit(0);
}

const maxAttempts = 5;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    fs.rmSync(nextDir, { recursive: true, force: true });
    process.exit(0);
  } catch (error) {
    if (attempt === maxAttempts) {
      console.error(
        "[clean-next-cache] Could not remove .next. Stop all `next dev` processes, then run again."
      );
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
    // Windows can keep chunk files locked briefly while dev reloads.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
  }
}
