import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Eye, FileText, Link2, Pencil, Pin, Plus, Search, Trash2, X } from "lucide-react";
import { useApi, useDocumentTitle, useMutate, useResource } from "../lib/hooks";
import type { Goal, JournalEntry, Note, Person, Project, Skill, Subject, Task } from "../lib/types";
import { Button, Card, Empty, Field, Modal, PageHeader, Skeleton, useConfirm } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { ApiError } from "../lib/api";

const LINK_TYPES: [string, string, string][] = [
  ["goal", "Goal", "goals"],
  ["project", "Project", "projects"],
  ["task", "Task", "tasks"],
  ["subject", "Course / subject", "subjects"],
  ["journal", "Journal entry", "journal"],
  ["person", "Person", "people"],
  ["skill", "Skill", "skills"],
  ["note", "Note", "notes"],
];

export default function Knowledge() {
  const { id } = useParams();
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const notes = useResource<Note>("notes", { limit: 2000 });
  const mut = useMutate();
  useDocumentTitle("Knowledge");

  const all = notes.data ?? [];
  const folders = useMemo(() => [...new Set(all.map((n) => n.folder).filter(Boolean) as string[])].sort(), [all]);
  const tags = useMemo(() => [...new Set(all.flatMap((n) => n.tags))].sort(), [all]);
  const filtered = all.filter((n) => {
    if (folder && n.folder !== folder) return false;
    if (tag && !n.tags.includes(tag)) return false;
    const s = search.trim().toLowerCase();
    if (s && !n.title.toLowerCase().includes(s) && !(n.body ?? "").toLowerCase().includes(s)) return false;
    return true;
  });
  const current = id ? all.find((n) => n.id === id) : null;

  const create = async () => {
    try {
      const n = await mut.create<Note>("notes", { title: `Untitled ${new Date().toLocaleDateString()}`, folder: folder ?? null, body: "" });
      nav(`/knowledge/${n.id}?edit=1`);
    } catch {
      /* toast */
    }
  };

  return (
    <div className="page" style={{ maxWidth: 1320 }}>
      <PageHeader
        title="Knowledge"
        subtitle="Notes that connect to your goals, projects and learning. Link notes with [[Note title]]."
        actions={
          <Button variant="primary" onClick={create}>
            <Plus size={15} aria-hidden /> New note
          </Button>
        }
      />
      <div className="notes-layout">
        <aside className={`card ${id ? "hide-mobile" : ""}`}>
          <div className="card-body col gap-12">
            <div className="row" style={{ position: "relative" }}>
              <Search size={15} className="muted" style={{ position: "absolute", left: 10 }} aria-hidden />
              <input className="input" style={{ paddingLeft: 32 }} placeholder="Search notes" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search notes" />
            </div>
            {folders.length > 0 && (
              <div className="chips" aria-label="Folders">
                <button className="chip" aria-pressed={folder === null} onClick={() => setFolder(null)}>
                  All
                </button>
                {folders.map((f) => (
                  <button key={f} className="chip" aria-pressed={folder === f} onClick={() => setFolder(folder === f ? null : f)}>
                    {f}
                  </button>
                ))}
              </div>
            )}
            {tags.length > 0 && (
              <div className="chips" aria-label="Tags">
                {tags.map((t) => (
                  <button key={t} className="chip" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                    #{t}
                  </button>
                ))}
              </div>
            )}
            {notes.isLoading ? (
              <Skeleton lines={6} />
            ) : filtered.length === 0 ? (
              <p className="small muted">{all.length ? "No notes match." : "No notes yet."}</p>
            ) : (
              <nav className="list" aria-label="Notes">
                {filtered.map((n) => (
                  <button key={n.id} className="item clickable" style={{ background: n.id === id ? "var(--accent-soft)" : "none", border: 0, borderRadius: 6, padding: "8px 8px", textAlign: "left", width: "100%" }} onClick={() => nav(`/knowledge/${n.id}`)} aria-current={n.id === id ? "page" : undefined}>
                    {n.pinned ? <Pin size={13} aria-label="Pinned" /> : <FileText size={13} className="muted" aria-hidden />}
                    <span className="grow">
                      <span className="item-title ellipsis" style={{ display: "block" }}>
                        {n.title}
                      </span>
                      <span className="tiny muted">{[n.folder, ...n.tags.map((t) => `#${t}`)].filter(Boolean).join(" · ")}</span>
                    </span>
                  </button>
                ))}
              </nav>
            )}
          </div>
        </aside>
        <section>
          {id && notes.isLoading ? (
            <Skeleton lines={8} />
          ) : current ? (
            <NoteView key={current.id} note={current} all={all} />
          ) : id ? (
            <Card>
              <Empty title="Note not found">It may have been deleted.</Empty>
            </Card>
          ) : (
            <Card>
              <Empty icon={<FileText size={20} />} title="Select or create a note" action={<Button variant="primary" onClick={create}>New note</Button>}>
                Use folders for broad buckets, tags for themes, and [[links]] to connect ideas.
              </Empty>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

function NoteView({ note, all }: { note: Note; all: Note[] }) {
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(() => params.get("edit") === "1");
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body ?? "");
  const [folder, setFolder] = useState(note.folder ?? "");
  const [tags, setTags] = useState(note.tags.join(", "));
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mut = useMutate();
  const nav = useNavigate();
  const confirm = useConfirm();
  const backlinks = useApi<{ id: string; title: string }[]>(`/notes/${note.id}/backlinks`);
  const byTitle = useMemo(() => new Map(all.map((n) => [n.title.toLowerCase(), n.id])), [all]);
  const wiki = useCallback((t: string) => {
    const id = byTitle.get(t.toLowerCase());
    return id ? `/knowledge/${id}` : null;
  }, [byTitle]);

  const save = async () => {
    setError(null);
    try {
      await mut.update("notes", note.id, { title, body, folder: folder || null, tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) }, { success: "Note saved", silentError: true });
      setEditing(false);
      if (params.has("edit")) {
        params.delete("edit");
        setParams(params, { replace: true });
      }
    } catch (e) {
      setError(e instanceof ApiError ? Object.values(e.fields ?? {})[0] ?? e.message : "Couldn't save");
    }
  };
  const del = async () => {
    if (!(await confirm({ title: `Delete “${note.title}”?`, body: "Links to this note from other notes will stop resolving.", confirm: "Delete", danger: true }))) return;
    await mut.remove("notes", note.id, {}, { success: "Note deleted" }).catch(() => {});
    nav("/knowledge");
  };
  const removeLink = (l: { entity_type: string; entity_id: string }) => mut.update("notes", note.id, { links: note.links.filter((x) => !(x.entity_type === l.entity_type && x.entity_id === l.entity_id)) }).catch(() => {});

  // Intercept clicks on wiki links for client-side navigation.
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a.wikilink") as HTMLAnchorElement | null;
    if (a) {
      e.preventDefault();
      nav(a.getAttribute("href")!);
    }
  };

  return (
    <div className="col gap-16">
      <Card>
        {editing ? (
          <div className="col gap-12">
            <input className="input" style={{ fontSize: 20, fontWeight: 600, minHeight: 44 }} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Note title" />
            <div className="form-grid">
              <Field label="Folder" htmlFor="n-folder">
                <input id="n-folder" className="input" value={folder} onChange={(e) => setFolder(e.target.value)} list="n-folders" />
              </Field>
              <Field label="Tags" htmlFor="n-tags" hint="comma separated">
                <input id="n-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
              </Field>
            </div>
            <textarea className="textarea" style={{ minHeight: 360, fontFamily: "var(--font-mono)", fontSize: 13 }} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Note body (Markdown)" placeholder={"# Heading\n\nWrite in Markdown. Link other notes with [[Note title]]."} />
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="row between">
              <span className="tiny muted">Markdown supported. [[Title]] links to another note.</span>
              <div className="row">
                <Button onClick={() => { setEditing(false); setTitle(note.title); setBody(note.body ?? ""); }}>
                  <Eye size={15} aria-hidden /> Cancel
                </Button>
                <Button variant="primary" onClick={save} loading={mut.pending}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="col gap-12">
            <div className="row between top">
              <div>
                <h1>{note.title}</h1>
                <p className="small muted mt-4">{[note.folder, ...note.tags.map((t) => `#${t}`)].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="row">
                <Button variant="ghost" icon aria-label={note.pinned ? "Unpin" : "Pin"} aria-pressed={note.pinned} onClick={() => mut.update("notes", note.id, { pinned: !note.pinned })}>
                  <Pin size={15} />
                </Button>
                <Button onClick={() => setEditing(true)}>
                  <Pencil size={15} aria-hidden /> Edit
                </Button>
                <Button variant="danger" icon aria-label="Delete note" onClick={del}>
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
            <div onClick={onClick}>{note.body ? <Markdown text={note.body} onWikiLink={wiki} /> : <p className="muted">Empty note. Click Edit to write.</p>}</div>
          </div>
        )}
      </Card>
      <div className="grid grid-2">
        <Card title="Linked to" icon={<Link2 size={15} aria-hidden />} actions={<Button size="sm" variant="ghost" onClick={() => setLinking(true)}><Plus size={14} aria-hidden /> Link</Button>}>
          {note.links.length === 0 ? <p className="small muted">Link this note to a goal, project, task, course or journal entry.</p> : <div className="chips">{note.links.map((l) => <LinkChip key={`${l.entity_type}:${l.entity_id}`} l={l} onRemove={() => removeLink(l)} />)}</div>}
        </Card>
        <Card title="Backlinks">
          {(backlinks.data ?? []).length === 0 ? (
            <p className="small muted">No notes link here yet. Mention [[{note.title}]] in another note.</p>
          ) : (
            <div className="chips">
              {backlinks.data!.map((b) => (
                <button key={b.id} className="chip" onClick={() => nav(`/knowledge/${b.id}`)}>
                  {b.title}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
      <LinkPicker open={linking} onClose={() => setLinking(false)} note={note} />
      <datalist id="n-folders">
        {[...new Set(all.map((n) => n.folder).filter(Boolean))].map((f) => (
          <option key={f!} value={f!} />
        ))}
      </datalist>
    </div>
  );
}

function LinkChip({ l, onRemove }: { l: { entity_type: string; entity_id: string }; onRemove: () => void }) {
  const q = useApi<Record<string, unknown>>(`/entity/${l.entity_type}/${l.entity_id}`, { retry: false });
  const nav = useNavigate();
  const paths: Record<string, string> = { goal: `/goals/${l.entity_id}`, project: `/projects/${l.entity_id}`, task: `/tasks?open=${l.entity_id}`, subject: `/learning/${l.entity_id}`, journal: `/journal?open=${l.entity_id}`, note: `/knowledge/${l.entity_id}`, person: `/people?open=${l.entity_id}`, skill: "/career" };
  const name = q.data ? String(q.data.title ?? q.data.name ?? q.data.entry_date ?? "") : q.error ? "(deleted)" : "…";
  return (
    <span className="chip" style={{ cursor: "default" }}>
      <button style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }} onClick={() => nav(paths[l.entity_type])}>
        <span className="muted">{LINK_TYPES.find((t) => t[0] === l.entity_type)?.[1]}:</span> {name}
      </button>
      <button style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--muted)", display: "grid" }} onClick={onRemove} aria-label={`Remove link to ${name}`}>
        <X size={12} />
      </button>
    </span>
  );
}

function LinkPicker({ open, onClose, note }: { open: boolean; onClose: () => void; note: Note }) {
  const [type, setType] = useState("goal");
  const [q, setQ] = useState("");
  const resource = LINK_TYPES.find((t) => t[0] === type)![2];
  const rows = useResource<Record<string, unknown>>(resource, { limit: 500 }, { enabled: open });
  const mut = useMutate();
  useEffect(() => setQ(""), [type]);
  const name = (r: Record<string, unknown>) => String(r.title ?? r.name ?? (r as unknown as JournalEntry).entry_date ?? "");
  const list = (rows.data ?? []).filter((r) => r.id !== note.id && name(r).toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  void ([] as (Goal | Project | Task | Subject | Person | Skill)[]);
  return (
    <Modal open={open} onClose={onClose} title="Link this note">
      <div className="col gap-12">
        <div className="chips">
          {LINK_TYPES.map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={type === k} onClick={() => setType(k)}>
              {l}
            </button>
          ))}
        </div>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" aria-label="Filter items" />
        <div className="list" style={{ maxHeight: 320, overflowY: "auto" }}>
          {list.map((r) => {
            const linked = note.links.some((l) => l.entity_type === type && l.entity_id === r.id);
            return (
              <button
                key={r.id as string}
                className="item clickable"
                style={{ background: "none", border: 0, borderBottom: "1px solid var(--border)", width: "100%", textAlign: "left" }}
                disabled={linked}
                onClick={async () => {
                  await mut.update("notes", note.id, { links: [...note.links, { entity_type: type, entity_id: r.id }] }, { success: "Linked" }).catch(() => {});
                  onClose();
                }}
              >
                <span className="grow">{name(r)}</span>
                {linked && <span className="small muted">Linked</span>}
              </button>
            );
          })}
          {!rows.isLoading && list.length === 0 && <p className="small muted">Nothing to link.</p>}
        </div>
      </div>
    </Modal>
  );
}
