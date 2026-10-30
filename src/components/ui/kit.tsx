// src/components/ui/kit.tsx — piezas comunes del panel
import { useEffect, useId, type ReactNode } from "react";
import clsx from "clsx";
import { X, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { t } from "@/i18n";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, title, icon, actions }: {
  children: ReactNode; className?: string; title?: ReactNode; icon?: ReactNode; actions?: ReactNode;
}) {
  return (
    <section className={clsx("min-w-0 rounded-2xl p-5 md:p-6 bg-white dark:bg-card border border-slate-200 dark:border-white/10 shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {icon && <div className="p-2 rounded-lg bg-accent/10 dark:bg-accent/20 text-accent shrink-0">{icon}</div>}
            {title && <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{title}</h2>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

type BtnVariant = "primary" | "ghost" | "danger" | "success" | "subtle";
const btnCls: Record<BtnVariant, string> = {
  primary: "bg-accent/15 border-accent/50 text-accent hover:bg-accent/25",
  ghost: "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10",
  danger: "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/20",
  success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20",
  subtle: "bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5",
};

export function Button({ children, variant = "ghost", size = "md", className, ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl border font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
        btnCls[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm " +
  "text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 " +
  "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition";

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
      {children}
      {hint && <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">{hint}</span>}
    </label>
  );
}

export function Input({ label, hint, className, id, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      {label && <Label hint={hint} htmlFor={fid}>{label}</Label>}
      <input {...rest} id={fid} className={inputCls} />
    </div>
  );
}

export function TextArea({ label, hint, className, id, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      {label && <Label hint={hint} htmlFor={fid}>{label}</Label>}
      <textarea {...rest} id={fid} className={clsx(inputCls, "min-h-[80px]")} />
    </div>
  );
}

export function Select({ label, hint, options, className, placeholder, id, ...rest }:
  React.SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; options: { value: string; label: string }[]; placeholder?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      {label && <Label hint={hint} htmlFor={fid}>{label}</Label>}
      <select {...rest} id={fid} className={clsx(inputCls, "dark:bg-slate-900")}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean;
}) {
  return (
    <label className={clsx("flex items-start gap-3 cursor-pointer select-none", disabled && "opacity-50 cursor-not-allowed")}>
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onKeyDown={(e) => { if (!disabled && (e.key === " " || e.key === "Enter")) { e.preventDefault(); onChange(!checked); } }}
        onClick={() => !disabled && onChange(!checked)}
        className={clsx(
          "mt-0.5 relative inline-flex h-5 w-9 shrink-0 rounded-full border transition",
          checked ? "bg-accent/60 border-accent" : "bg-slate-200 dark:bg-white/10 border-slate-300 dark:border-white/10"
        )}
      >
        <span className={clsx("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-slate-800 dark:text-slate-200">{label}</span>
        {description && <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</span>}
      </span>
    </label>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap", className ?? "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10")}>
      {children}
    </span>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "ok" | "error"; children: ReactNode; className?: string }) {
  const map = {
    info: { cls: "bg-sky-500/5 border-sky-500/20 text-sky-800 dark:text-sky-300", Icon: Info },
    warn: { cls: "bg-amber-500/5 border-amber-500/20 text-amber-800 dark:text-amber-300", Icon: AlertTriangle },
    ok: { cls: "bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300", Icon: CheckCircle2 },
    error: { cls: "bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-300", Icon: AlertTriangle },
  }[tone];
  return (
    <div className={clsx("flex gap-2.5 rounded-xl border px-4 py-3 text-xs leading-relaxed", map.cls, className)}>
      <map.Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-10">{children}</p>;
}

export function Loading({ text }: { text?: string }) {
  return (
    <div className="flex items-center justify-center h-40">
      <p className="text-sm text-slate-400">{text ?? t("common.loading")}</p>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: {
  value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={clsx(
            "cursor-pointer px-3.5 py-2 rounded-xl text-sm font-medium transition border",
            value === t.value
              ? "bg-accent/10 text-accent border-accent/30"
              : "text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5"
          )}
        >
          {t.label}
          {!!t.count && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-600 border border-amber-500/20">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={clsx(
        "relative w-full max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl",
        wide ? "sm:max-w-4xl" : "sm:max-w-lg"
      )}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-white/10">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white min-w-0 truncate">{title}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer" aria-label={t("common.close")}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-200 dark:border-white/10 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/** Tabla simple con scroll horizontal */
export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10", className)}>
      <table className="w-full text-xs">
        <thead className="bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300">
          <tr>{head.map((h, i) => <th key={i} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-200">{children}</tbody>
      </table>
    </div>
  );
}
