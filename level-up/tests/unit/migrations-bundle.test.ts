import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without types
import { render } from "../../scripts/gen-sql.mjs";

describe("migrations bundle", () => {
  it("src/db/migrations.generated.ts is up to date with supabase/migrations (run `npm run gen:sql`)", () => {
    const committed = readFileSync(path.resolve(__dirname, "../../src/db/migrations.generated.ts"), "utf8");
    expect(committed).toBe(render());
  });
});
