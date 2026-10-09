"use client";
import { useEffect, useRef, useState } from "react";
import { reorderTasks } from "@/app/actions/tasks";
import { QuestItem, type QuestView } from "@/components/quest-item";
import { useUI } from "@/components/ui-context";

/** A list of quests you can reorder by dragging (desktop) or with Move up / Move down in each quest's menu. */
export function SortableQuests({ tasks, today, hideDomain }: { tasks: QuestView[]; today: string; hideDomain?: boolean }) {
  const { toast } = useUI();
  const [items, setItems] = useState(tasks);
  useEffect(() => setItems(tasks), [tasks]);
  const dragId = useRef<string | null>(null);

  const persist = async (next: QuestView[]) => {
    setItems(next);
    const res = await reorderTasks(next.map((t) => t.id));
    if (!res.ok) { toast(res.error, "bad"); setItems(tasks); }
  };
  const move = (id: string, dir: -1 | 1) => {
    const i = items.findIndex((t) => t.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    void persist(next);
  };
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <QuestItem key={t.id} task={t} today={today} hideDomain={hideDomain} draggable={items.length > 1} onMove={items.length > 1 ? (d) => move(t.id, d) : undefined}
          dragProps={{
            draggable: items.length > 1,
            onDragStart: (e) => { dragId.current = t.id; e.dataTransfer.effectAllowed = "move"; },
            onDragOver: (e) => { if (dragId.current) e.preventDefault(); },
            onDrop: (e) => {
              e.preventDefault();
              const from = items.findIndex((x) => x.id === dragId.current), to = items.findIndex((x) => x.id === t.id);
              dragId.current = null;
              if (from < 0 || to < 0 || from === to) return;
              const next = items.slice();
              const [m] = next.splice(from, 1);
              next.splice(to, 0, m);
              void persist(next);
            },
          }} />
      ))}
    </ul>
  );
}
