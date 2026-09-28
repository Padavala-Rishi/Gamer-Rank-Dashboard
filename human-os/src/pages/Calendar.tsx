import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, GripVertical, Plus, Repeat } from "lucide-react";
import { useApi, useDocumentTitle, useMutate, useProfile, useResource, useToday, useTz } from "../lib/hooks";
import type { CalEvent, EventOccurrence, Task } from "../lib/types";
import { Button, ErrorState, Field, Modal, PageHeader, Seg, Skeleton, useConfirm } from "../components/ui";
import { addDays, dateInTz, minutesInTz, minutesToTime, startOfWeek, timeToMinutes, weekday, zonedToUtc } from "../../shared/dates";
import { EVENT_KINDS, EVENT_RECURRENCES, label } from "../../shared/constants";
import { EVENT_COLOR } from "../lib/colors";
import { fmtMin, fmtTimeInTz } from "../lib/format";
import { ApiError, get } from "../lib/api";

interface CalData {
  from: string;
  to: string;
  events: EventOccurrence[];
  conflicts: { a: string; b: string; overlapMin: number }[];
  tasks: Task[];
  days: { date: string; busy_min: number; free_min: number; window_min: number; overbooked: boolean }[];
}

const HOUR = 48; // px per hour
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Calendar() {
  useDocumentTitle("Calendar");
  const today = useToday();
  const tz = useTz();
  const profile = useProfile();
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
  const [mode, setMode] = useState<"week" | "day">(isMobile ? "day" : "week");
  const [anchor, setAnchor] = useState(today);
  const from = mode === "week" ? startOfWeek(anchor, profile.data?.week_start ?? 1) : anchor;
  const to = mode === "week" ? addDays(from, 6) : anchor;
  const q = useApi<CalData>(`/calendar?from=${from}&to=${to}`);
  const [editing, setEditing] = useState<Partial<CalEvent> & { _date?: string; _start?: string; _end?: string } | null>(null);
  const mut = useMutate();
  const confirm = useConfirm();
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => Array.from({ length: mode === "week" ? 7 : 1 }, (_, i) => addDays(from, i)), [from, mode]);
  const conflictKeys = useMemo(() => new Set((q.data?.conflicts ?? []).flatMap((c) => [c.a, c.b])), [q.data]);
  const unscheduled = useResource<Task>("tasks", { status: "todo,doing" });

  useEffect(() => {
    const start = timeToMinutes(profile.data?.day_start ?? "07:00");
    scrollRef.current?.scrollTo({ top: Math.max(0, (start / 60 - 1) * HOUR) });
  }, [profile.data?.day_start, q.isSuccess]);

  const shift = (n: number) => setAnchor(addDays(anchor, n * (mode === "week" ? 7 : 1)));

  const onDropAt = async (date: string, minutes: number, e: React.DragEvent) => {
    const evId = e.dataTransfer.getData("text/event");
    const taskId = e.dataTransfer.getData("text/task");
    const snapped = Math.max(0, Math.min(24 * 60 - 15, Math.round(minutes / 15) * 15));
    try {
      if (evId) {
        const [id, dur, recurring] = evId.split("|");
        if (recurring === "1" && !(await confirm({ title: "Move a repeating event?", body: "This moves every occurrence of the series to the new time.", confirm: "Move series" }))) return;
        const base = await get<CalEvent>(`/r/events/${id}`);
        // Keep the series' original date for repeating events; move only the time (and weekday for weekly).
        const newDate = recurring === "1" ? (base.recurrence === "weekly" ? moveWeekday(dateInTz(base.start_at, tz), weekday(date)) : dateInTz(base.start_at, tz)) : date;
        const start = zonedToUtc(newDate, minutesToTime(snapped), tz);
        const end = new Date(Date.parse(start) + Number(dur) * 60000).toISOString();
        await mut.update("events", id, { start_at: start, end_at: end });
      } else if (taskId) {
        const t = (unscheduled.data ?? []).find((x) => x.id === taskId);
        const dur = Math.min(240, t?.estimate_min ?? 60);
        const start = zonedToUtc(date, minutesToTime(snapped), tz);
        await mut.create("events", { title: t?.title ?? "Focus block", kind: "focus", task_id: taskId, start_at: start, end_at: new Date(Date.parse(start) + dur * 60000).toISOString() }, { success: "Time block added" });
        if (t && !t.scheduled_date) await mut.update("tasks", taskId, { scheduled_date: date }, { silentError: true }).catch(() => {});
      }
    } catch {
      /* toast shown */
    }
  };

  const overbooked = (q.data?.days ?? []).filter((d) => d.overbooked);

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <PageHeader
        title="Calendar"
        subtitle="Block time for what matters. Drag events to move them, or drag tasks in to create focus blocks."
        actions={
          <>
            <Seg label="View" value={mode} onChange={setMode} options={[["day", "Day"], ["week", "Week"]]} />
            <div className="row gap-4">
              <Button icon onClick={() => shift(-1)} aria-label="Previous">
                <ChevronLeft size={16} />
              </Button>
              <Button onClick={() => setAnchor(today)}>Today</Button>
              <Button icon onClick={() => shift(1)} aria-label="Next">
                <ChevronRight size={16} />
              </Button>
            </div>
            <Button variant="primary" onClick={() => setEditing({ _date: anchor < today ? today : anchor, _start: "09:00", _end: "10:00", kind: "focus" })}>
              <Plus size={16} aria-hidden /> Block time
            </Button>
          </>
        }
      />
      <p className="strong" style={{ marginBottom: 8 }}>
        {new Date(from + "T00:00:00Z").toLocaleDateString(undefined, { month: "long", year: "numeric", day: mode === "day" ? "numeric" : undefined, weekday: mode === "day" ? "long" : undefined, timeZone: "UTC" })}
      </p>
      {(q.data?.conflicts.length ?? 0) > 0 && (
        <div className="error-box" style={{ marginBottom: 8 }} role="status">
          <AlertTriangle size={16} aria-hidden /> {q.data!.conflicts.length} scheduling conflict{q.data!.conflicts.length === 1 ? "" : "s"} — overlapping events are outlined in red.
        </div>
      )}
      {overbooked.length > 0 && (
        <div className="badge warn" style={{ height: "auto", padding: "8px 12px", marginBottom: 8, whiteSpace: "normal" }}>
          Over-scheduled: {overbooked.map((d) => `${DAYS[weekday(d.date)]} (${fmtMin(d.busy_min)} booked, ${fmtMin(d.free_min)} free)`).join(", ")}. A day with no slack usually breaks.
        </div>
      )}
      {q.isLoading ? (
        <Skeleton lines={10} />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <div className="row top gap-16" style={{ alignItems: "stretch" }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div ref={scrollRef} style={{ maxHeight: "calc(100vh - 260px)", minHeight: 420, overflow: "auto", borderRadius: "var(--radius-lg)" }}>
              <div className="cal" style={{ ["--days" as string]: days.length, ["--hour" as string]: `${HOUR}px` }}>
                <div className="cal-head" />
                {days.map((d) => {
                  const info = q.data!.days.find((x) => x.date === d);
                  const dayTasks = q.data!.tasks.filter((t) => t.due_date === d && t.status !== "done");
                  const allDay = q.data!.events.filter((e) => e.all_day && e.occurrence_date === d);
                  return (
                    <div key={d} className={`cal-head ${d === today ? "today" : ""}`}>
                      <div className="muted">{DAYS[weekday(d)]}</div>
                      <div className="cal-date">{Number(d.slice(8))}</div>
                      {info && info.window_min > 0 && (
                        <div className="tiny" style={{ color: info.overbooked ? "var(--warn)" : "var(--muted)" }} title="Free time within your planned day">
                          {fmtMin(info.free_min)} free
                        </div>
                      )}
                      {allDay.map((e) => (
                        <div key={e.occurrence_key} className="cal-allday ellipsis" onClick={() => setEditing(e)}>
                          {e.title}
                        </div>
                      ))}
                      {dayTasks.slice(0, 3).map((t) => (
                        <div key={t.id} className="cal-allday ellipsis" title={`Due: ${t.title}`}>
                          ⚑ {t.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && <div className="tiny muted">+{dayTasks.length - 3} due</div>}
                    </div>
                  );
                })}
                <div className="cal-times" style={{ height: 24 * HOUR }}>
                  {Array.from({ length: 23 }, (_, h) => (
                    <span key={h} className="cal-time" style={{ top: (h + 1) * HOUR }}>
                      {String(h + 1).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>
                {days.map((d) => (
                  <DayColumn key={d} date={d} tz={tz} today={today} events={q.data!.events.filter((e) => !e.all_day && e.occurrence_date === d)} conflictKeys={conflictKeys} onCreate={(start) => setEditing({ _date: d, _start: start, _end: minutesToTime(timeToMinutes(start) + 60), kind: "focus" })} onOpen={(e) => setEditing(e)} onDropAt={onDropAt} />
                ))}
              </div>
            </div>
          </div>
          <aside className="card hide-mobile" style={{ width: 250, flex: "none", alignSelf: "flex-start" }}>
            <div className="card-header">
              <h3>Drag to schedule</h3>
            </div>
            <div className="card-body" style={{ maxHeight: 480, overflowY: "auto" }}>
              {(unscheduled.data ?? [])
                .filter((t) => !t.parent_id)
                .slice(0, 40)
                .map((t) => (
                  <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)} className="item" style={{ cursor: "grab", padding: "6px 0" }} title="Drag onto the calendar">
                    <GripVertical size={14} className="muted" aria-hidden />
                    <span className={`pri pri-${t.priority}`} aria-hidden />
                    <span className="grow small ellipsis">{t.title}</span>
                    {t.estimate_min && <span className="tiny muted">{t.estimate_min}m</span>}
                  </div>
                ))}
              {(unscheduled.data ?? []).length === 0 && <p className="small muted">No open tasks.</p>}
            </div>
          </aside>
        </div>
      )}
      <EventModal editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function moveWeekday(date: string, targetWd: number): string {
  const delta = targetWd - weekday(date);
  return addDays(date, delta);
}

function DayColumn({ date, tz, today, events, conflictKeys, onCreate, onOpen, onDropAt }: { date: string; tz: string; today: string; events: EventOccurrence[]; conflictKeys: Set<string>; onCreate: (start: string) => void; onOpen: (e: EventOccurrence) => void; onDropAt: (date: string, minutes: number, e: React.DragEvent) => void }) {
  const [drop, setDrop] = useState(false);
  const [nowMin, setNowMin] = useState(() => minutesInTz(new Date(), tz));
  useEffect(() => {
    const t = setInterval(() => setNowMin(minutesInTz(new Date(), tz)), 60_000);
    return () => clearInterval(t);
  }, [tz]);
  // Lay out overlapping events side by side.
  const laid = useMemo(() => {
    const items = events
      .map((e) => {
        const s = dateInTz(e.start_at, tz) < date ? 0 : minutesInTz(e.start_at, tz);
        const endDate = dateInTz(e.end_at, tz);
        const en = endDate > date ? 24 * 60 : minutesInTz(e.end_at, tz);
        return { e, s, en: Math.max(en, s + 15) };
      })
      .sort((a, b) => a.s - b.s);
    const cols: number[] = [];
    const out = items.map((it) => {
      let c = cols.findIndex((end) => end <= it.s);
      if (c < 0) {
        c = cols.length;
        cols.push(it.en);
      } else cols[c] = it.en;
      return { ...it, col: c };
    });
    return out.map((o) => ({ ...o, cols: Math.max(1, ...out.filter((x) => x.s < o.en && x.en > o.s).map((x) => x.col + 1)) }));
  }, [events, tz, date]);
  const yToMin = (e: React.MouseEvent | React.DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return ((e.clientY - rect.top) / HOUR) * 60;
  };
  return (
    <div
      className={`cal-day ${drop ? "drop" : ""}`}
      style={{ height: 24 * HOUR }}
      onDoubleClick={(e) => {
        if (e.target !== e.currentTarget) return;
        onCreate(minutesToTime(Math.floor(yToMin(e) / 30) * 30));
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDrop(true);
      }}
      onDragLeave={() => setDrop(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrop(false);
        onDropAt(date, yToMin(e), e);
      }}
      aria-label={`${date}. Double-click to add an event.`}
    >
      {date === today && <div className="cal-now" style={{ top: (nowMin / 60) * HOUR }} aria-hidden />}
      {laid.map(({ e, s, en, col, cols }) => (
        <div
          key={e.occurrence_key}
          className={`cal-event ${conflictKeys.has(e.occurrence_key) ? "conflict" : ""}`}
          style={{ top: (s / 60) * HOUR, height: Math.max(18, ((en - s) / 60) * HOUR - 2), left: `calc(${(col / cols) * 100}% + 3px)`, right: "auto", width: `calc(${100 / cols}% - 6px)`, ["--ev" as string]: EVENT_COLOR[e.kind] ?? "#6b7280" }}
          draggable
          onDragStart={(ev) => ev.dataTransfer.setData("text/event", `${e.id}|${Math.round((Date.parse(e.end_at) - Date.parse(e.start_at)) / 60000)}|${e.is_recurring ? 1 : 0}`)}
          onClick={() => onOpen(e)}
          onKeyDown={(ev) => ev.key === "Enter" && onOpen(e)}
          tabIndex={0}
          role="button"
          aria-label={`${e.title}, ${fmtTimeInTz(e.start_at, tz)} to ${fmtTimeInTz(e.end_at, tz)}, ${label(EVENT_KINDS, e.kind)}${conflictKeys.has(e.occurrence_key) ? ", conflicts with another event" : ""}`}
        >
          <div className="t ellipsis">
            {e.is_recurring && <Repeat size={9} aria-hidden />} {e.title}
          </div>
          <div className="muted">
            {fmtTimeInTz(e.start_at, tz)}–{fmtTimeInTz(e.end_at, tz)}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventModal({ editing, onClose }: { editing: (Partial<CalEvent> & { _date?: string; _start?: string; _end?: string }) | null; onClose: () => void }) {
  const tz = useTz();
  const mut = useMutate();
  const confirm = useConfirm();
  const tasks = useResource<Task>("tasks", { status: "todo,doing" });
  const [f, setF] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = !!editing?.id;

  useEffect(() => {
    if (!editing) return;
    setErrors({});
    setFormError(null);
    if (editing.id) {
      // Always edit the series' base event, not an expanded occurrence.
      get<CalEvent>(`/r/events/${editing.id}`)
        .then((base) =>
          setF({
            ...base,
            _date: dateInTz(base.start_at, tz),
            _start: minutesToTime(minutesInTz(base.start_at, tz)),
            _end: minutesToTime(minutesInTz(base.end_at, tz)),
          }),
        )
        .catch(() => setFormError("Couldn't load this event."));
    } else setF({ title: "", kind: "focus", recurrence: "none", all_day: false, ...editing });
  }, [editing, tz]);

  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setErrors({});
    setFormError(null);
    const date = f._date as string;
    const start = (f._start as string) || "09:00";
    const end = (f._end as string) || "10:00";
    if (!date) return setErrors({ _date: "Pick a date" });
    const startAt = f.all_day ? zonedToUtc(date, "00:00", tz) : zonedToUtc(date, start, tz);
    let endAt = f.all_day ? zonedToUtc(addDays(date, 1), "00:00", tz) : zonedToUtc(date, end, tz);
    if (!f.all_day && end <= start) endAt = zonedToUtc(addDays(date, 1), end, tz); // overnight
    const payload = {
      title: f.title,
      kind: f.kind,
      start_at: startAt,
      end_at: endAt,
      all_day: !!f.all_day,
      task_id: f.task_id || null,
      location: f.location || null,
      notes: f.notes || null,
      recurrence: f.recurrence ?? "none",
      recurrence_until: f.recurrence !== "none" ? f.recurrence_until || null : null,
    };
    try {
      if (isEdit) await mut.update("events", editing!.id as string, payload, { silentError: true });
      else await mut.create("events", payload, { silentError: true });
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields ?? {});
        setFormError(e.message);
      }
    }
  };
  const del = async () => {
    const recurring = f.recurrence && f.recurrence !== "none";
    if (!(await confirm({ title: "Delete this event?", body: recurring ? "This deletes every occurrence of the series." : undefined, confirm: "Delete", danger: true }))) return;
    await mut.remove("events", editing!.id as string, {}, { success: "Event deleted" }).catch(() => {});
    onClose();
  };

  return (
    <Modal
      open={!!editing}
      onClose={onClose}
      title={isEdit ? "Edit event" : "Block time"}
      footer={
        <>
          {isEdit && (
            <Button variant="danger" onClick={del} style={{ marginRight: "auto" }}>
              Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={mut.pending}>
            Save
          </Button>
        </>
      }
    >
      {formError && <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{formError}</div>}
      <div className="form-grid">
        <Field label="Title" full error={errors.title} htmlFor="ev-title">
          <input id="ev-title" className="input" value={(f.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} data-autofocus />
        </Field>
        <Field label="Type" htmlFor="ev-kind">
          <select id="ev-kind" className="select" value={(f.kind as string) ?? "focus"} onChange={(e) => set("kind", e.target.value)}>
            {EVENT_KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" error={errors._date} htmlFor="ev-date">
          <input id="ev-date" className="input" type="date" value={(f._date as string) ?? ""} onChange={(e) => set("_date", e.target.value)} />
        </Field>
        {!f.all_day && (
          <>
            <Field label="Start" htmlFor="ev-start" error={errors.start_at}>
              <input id="ev-start" className="input" type="time" value={(f._start as string) ?? ""} onChange={(e) => set("_start", e.target.value)} />
            </Field>
            <Field label="End" htmlFor="ev-end" hint="An end before the start means it runs overnight." error={errors.end_at}>
              <input id="ev-end" className="input" type="time" value={(f._end as string) ?? ""} onChange={(e) => set("_end", e.target.value)} />
            </Field>
          </>
        )}
        <div className="field" style={{ justifyContent: "flex-end" }}>
          <label className="check">
            <input type="checkbox" checked={!!f.all_day} onChange={(e) => set("all_day", e.target.checked)} /> All day
          </label>
        </div>
        <Field label="Repeat" htmlFor="ev-rec">
          <select id="ev-rec" className="select" value={(f.recurrence as string) ?? "none"} onChange={(e) => set("recurrence", e.target.value)}>
            {EVENT_RECURRENCES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {Boolean(f.recurrence) && f.recurrence !== "none" && (
          <Field label="Repeat until" htmlFor="ev-until">
            <input id="ev-until" className="input" type="date" value={(f.recurrence_until as string) ?? ""} onChange={(e) => set("recurrence_until", e.target.value)} />
          </Field>
        )}
        <Field label="Task in this block" full htmlFor="ev-task">
          <select id="ev-task" className="select" value={(f.task_id as string) ?? ""} onChange={(e) => set("task_id", e.target.value)}>
            <option value="">— None —</option>
            {(tasks.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location" full htmlFor="ev-loc">
          <input id="ev-loc" className="input" value={(f.location as string) ?? ""} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field label="Notes" full htmlFor="ev-notes">
          <textarea id="ev-notes" className="textarea" rows={2} value={(f.notes as string) ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
      {Boolean(f.recurrence) && f.recurrence !== "none" && isEdit && <p className="tiny muted mt-8">Changes apply to the whole series. Editing single occurrences isn't supported yet.</p>}
    </Modal>
  );
}
