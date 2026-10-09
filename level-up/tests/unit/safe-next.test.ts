import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext (open-redirect guard)", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/quests?view=backlog")).toBe("/quests?view=backlog");
    expect(safeNext("/")).toBe("/");
  });
  it("rejects anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "", null, undefined, 42, "/ok\r\nSet-Cookie: x=1"]) {
      expect(safeNext(bad as unknown)).toBe("/");
    }
  });
  it("never bounces back to the login screens", () => {
    expect(safeNext("/login?next=/x")).toBe("/");
    expect(safeNext("/signup")).toBe("/");
  });
});
