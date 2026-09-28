import { useId, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { ApiError } from "../lib/api";
import { useMutate, useResource, useToday } from "../lib/hooks";
import type { Option } from "../../shared/constants";
import { Button, Field, Modal, Scale, useConfirm } from "./ui";

export type FieldType = "text" | "textarea" | "number" | "date" | "time" | "select" | "checkbox" | "scale" | "color" | "ref" | "refs" | "days" | "tags" | "url";

export interface FieldSpec {
  name: string;
  label: string;
  type: FieldType;
  options?: readonly Option[];
  /** Resource name for ref/refs fields */
  ref?: string;
  /** Column used as the label for ref options */
  refLabel?: string;
  refFilter?: (row: Record<string, unknown>) => boolean;
  placeholder?: string;
  hint?: ReactNode;
  full?: boolean;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  serif?: boolean;
  showIf?: (v: Record<string, unknown>) => boolean;
  emptyLabel?: string;
  /** Initial value for new items */
  default?: unknown;
  /** New items default to today's date */
  today?: boolean;
}

type Values = Record<string, unknown>;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function RefSelect({ spec, value, onChange, id, invalid }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void; id: string; invalid: boolean }) {
  const q = useResource<Record<string, unknown>>(spec.ref!);
  const rows = (q.data ?? []).filter(spec.refFilter ?? (() => true));
  const labelKey = spec.refLabel ?? "title";
  if (spec.type === "refs") {
    const arr = (value as string[] | undefined) ?? [];
    if (q.isLoading) return <span className="muted small">Loading…</span>;
    if (!rows.length) return <span className="muted small">Nothing to link yet.</span>;
    return (
      <div className="chips" id={id} role="group">
        {rows.map((r) => {
          const on = arr.includes(r.id as string);
          return (
            <button key={r.id as string} type="button" className="chip" aria-pressed={on} onClick={() => onChange(on ? arr.filter((x) => x !== r.id) : [...arr, r.id])}>
              {String(r[labelKey] ?? r.name ?? r.title)}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <select id={id} className="select" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} aria-invalid={invalid}>
      <option value="">{spec.emptyLabel ?? "— None —"}</option>
      {rows.map((r) => (
        <option key={r.id as string} value={r.id as string}>
          {String(r[labelKey] ?? r.name ?? r.title)}
        </option>
      ))}
    </select>
  );
}

export function FieldInput({ spec, value, onChange, error }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const id = useId();
  const invalid = !!error;
  let input: ReactNode;
  switch (spec.type) {
    case "textarea":
      input = <textarea id={id} className={`textarea ${spec.serif ? "serif" : ""}`} rows={spec.rows ?? 3} value={(value as string) ?? ""} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} />;
      break;
    case "number":
      input = (
        <input id={id} className="input" type="number" inputMode="decimal" min={spec.min} max={spec.max} step={spec.step ?? "any"} value={value == null ? "" : String(value)} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} aria-invalid={invalid} />
      );
      break;
    case "date":
    case "time":
      input = <input id={id} className="input" type={spec.type} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} aria-invalid={invalid} />;
      break;
    case "color":
      input = <input id={id} className="input" type="color" value={(value as string) ?? "#6b7280"} onChange={(e) => onChange(e.target.value)} style={{ padding: 2, height: 36 }} />;
      break;
    case "select":
      input = (
        <select id={id} className="select" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} aria-invalid={invalid}>
          {spec.emptyLabel !== undefined && <option value="">{spec.emptyLabel}</option>}
          {spec.options!.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      );
      break;
    case "checkbox":
      return (
        <div className={`field ${spec.full ? "full" : ""}`}>
          <label className="check">
            <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
            {spec.label}
          </label>
          {spec.hint ? <span className="hint">{spec.hint}</span> : null}
        </div>
      );
    case "scale":
      input = <Scale name={spec.label} value={value as number | null} onChange={onChange} max={spec.max ?? 5} />;
      break;
    case "ref":
    case "refs":
      input = <RefSelect spec={spec} value={value} onChange={onChange} id={id} invalid={invalid} />;
      break;
    case "days": {
      const arr = (value as number[] | undefined) ?? [];
      input = (
        <div className="chips" role="group" aria-label={spec.label}>
          {WEEKDAYS.map((d, i) => (
            <button key={d} type="button" className="chip" aria-pressed={arr.includes(i)} onClick={() => onChange(arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i].sort())}>
              {d}
            </button>
          ))}
        </div>
      );
      break;
    }
    case "tags":
      input = (
        <input
          id={id}
          className="input"
          value={Array.isArray(value) ? (value as string[]).join(", ") : ((value as string) ?? "")}
          placeholder={spec.placeholder ?? "comma, separated"}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
        />
      );
      break;
    default:
      input = <input id={id} className="input" type={spec.type === "url" ? "url" : "text"} value={(value as string) ?? ""} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} />;
  }
  return (
    <Field label={spec.label} hint={spec.hint} error={error} full={spec.full} htmlFor={id}>
      {input}
    </Field>
  );
}

