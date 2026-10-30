// src/lib/data.ts — consultas compartidas
import { DateTime } from "luxon";
import { supabase } from "@/lib/supabaseClient";
import { TZ, dayOf, type RecordType, type WorkMode, type Schedule } from "@/lib/format";

export type Punch = {
  id: string;
  user_id: string;
  company_id: string;
  type: RecordType;
  event_ts: string;
  ts: string;
  work_mode: WorkMode;
  center_id: string | null;
  inside_radius: boolean | null;
  distance_m: number | null;
  is_correction: boolean;
};

export type Center = {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  center_lat: number;
  center_lon: number;
  radius_m: number;
  is_primary: boolean;
  active: boolean;
};

export type Person = {
  user_id: string;
  company_id: string | null;
  role: string | null;
  employee_status: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  dni: string | null;
  email: string | null;
  is_archived: boolean | null;
};

export type Terms = {
  id: string;
  user_id: string;
  company_id: string;
  valid_from: string;
  valid_to: string | null;
  jornada_type: "completa" | "parcial";
  weekly_minutes: number;
  part_time_pct: number | null;
  schedule: Schedule;
  flexible: boolean;
  remote_allowed: boolean;
  contract_type: string | null;
  notes: string | null;
};

export type DailyRow = {
  user_id: string;
  day: string;
  work_seconds: number;
  break_seconds: number;
  remote_work_seconds: number;
  has_corrections: boolean;
  is_open: boolean;
};

export type ExpectedRow = {
  user_id: string;
  day: string;
  expected_seconds: number;
  absence_kind: string | null;
  holiday_name: string | null;
};

const PAGE = 1000;

export async function fetchPunches(opts: { companyId: string; userId?: string | null; fromISO: string; toISO: string }) {
  const out: Punch[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("v_time_records_effective")
      .select("id, user_id, company_id, type, event_ts, ts, work_mode, center_id, inside_radius, distance_m, is_correction")
      .eq("company_id", opts.companyId)
      .gte("event_ts", opts.fromISO)
      .lt("event_ts", opts.toISO)
      .order("event_ts", { ascending: true })
      .order("ts", { ascending: true })
      .range(from, from + PAGE - 1);
    if (opts.userId) q = q.eq("user_id", opts.userId);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as Punch[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function fetchCenters(companyId: string, onlyActive = false) {
  let q = supabase
    .from("work_centers")
    .select("id, company_id, name, address, center_lat, center_lon, radius_m, is_primary, active")
    .eq("company_id", companyId)
    .order("is_primary", { ascending: false })
    .order("name");
  if (onlyActive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Center[];
}

/** Personas visibles para el usuario (admin: toda la empresa y antiguos empleados con fichajes). */
export async function fetchPeople() {
  const { data, error } = await supabase
    .from("v_user_display")
    .select("user_id, company_id, role, employee_status, display_name, first_name, last_name, dni, email, is_archived");
  if (error) throw error;
  return (data ?? []) as Person[];
}

export async function fetchTerms(companyId: string, userId?: string | null) {
  let q = supabase
    .from("work_terms")
    .select("id, user_id, company_id, valid_from, valid_to, jornada_type, weekly_minutes, part_time_pct, schedule, flexible, remote_allowed, contract_type, notes")
    .eq("company_id", companyId)
    .order("valid_from", { ascending: false });
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Terms[];
}

export const termsAt = (terms: Terms[], userId: string, isoDay: string) =>
  terms.find((t) => t.user_id === userId && t.valid_from <= isoDay && (!t.valid_to || t.valid_to >= isoDay)) ?? null;

export async function fetchDaily(companyId: string, startDate: string, endDate: string, userId?: string | null) {
  let q = supabase
    .from("v_daily_work_summary")
    .select("user_id, day, work_seconds, break_seconds, remote_work_seconds, has_corrections, is_open")
    .eq("company_id", companyId)
    .gte("day", startDate)
    .lte("day", endDate)
    .order("day");
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DailyRow[];
}

export async function fetchExpected(startDate: string, endDate: string, userId?: string | null) {
  const { data, error } = await supabase.rpc("get_expected_days", {
    p_from: startDate,
    p_to: endDate,
    p_user_id: userId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ExpectedRow[];
}

// ---------------------------------------------------------------------
// Montaje de un mes día a día para un trabajador
// ---------------------------------------------------------------------
export type Session = { in: Punch | null; out: Punch | null; mode: WorkMode; centerId: string | null };
export type BreakSpan = { start: Punch | null; end: Punch | null };

export type DayRow = {
  day: string;
  punches: Punch[];
  sessions: Session[];
  breaks: BreakSpan[];
  workSeconds: number;
  breakSeconds: number;
  remoteSeconds: number;
  expectedSeconds: number | null;
  absence: string | null;
  holiday: string | null;
  corrected: boolean;
  open: boolean;
};

/** Agrupa los fichajes por la jornada a la que pertenecen (la de su entrada), aunque crucen la medianoche. */
export function buildMonth(
  startDate: string,
  endDate: string,
  punches: Punch[],
  daily: DailyRow[],
  expected: ExpectedRow[] | null
): DayRow[] {
  const days: DayRow[] = [];
  const byDay = new Map<string, DayRow>();
  let d = DateTime.fromISO(startDate, { zone: TZ });
  const end = DateTime.fromISO(endDate, { zone: TZ });
  while (d <= end) {
    const iso = d.toISODate()!;
    const dl = daily.find((x) => x.day === iso);
    const ex = expected?.find((x) => x.day === iso);
    const row: DayRow = {
      day: iso,
      punches: [],
      sessions: [],
      breaks: [],
      workSeconds: dl?.work_seconds ?? 0,
      breakSeconds: dl?.break_seconds ?? 0,
      remoteSeconds: dl?.remote_work_seconds ?? 0,
      expectedSeconds: expected ? ex?.expected_seconds ?? 0 : null,
      absence: ex?.absence_kind ?? null,
      holiday: ex?.holiday_name ?? null,
      corrected: !!dl?.has_corrections,
      open: !!dl?.is_open,
    };
    days.push(row);
    byDay.set(iso, row);
    d = d.plus({ days: 1 });
  }

  let sessionDay: string | null = null;
  let current: Session | null = null;
  let brk: BreakSpan | null = null;

  for (const p of [...punches].sort((a, b) => a.event_ts.localeCompare(b.event_ts))) {
    const own = dayOf(p.event_ts);
    if (p.type === "IN") {
      if (current && sessionDay) byDay.get(sessionDay)?.sessions.push(current);
      sessionDay = own;
      current = { in: p, out: null, mode: p.work_mode, centerId: p.center_id };
    }
    const target = byDay.get(sessionDay ?? own) ?? byDay.get(own);
    if (!target) continue;
    target.punches.push(p);
    if (p.type === "OUT") {
      if (current) { current.out = p; target.sessions.push(current); }
      else target.sessions.push({ in: null, out: p, mode: p.work_mode, centerId: p.center_id });
      current = null; sessionDay = null;
    } else if (p.type === "BREAK_OUT") {
      brk = { start: p, end: null };
      target.breaks.push(brk);
    } else if (p.type === "BREAK_IN") {
      if (brk && !brk.end) brk.end = p;
      else target.breaks.push({ start: null, end: p });
      brk = null;
      if (current && p.work_mode !== current.mode) current.mode = p.work_mode;
    }
  }
  if (current && sessionDay) byDay.get(sessionDay)?.sessions.push(current);
  return days;
}
