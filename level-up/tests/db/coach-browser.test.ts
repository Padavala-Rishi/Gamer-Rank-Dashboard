import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { askCoach, clearApiKey, getApiKey, previewCoachContext, saveApiKey } from "@/lib/coach/browser";
import type { CoachClient, CoachResult } from "@/lib/coach/run";
import { LOCAL_USER_ID } from "@/db/bootstrap";
import { useDatabase } from "@/db/client";
import { notifyChange } from "@/db/events";
import { userExecutor } from "@/db/open";
import { makeClient } from "@/db/shim";
import { admin, pg } from "./helpers";

useDatabase(pg);
const db = makeClient(userExecutor(pg));
afterAll(() => admin.end());

const store = new Map<string, string>();
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } as Storage;
});

const ANSWER: CoachResult = { headline: "Do the shooting drill", summary: "You have 3 quests today.", insights: [], actions: [], caution: null };
const seen: { key?: string; body?: Record<string, unknown> }[] = [];
const fake = (key: string): CoachClient => ({ beta: { messages: { parse: async (body) => { seen.push({ key, body }); return { stop_reason: "end_turn", parsed_output: ANSWER }; } } } });
const KEY = "sk-ant-api03-" + "x".repeat(40);

describe("coach with your own key, from the browser", () => {
  it("validates and stores the key locally", () => {
    expect(getApiKey()).toBeNull();
    expect(() => saveApiKey("not a key")).toThrow(/Anthropic API key/);
    saveApiKey(`  ${KEY}  `);
    expect(getApiKey()).toBe(KEY);
  });

  it("is refused without consent, and sends nothing", async () => {
    const r = await askCoach("next", undefined, fake);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Turn on the AI coach/) });
    expect(seen).toHaveLength(0);
  });

  it("is refused without a key", async () => {
    clearApiKey();
    await db.from("user_settings").update({ ai_consent: true }).eq("user_id", LOCAL_USER_ID);
    notifyChange(); // the app does this after every action; reads are memoised until then
    expect(await askCoach("next", undefined, fake)).toMatchObject({ ok: false, error: expect.stringMatching(/API key/) });
    expect(seen).toHaveLength(0);
  });

  it("with a key and consent, sends only the shaped summary and saves the answer", async () => {
    saveApiKey(KEY);
    await db.from("profiles").update({ character_name: "Secret Name" }).eq("id", LOCAL_USER_ID);
    notifyChange();
    await db.from("tasks").insert({ title: "Shoot 100 free throws", category: "basketball", notes: "PRIVATE NOTE" });
    const r = await askCoach("plan_day", "I'm tired", fake);
    expect(r).toMatchObject({ ok: true, result: { headline: "Do the shooting drill" } });
    expect(seen).toHaveLength(1);
    expect(seen[0].key).toBe(KEY);
    const sent = JSON.stringify(seen[0].body);
    expect(sent).toContain("Shoot 100 free throws");
    expect(sent).toContain("I'm tired");
    expect(sent).not.toContain("PRIVATE NOTE");
    expect(sent).not.toContain("Secret Name");
    expect(sent).not.toContain(KEY);
    expect((await db.from("coach_runs").select("mode,response")).data).toEqual([{ mode: "plan_day", response: ANSWER }]);
  });

  it("the preview shows the same shaped data and makes no request", async () => {
    const before = seen.length;
    const ctx = JSON.stringify(await previewCoachContext());
    expect(ctx).toContain("Shoot 100 free throws");
    expect(ctx).not.toContain("PRIVATE NOTE");
    expect(seen.length).toBe(before);
  });

  it("limits requests per hour", async () => {
    await db.from("coach_runs").insert(Array.from({ length: 12 }, () => ({ mode: "next", response: ANSWER })));
    const before = seen.length;
    expect(await askCoach("next", undefined, fake)).toMatchObject({ ok: false, error: expect.stringMatching(/last hour/) });
    expect(seen.length).toBe(before);
  });

  it("a breakdown needs a goal", async () => {
    expect(await askCoach("breakdown", "  ", fake)).toMatchObject({ ok: false, error: expect.stringMatching(/goal/) });
  });
});