function toPayload(fields: FieldSpec[], values: Values, isEdit: boolean, initial: Values): Values {
  const out: Values = {};
  for (const f of fields) {
    if (f.showIf && !f.showIf(values)) continue;
    let v = values[f.name];
    if (f.type === "tags") v = typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : (v ?? []);
    if (typeof v === "string" && v.trim() === "" && f.type !== "textarea") v = null;
    if (isEdit && JSON.stringify(v ?? null) === JSON.stringify(initial[f.name] ?? null)) continue;
    if (!isEdit && (v === undefined || v === null || (Array.isArray(v) && !v.length && f.type !== "days"))) continue;
    out[f.name] = v;
  }
  return out;
}

export interface ResourceFormProps {
  resource: string;
  fields: FieldSpec[];
  initial?: Values; // with id → edit mode
  extra?: Values; // fixed values sent on create
  onDone?: (row: Record<string, unknown> | null) => void;
  submitLabel?: string;
  deletable?: boolean;
  deleteQuery?: Record<string, string>;
  deleteConfirm?: { title: string; body?: ReactNode; alt?: string; altQuery?: Record<string, string> };
  footerExtra?: ReactNode;
  onDeleted?: () => void;
}

export function ResourceForm({ resource, fields, initial = {}, extra, onDone, submitLabel, deletable = true, deleteConfirm, footerExtra, onDeleted }: ResourceFormProps) {
  const isEdit = !!initial.id;
  const today = useToday();
  const [values, setValues] = useState<Values>(() => {
    const v: Values = { ...initial };
    if (!isEdit) {
      for (const f of fields) {
        if (v[f.name] !== undefined) continue;
        if (f.default !== undefined) v[f.name] = f.default;
        else if (f.today) v[f.name] = today;
        else if (f.type === "select" && f.emptyLabel === undefined && f.options?.length) v[f.name] = f.options[0][0];
      }
    }
    for (const f of fields) if (f.type === "tags" && Array.isArray(v[f.name])) v[f.name] = (v[f.name] as string[]).join(", ");
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const mut = useMutate();
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: unknown) => {
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setErrors({});
    const tagInitial: Values = {};
    for (const f of fields) tagInitial[f.name] = initial[f.name];
    const payload = toPayload(fields, values, isEdit, tagInitial);
    setSaving(true);
    try {
      let row: Record<string, unknown> | null = null;
      if (isEdit) {
        row = Object.keys(payload).length ? await mut.update(resource, initial.id as string, payload, { silentError: true }) : (initial as Record<string, unknown>);
      } else row = await mut.create(resource, { ...extra, ...payload }, { silentError: true });
      onDone?.(row);
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setErrors(err.fields);
        setFormError(err.message);
      } else setFormError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    const res = await confirm({
      title: deleteConfirm?.title ?? "Delete this item?",
      body: deleteConfirm?.body ?? "This can't be undone.",
      confirm: "Delete",
      danger: true,
      alt: deleteConfirm?.alt,
    });
    if (!res) return;
    try {
      await mut.remove(resource, initial.id as string, res === "alt" ? (deleteConfirm?.altQuery ?? {}) : {}, { success: "Deleted" });
      onDeleted?.();
      onDone?.(null);
    } catch {
      /* toast shown */
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {formError && (
        <div className="form-error" role="alert" style={{ marginBottom: 12 }}>
          {formError}
        </div>
      )}
      <div className="form-grid">
        {fields
          .filter((f) => !f.showIf || f.showIf(values))
          .map((f) => (
            <FieldInput key={f.name} spec={f} value={values[f.name]} onChange={(v) => set(f.name, v)} error={errors[f.name]} />
          ))}
      </div>
      <div className="row between mt-16 wrap">
        <div className="row">
          {isEdit && deletable && (
            <Button variant="danger" onClick={onDelete}>
              <Trash2 size={15} aria-hidden /> Delete
            </Button>
          )}
          {footerExtra}
        </div>
        <div className="row">
          {onDone && <Button onClick={() => onDone(null)}>Cancel</Button>}
          <Button type="submit" variant="primary" loading={saving}>
            {submitLabel ?? (isEdit ? "Save changes" : "Create")}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function FormModal(props: ResourceFormProps & { open: boolean; onClose: () => void; title: string; wide?: boolean }) {
  const { open, onClose, title, wide, ...rest } = props;
  return (
    <Modal open={open} onClose={onClose} title={title} wide={wide}>
      {open && (
        <ResourceForm
          {...rest}
          onDone={(row) => {
            rest.onDone?.(row);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}
