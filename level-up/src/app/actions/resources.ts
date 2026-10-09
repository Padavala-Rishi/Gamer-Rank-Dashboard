"use server";
import { revalidatePath } from "next/cache";
import { run, check, type ActionResult } from "@/lib/server/action";
import { getContext } from "@/lib/server/context";
import { isResource, RESOURCES } from "@/lib/resources";
import { uuid } from "@/lib/schemas";

/** Create or update a row in one of the allow-listed tables. Payloads are validated; user_id always comes from the session. */
export async function saveRow(resource: string, id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    if (!isResource(resource)) throw new Error("Unknown resource");
    const def = RESOURCES[resource];
    const { supabase, user } = await getContext();
    const parsed = def.schema.parse(input) as Record<string, unknown>;
    let rowId: string;
    if (id) {
      uuid.parse(id);
      const row = check(await supabase.from(def.table).update(parsed).eq("id", id).select("id").single()) as { id: string };
      rowId = row.id;
    } else if (def.upsert) {
      const row = check(await supabase.from(def.table).upsert({ ...parsed, user_id: user.id }, { onConflict: def.upsert }).select("id").single()) as { id: string };
      rowId = row.id;
    } else {
      const row = check(await supabase.from(def.table).insert(parsed).select("id").single()) as { id: string };
      rowId = row.id;
    }
    revalidatePath("/", "layout");
    return { id: rowId };
  });
}

export async function deleteRow(resource: string, id: string): Promise<ActionResult> {
  return run(async () => {
    if (!isResource(resource)) throw new Error("Unknown resource");
    uuid.parse(id);
    const { supabase } = await getContext();
    check(await supabase.from(RESOURCES[resource].table).delete().eq("id", id).select("id"));
    revalidatePath("/", "layout");
  });
}
