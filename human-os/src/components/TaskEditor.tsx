import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Plus, Zap } from "lucide-react";
import type { Task } from "../lib/types";
import { useApi, useMutate, useResource } from "../lib/hooks";
import { taskFields } from "../lib/fields";
import { ResourceForm } from "./ResourceForm";
import { Button, Modal } from "./ui";
import { TaskRow } from "./entities";
import { ApiError } from "../lib/api";

export function TaskEditor({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: Record<string, unknown> | null }) {
  const isEdit = !!initial?.id;
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Task" : "New task"} wide>
      {open && initial && (
        <div className="col gap-16" key={String(initial.id ?? "new")}>
          <ResourceForm
            resource="tasks"
            fields={taskFields}
            initial={initial}
            onDone={onClose}
            footerExtra={isEdit ? <FocusButtons task={initial as unknown as Task} onClose={onClose} /> : undefined}
          />
          {isEdit && <Subtasks parent={initial as unknown as Task} />}
          {isEdit && <LinkedNotes type="task" id={initial.id as string} />}
        </div>
      )}
    </Modal>
  );
}

function FocusButtons({ task, onClose }: { task: Task; onClose: () => void }) {
  const mut = useMutate();
  const nav = useNavigate();
  if (task.status === "done" || task.status === "cancelled") return null;
  return (
    <>
      <Button
        onClick={async () => {
          try {
            await mut.call("/focus/start", { kind: "custom", planned_min: Math.min(600, task.estimate_min ?? 25), task_id: task.id, objective: task.title }, "POST", { silentError: true });
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 409)) return;
          }
          onClose();
          nav("/focus");
        }}
      >
        <Play size={15} aria-hidden /> Focus
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          onClose();
          nav(`/focus?two=${task.id}`);
        }}
        title="Turn it into the smallest possible first step"
      >
        <Zap size={15} aria-hidden /> 2-min start
      </Button>
    </>
  );
}

function Subtasks({ parent }: { parent: Task }) {
  const q = useResource<Task>("tasks", { parent_id: parent.id });
  const mut = useMutate();
  const [title, setTitle] = useState("");
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await mut.create("tasks", { title: title.trim(), parent_id: parent.id, priority: parent.priority });
      setTitle("");
    } catch {
      /* toast */
    }
  };
  return (
    <section>
      <h3>Subtasks</h3>
      <div className="list mt-4">
        {(q.data ?? []).map((t) => (
          <TaskRow key={t.id} task={t} showProject={false} compact />
        ))}
      </div>
      <form onSubmit={add} className="row mt-8">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a subtask" aria-label="New subtask" maxLength={300} />
        <Button type="submit" loading={mut.pending}>
          <Plus size={15} aria-hidden /> Add
        </Button>
      </form>
    </section>
  );
}

export function LinkedNotes({ type, id }: { type: string; id: string }) {
  const q = useApi<{ id: string; title: string }[]>(`/linked-notes?type=${type}&id=${id}`);
  const nav = useNavigate();
  if (!q.data?.length) return null;
  return (
    <section>
      <h3>Linked notes</h3>
      <div className="chips mt-8">
        {q.data.map((n) => (
          <button key={n.id} className="chip" onClick={() => nav(`/knowledge/${n.id}`)}>
            {n.title}
          </button>
        ))}
      </div>
    </section>
  );
}
