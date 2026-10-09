"use client";
import { useState, useTransition } from "react";
import { deleteRow, saveRow } from "@/app/actions/resources";
import { WEEKDAY_LABELS } from "@/lib/constants";
import type { FieldDef } from "@/lib/forms";
import { Icon } from "./icon";
import { Sheet } from "./sheet";
import { Field, Notice } from "./ui";
import { useUI } from "./ui-context";

type Values = Record<string, unknown>;

function initialValues(fields: FieldDef[], initial?: Values | null): Values {
  const v: Values = {};
  for (const f of fields) {
    const given = initial?.[f.name];
    if (given !== undefined && given !== null) v[f.name] = f.type === "tags" && Array.isArray(given) ? given.join(", ") : f.type === "time" && typeof given === "string" ? given.slice(0, 5) : given;
    else if (f.defaultValue !== undefined) v[f.name] = f.defaultValue;
    else v[f.name] = f.type === "checkbox" ? false : f.type === "weekdays" || f.type === "list" ? [] : "";
  }
  return v;
}

export function ResourceForm({ resource, fields, initial, id, onDone, canDelete = true, submitLabel }: {
  resource: string; fields: FieldDef[]; initial?: Values | null; id?: string | null; onDone: () => void; canDelete?: boolean; submitLabel?: string;
}) {
  const { toast } = useUI();
  const [v, setV] = useState<Values>(() => initialValues(fields, initial));
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (k: string, val: unknown) => setV((s) => ({ ...s, [k]: val }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setFe({});
    start(async () => {
      const payload: Values = { ...v };
      for (const f of fields) {
        if (f.type === "list") payload[f.name] = ((v[f.name] as Values[]) ?? []).filter((row) => String(row[f.columns![0].name] ?? "").trim());
        if (f.type === "checkbox") payload[f.name] = !!v[f.name];
      }
      const res = await saveRow(resource, id ?? null, payload);
      if (!res.ok) { setErr(res.error); setFe(res.fields ?? {}); return; }
      toast(id ? "Saved" : "Added", "good");
      onDone();
    });
  };

  const remove = () => {
    if (!id || !confirm("Delete this? This can't be undone.")) return;
    start(async () => {
      const res = await deleteRow(resource, id);
      if (!res.ok) { setErr(res.error); return; }
      toast("Deleted", "info");
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3.5" noValidate>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => {
          if (f.type === "text" && f.label === "") return <input key={f.name} type="hidden" value={String(v[f.name] ?? "")} readOnly />;
          const fid = `rf-${resource}-${f.name}`;
          const span = f.half ? "" : "col-span-2";
          const common = { id: fid, "aria-invalid": !!fe[f.name] } as const;
          return (
            <Field key={f.name} label={f.label + (f.required ? " *" : "")} htmlFor={fid} hint={f.hint} error={fe[f.name]} className={span}>
              {f.type === "textarea" ? (
                <textarea {...common} className="textarea" rows={3} value={String(v[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />
              ) : f.type === "select" ? (
                <select {...common} className="select" value={String(v[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                  {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "checkbox" ? (
                <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm"><input {...common} type="checkbox" className="size-4 accent-[var(--accent)]" checked={!!v[f.name]} onChange={(e) => set(f.name, e.target.checked)} />Yes</label>
              ) : f.type === "weekdays" ? (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={f.label}>
                  {WEEKDAY_LABELS.map((l, i) => {
                    const cur = (v[f.name] as number[]) ?? [];
                    return <button key={l} type="button" className="chip" aria-pressed={cur.includes(i + 1)} onClick={() => set(f.name, cur.includes(i + 1) ? cur.filter((x) => x !== i + 1) : [...cur, i + 1].sort())}>{l}</button>;
                  })}
                </div>
              ) : f.type === "list" ? (
                <ListEditor field={f} rows={(v[f.name] as Values[]) ?? []} onChange={(rows) => set(f.name, rows)} />
              ) : (
                <input {...common} className="input" type={f.type === "number" ? "number" : f.type === "tags" ? "text" : f.type} inputMode={f.type === "number" ? "decimal" : undefined}
                  step={f.type === "number" ? f.step ?? 1 : undefined} min={f.min} max={f.max} placeholder={f.placeholder} value={String(v[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />
              )}
            </Field>
          );
        })}
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      <div className="flex items-center justify-between gap-2 pt-1">
        {id && canDelete ? <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={pending}><Icon name="trash-2" size={14} />Delete</button> : <span />}
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel ?? (id ? "Save" : "Add")}</button>
        </div>
      </div>
    </form>
  );
}

function ListEditor({ field, rows, onChange }: { field: FieldDef; rows: Values[]; onChange: (r: Values[]) => void }) {
  const cols = field.columns!;
  const template = cols.map((c) => c.width ?? "1fr").join(" ") + " 2rem";
  const dl = `dl-${field.name}`;
  return (
    <div className="space-y-2">
      {cols[0].suggestions && <datalist id={dl}>{cols[0].suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
      {rows.map((row, i) => (
        <div key={i} className="grid items-center gap-1.5" style={{ gridTemplateColumns: template }}>
          {cols.map((c, ci) => (
            <input key={c.name} className="input !min-h-10 !px-2.5" aria-label={`${c.label} ${i + 1}`} placeholder={c.placeholder ?? c.label} type={c.type === "number" ? "number" : "text"} inputMode={c.type === "number" ? "decimal" : undefined} step="any" min={0}
              list={ci === 0 && c.suggestions ? dl : undefined} value={String(row[c.name] ?? "")} onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, [c.name]: e.target.value } : r)))} />
          ))}
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => onChange([...rows, Object.fromEntries(cols.map((c) => [c.name, ""]))])}><Icon name="plus" size={13} /> Add row</button>
    </div>
  );
}

/** A button that opens a sheet containing the form: "Add …" when no row is given, an edit pencil when one is. */
export function ResourceButton({ resource, fields, title, initial, id, label, icon = "plus", className, canDelete, iconOnly, submitLabel }: {
  resource: string; fields: FieldDef[]; title: string; initial?: Values | null; id?: string | null; label?: string; icon?: string; className?: string; canDelete?: boolean; iconOnly?: boolean; submitLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const editing = !!id;
  return (
    <>
      <button type="button" className={className ?? (iconOnly || editing ? "btn btn-ghost btn-icon btn-sm" : "btn btn-sm")} onClick={() => setOpen(true)} aria-label={iconOnly || editing ? (editing ? `Edit ${title}` : title) : undefined} aria-haspopup="dialog">
        <Icon name={editing ? "pencil" : icon} size={editing ? 15 : 14} />{!(iconOnly || editing) && (label ?? title)}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${title}` : title}>
        {open && <ResourceForm resource={resource} fields={fields} initial={initial} id={id} canDelete={canDelete} submitLabel={submitLabel} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}
