// src/lib/format.ts
import { DateTime } from "luxon";
import { liveLabels, locale, t } from "@/i18n";
import { tError } from "@/i18n/errors";

export const TZ = "Europe/Madrid";
export const pad = (n: number) => n.toString().padStart(2, "0");

export type RecordType = "IN" | "OUT" | "BREAK_OUT" | "BREAK_IN";
export type WorkMode = "presencial" | "teletrabajo";

/** 3h 05m (negativos con signo) */
export const secondsToHM = (s: number | null | undefined) => {
  const v = Math.round(s ?? 0);
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  return `${sign}${h} h ${pad(m)} m`;
};

/** 3:05 para hojas de cálculo */
export const secondsToClock = (s: number | null | undefined) => {
  const v = Math.round(s ?? 0);
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  return `${sign}${Math.floor(a / 3600)}:${pad(Math.floor((a % 3600) / 60))}`;
};

export const minutesToHours = (m: number | null | undefined) =>
  m == null ? "—" : `${(m / 60).toLocaleString(locale(), { maximumFractionDigits: 2 })} h`;

export const dt = (iso: string) => DateTime.fromISO(iso, { zone: TZ });
export const fmtTime = (iso: string | null | undefined) => (iso ? dt(iso).toFormat("HH:mm") : "—");
export const fmtDate = (iso: string | null | undefined) =>
  iso ? DateTime.fromISO(iso, { zone: TZ }).toFormat("dd/MM/yyyy") : "—";
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? dt(iso).toFormat("dd/MM/yyyy HH:mm") : "—";
export const dayOf = (iso: string) => dt(iso).toISODate()!;

export const todayISO = () => DateTime.now().setZone(TZ).toISODate()!;
export const currentYM = () => DateTime.now().setZone(TZ).toFormat("yyyy-MM");

export const monthRange = (ym: string) => {
  const start = DateTime.fromFormat(ym, "yyyy-MM", { zone: TZ }).startOf("month");
  const end = start.plus({ months: 1 });
  return {
    startDate: start.toISODate()!,
    endDate: end.minus({ days: 1 }).toISODate()!,
    startISO: start.toUTC().toISO()!,
    endISO: end.toUTC().toISO()!,
    days: start.daysInMonth!,
    label: start.setLocale(locale()).toFormat("LLLL yyyy"),
  };
};

export const monthOptions = (count = 24) => {
  const now = DateTime.now().setZone(TZ);
  return Array.from({ length: count }, (_, i) => {
    const d = now.minus({ months: i });
    return { value: d.toFormat("yyyy-MM"), label: d.setLocale(locale()).toFormat("LLLL yyyy") };
  });
};

export const weekdayName = (isoDay: string) =>
  DateTime.fromISO(isoDay, { zone: TZ }).setLocale(locale()).toFormat("cccc");

// Mapas de textos: cada lectura devuelve el texto en el idioma actual
export const TYPE_LABEL = liveLabels(["IN", "OUT", "BREAK_OUT", "BREAK_IN"] as const, (k) => `records.type.${k}`) as Record<RecordType, string>;

export const MODE_LABEL = liveLabels(["presencial", "teletrabajo"] as const, (k) => `fmt.mode.${k}`) as Record<string, string>;

export const ACTION_LABEL = liveLabels(["CLOSE_SHIFT", "ADD", "MODIFY", "DELETE"] as const, (k) => `fmt.action.${k}`) as Record<string, string>;

export const ABSENCE_LABEL = liveLabels(
  ["vacaciones", "permiso", "it", "ausencia", "compensacion", "otro"] as const,
  (k) => `fmt.absence.${k}`
) as Record<string, string>;

/** Etiqueta de una ausencia tal y como la devuelve la base de datos ("permiso (2 h)" incluido) */
export const absenceText = (kind: string | null | undefined) => {
  if (!kind) return "";
  const m = kind.match(/^(\w+) \((.+) h\)$/);
  if (m) return `${ABSENCE_LABEL[m[1]] ?? m[1]} (${Number(m[2]).toLocaleString(locale())} h)`;
  return ABSENCE_LABEL[kind] ?? kind;
};

