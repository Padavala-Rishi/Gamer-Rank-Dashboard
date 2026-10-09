import { execFileSync } from "node:child_process";
import path from "node:path";

// The DB tests run against the real local Postgres (see scripts/test-stack.mjs).
export default function setup() {
  execFileSync(process.execPath, [path.resolve(__dirname, "../../scripts/test-stack.mjs"), "up"], { stdio: "inherit" });
}
