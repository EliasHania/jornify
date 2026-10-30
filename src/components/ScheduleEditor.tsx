// src/components/ScheduleEditor.tsx — horario semanal por tramos
import { Plus, Trash2 } from "lucide-react";
import { WEEKDAYS, scheduleDaySeconds, secondsToHM, type Schedule } from "@/lib/format";
import { t } from "@/i18n";

const timeCls =
  "rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/50";

export default function ScheduleEditor({ value, onChange }: { value: Schedule; onChange: (s: Schedule) => void }) {
  const set = (day: string, spans: [string, string][]) => {
    const next = { ...value };
    if (spans.length) next[day] = spans; else delete next[day];
    onChange(next);
  };
  const total = WEEKDAYS.reduce((a, d) => a + scheduleDaySeconds(value, d.key), 0);

  return (
    <div className="space-y-1.5">
      {WEEKDAYS.map((d) => {
        const spans = value[d.key] ?? [];
        return (
          <div key={d.key} className="flex flex-wrap items-center gap-2 py-1 border-b border-slate-100 dark:border-white/5 last:border-0">
            <span className="w-20 text-xs text-slate-600 dark:text-slate-300">{d.long}</span>
            {spans.length === 0 && <span className="text-xs text-slate-400">{t("sched.free")}</span>}
            {spans.map(([a, b], i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <input type="time" className={timeCls} value={a}
                  onChange={(e) => set(d.key, spans.map((s, j) => (j === i ? [e.target.value, s[1]] : s)) as [string, string][])} />
                <span className="text-xs text-slate-400">{t("sched.to")}</span>
                <input type="time" className={timeCls} value={b}
                  onChange={(e) => set(d.key, spans.map((s, j) => (j === i ? [s[0], e.target.value] : s)) as [string, string][])} />
                <button type="button" className="p-1 text-slate-400 hover:text-red-500 cursor-pointer" aria-label={t("sched.removeSpan")}
                  onClick={() => set(d.key, spans.filter((_, j) => j !== i))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            {spans.length < 3 && (
              <button type="button" className="inline-flex items-center gap-1 text-xs text-accent hover:underline cursor-pointer"
                onClick={() => set(d.key, [...spans, spans.length ? ["16:00", "19:00"] : ["09:00", "14:00"]])}>
                <Plus className="w-3 h-3" /> {t("sched.span")}
              </button>
            )}
            <span className="ml-auto text-[11px] text-slate-400">{spans.length ? secondsToHM(scheduleDaySeconds(value, d.key)) : ""}</span>
          </div>
        );
      })}
      <div className="text-right text-xs text-slate-500 dark:text-slate-400 pt-1">{t("sched.total")}: <b>{secondsToHM(total)}</b></div>
    </div>
  );
}

export const scheduleWeeklyMinutes = (s: Schedule) =>
  Math.round(WEEKDAYS.reduce((a, d) => a + scheduleDaySeconds(s, d.key), 0) / 60);

/** Tramos válidos (HH:MM) y sin vacíos */
export const cleanSchedule = (s: Schedule): Schedule => {
  const out: Schedule = {};
  for (const [k, spans] of Object.entries(s)) {
    const ok = spans.filter(([a, b]) => /^\d{2}:\d{2}$/.test(a) && /^\d{2}:\d{2}$/.test(b) && a !== b);
    if (ok.length) out[k] = ok;
  }
  return out;
};