export const ABSENCE_COLOR: Record<string, string> = {
  vacaciones: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  permiso: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  it: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  ausencia: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  compensacion: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
  otro: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
};

/** Objeto { label, cls } cuyo label se lee en el idioma actual */
const styled = (cls: Record<string, string>, key: (k: string) => string) =>
  Object.fromEntries(
    Object.entries(cls).map(([k, c]) => [k, Object.defineProperty({ cls: c } as { label: string; cls: string }, "label", { get: () => t(key(k) as never) as string, enumerable: true })])
  ) as Record<string, { label: string; cls: string }>;

export const ABSENCE_STATUS = styled({
  requested: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  cancelled: "bg-slate-500/10 text-slate-500 border-slate-500/20",
}, (k) => `fmt.absenceStatus.${k}`);

/** Número de días entre dos fechas ISO, ambas incluidas */
export const daysBetween = (from: string, to: string) =>
  Math.round(DateTime.fromISO(to).diff(DateTime.fromISO(from), "days").days) + 1;

/** "lunes 3 de noviembre" / "Monday 3 November" / "lundi 3 novembre" */
export const longDay = (isoDay: string) =>
  DateTime.fromISO(isoDay, { zone: TZ }).setLocale(locale()).toFormat(t("fmt.longDay"));

export const ADJ_STATUS = styled({
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  proposed: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  disputed: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  withdrawn: "bg-slate-500/10 text-slate-500 border-slate-500/20",
}, (k) => `fmt.adjStatus.${k}`);

/** Días de la semana (1 = lunes); nombres en el idioma actual */
export const WEEKDAYS: { key: string; short: string; long: string }[] = ["1", "2", "3", "4", "5", "6", "7"].map((key) =>
  Object.defineProperties({ key } as { key: string; short: string; long: string }, {
    short: { get: () => t(`fmt.weekdayShort.${key}` as never) as string, enumerable: true },
    long: { get: () => t(`fmt.weekday.${key}` as never) as string, enumerable: true },
  })
);

export type Schedule = Record<string, [string, string][]>;

export const scheduleDaySeconds = (schedule: Schedule | null | undefined, dow: string) =>
  (schedule?.[dow] ?? []).reduce((acc, [a, b]) => {
    const [ah, am] = a.split(":").map(Number);
    const [bh, bm] = b.split(":").map(Number);
    let s = (bh * 60 + bm - (ah * 60 + am)) * 60;
    if (s <= 0) s += 86400;
    return acc + s;
  }, 0);

export const scheduleText = (schedule: Schedule | null | undefined) => {
  if (!schedule || Object.values(schedule).every((v) => !v?.length)) return t("fmt.noSchedule");
  return WEEKDAYS.filter((d) => schedule[d.key]?.length)
    .map((d) => `${d.short} ${schedule[d.key].map(([a, b]) => `${a}-${b}`).join(", ")}`)
    .join(" · ");
};

/** Mensaje legible (y traducido) a partir de un error de Supabase */
export const errMsg = (e: unknown, fallback?: string) => tError(e, fallback);

/** Tipos de contrato: se guardan en español en la base de datos y se muestran en el idioma actual */
export const CONTRACTS = ["Indefinido", "Fijo discontinuo", "Temporal", "Formación", "Prácticas", "Otro"] as const;
const CONTRACT_KEY: Record<string, "indef" | "fijoDisc" | "temporal" | "formacion" | "practicas" | "otro"> = {
  Indefinido: "indef", "Fijo discontinuo": "fijoDisc", Temporal: "temporal", Formación: "formacion", Prácticas: "practicas", Otro: "otro",
};
export const contractLabel = (v: string | null | undefined) => (!v ? "" : CONTRACT_KEY[v] ? t(`emp.contracts.${CONTRACT_KEY[v]}`) : v);

export const fullName = (p: { first_name?: string | null; last_name?: string | null; email?: string | null; display_name?: string | null; user_id: string }) =>
  p.display_name?.trim() ||
  [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
  p.email ||
  p.user_id.slice(0, 8) + "…";
