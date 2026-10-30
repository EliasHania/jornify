// src/lib/dayCells.ts — convierte un día montado (buildMonth) en celdas de tabla
import type { DayRow } from "@/lib/data";
import { MODE_LABEL, absenceText, fmtTime, secondsToClock, weekdayName } from "@/lib/format";
import { DateTime } from "luxon";
import { t } from "@/i18n";

/** Cabecera de las tablas de días (en el idioma actual) */
export const dayHead = () => [
  t("cells.date"), t("cells.day"), t("cells.inOut"), t("cells.breaks"), t("cells.mode"),
  t("cells.center"), t("cells.worked"), t("cells.expected"), t("cells.notes"),
];

export function dayCells(d: DayRow, centerName: (id: string | null) => string, withExpected: boolean) {
  const sessions = d.sessions.map((s) => `${s.in ? fmtTime(s.in.event_ts) : "?"}–${s.out ? fmtTime(s.out.event_ts) : t("cells.noOut")}`).join(" / ");
  const breaks = d.breaks.map((b) => `${b.start ? fmtTime(b.start.event_ts) : "?"}–${b.end ? fmtTime(b.end.event_ts) : "?"}`).join(" / ");
  const modes = [...new Set(d.sessions.map((s) => MODE_LABEL[s.mode] ?? s.mode))].join(" + ");
  const centers = [...new Set(d.sessions.filter((s) => s.mode === "presencial").map((s) => centerName(s.centerId)))].join(", ");
  const obs = [
    d.holiday && t("cells.holiday", { name: d.holiday }),
    d.absence && absenceText(d.absence),
    d.corrected && t("cells.corrected"),
    d.open && t("cells.open"),
    d.punches.some((p) => p.inside_radius === false) && t("cells.outOfRange"),
  ].filter(Boolean).join(" · ");
  return [
    DateTime.fromISO(d.day).toFormat("dd/MM/yyyy"),
    weekdayName(d.day),
    sessions,
    breaks,
    modes,
    centers,
    d.workSeconds || d.sessions.length ? secondsToClock(d.workSeconds) : "",
    withExpected && d.expectedSeconds ? secondsToClock(d.expectedSeconds) : "",
    obs,
  ];
}
