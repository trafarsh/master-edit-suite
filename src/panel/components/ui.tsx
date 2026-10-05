/** Shared building blocks so every module looks and behaves the same. */
import { useEffect, useState, type ReactNode } from "react";
import type { Availability } from "../core/requirements";

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

/**
 * A button that states its target ("3 layers") and, when disabled, why
 * ("Select at least one footage layer").
 */
export function ActionButton({
  label,
  avail,
  onClick,
  primary,
  busyLabel,
}: {
  label: string;
  avail: Availability;
  onClick: () => void | Promise<unknown>;
  primary?: boolean;
  busyLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const disabled = !avail.enabled || busy;
  const sub = busy ? busyLabel ?? "Working…" : avail.enabled ? avail.target : avail.reason;
  return (
    <button
      type="button"
      className={`action${primary ? " primary" : ""}`}
      disabled={disabled}
      title={avail.enabled ? `${label} · ${avail.target}` : avail.reason}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="action-label">{label}</span>
      {sub ? <span className={`action-sub${avail.enabled ? "" : " reason"}`}>{sub}</span> : null}
    </button>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; badge?: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={value === t.id ? "tab active" : "tab"}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.badge ? <span className="tab-badge">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.id} type="button" className={o.id === value ? "seg active" : "seg"} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Number input that commits on blur/Enter and clamps to [min, max]. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    let n = Number(text);
    if (!Number.isFinite(n)) n = value;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    setText(String(n));
    if (n !== value) onChange(n);
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="number"
          value={text}
          step={step}
          min={min}
          max={max}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        {suffix ? <span className="suffix">{suffix}</span> : null}
      </span>
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="text"
          value={text}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== value && onChange(text)}
          onKeyDown={(e) => e.key === "Enter" && text !== value && onChange(text)}
        />
      </span>
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  mixed,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  mixed?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      title={mixed ? "Some instances on, some off" : checked ? "On" : "Off"}
      className={`switch${checked ? " on" : ""}${mixed ? " mixed" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}

export function Planned({ phase, items, note }: { phase: number; items: string[]; note?: string }) {
  return (
    <div className="planned">
      <div className="planned-badge">Planned · Phase {phase}</div>
      {note ? <p className="muted">{note}</p> : null}
      <ul>
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="hint">{children}</p>;
}
