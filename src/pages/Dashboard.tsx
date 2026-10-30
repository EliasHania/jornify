// src/pages/Dashboard.tsx
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DateTime } from "luxon";
import { Clock, Users, Coffee, ClipboardCheck, Home, MapPin, CalendarDays, Palmtree } from "lucide-react";
import PunchCard from "@/components/PunchCard";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import StatCard from "@/components/ui/StatCard";
import { Card, Empty, Loading, Notice, Pill, Table } from "@/components/ui/kit";
import { fetchCenters, fetchPeople, fetchTerms, type Center, type Person } from "@/lib/data";
import { ABSENCE_LABEL, MODE_LABEL, TYPE_LABEL, TZ, fmtTime, fullName, secondsToHM, todayISO, type RecordType } from "@/lib/format";
import { useT } from "@/i18n";

type Status = { user_id: string; last_type: RecordType; last_ts: string; work_mode: string; center_id: string | null };
type TodayPunch = { id: string; user_id: string; type: RecordType; event_ts: string; work_mode: string; center_id: string | null; inside_radius: boolean | null; is_correction: boolean };

function AdminDashboard({ companyId }: { companyId: string }) {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [status, setStatus] = useState<Status[]>([]);
  const [today, setToday] = useState<TodayPunch[]>([]);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [pendingAdj, setPendingAdj] = useState(0);
  const [unclosed, setUnclosed] = useState(0);
  const [noTerms, setNoTerms] = useState(0);
  const [pendingJoin, setPendingJoin] = useState(0);
  const [pendingAbs, setPendingAbs] = useState(0);
  const [absentToday, setAbsentToday] = useState<{ user_id: string; kind: string }[]>([]);

  const load = useCallback(async () => {
    const day = todayISO();
    const start = DateTime.now().setZone(TZ).startOf("day").toUTC().toISO()!;
    const [pp, cc, st, tp, ds, adj, unc, terms, pa, at] = await Promise.all([
      fetchPeople(),
      fetchCenters(companyId),
      supabase.from("v_current_status").select("user_id, last_type, last_ts, work_mode, center_id").eq("company_id", companyId),
      supabase.from("v_time_records_effective").select("id, user_id, type, event_ts, work_mode, center_id, inside_radius, is_correction")
        .eq("company_id", companyId).gte("event_ts", start).order("event_ts", { ascending: false }).limit(200),
      supabase.from("v_daily_work_summary").select("work_seconds").eq("company_id", companyId).eq("day", day),
      supabase.from("time_record_adjustments").select("id", { count: "exact", head: true }).eq("company_id", companyId).in("status", ["pending", "disputed"]),
      supabase.from("v_autoclosed_incidents").select("open_time_record_id", { count: "exact", head: true }).eq("company_id", companyId),
      fetchTerms(companyId),
      supabase.from("employee_absences").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "requested"),
      supabase.from("employee_absences").select("user_id, kind").eq("company_id", companyId).eq("status", "approved").lte("date_from", day).gte("date_to", day).is("hours", null),
    ]);
    setPendingAbs(pa.count ?? 0);
    setAbsentToday((at.data ?? []) as { user_id: string; kind: string }[]);
    setPeople(pp);
    setCenters(cc);
    setStatus((st.data ?? []) as Status[]);
    setToday((tp.data ?? []) as TodayPunch[]);
    setTodaySeconds((ds.data ?? []).reduce((a: number, r: { work_seconds: number }) => a + (r.work_seconds ?? 0), 0));
    setPendingAdj(adj.count ?? 0);
    setUnclosed(unc.count ?? 0);
    const active = pp.filter((x) => x.company_id === companyId && x.role === "employee" && x.employee_status === "active");
    setNoTerms(active.filter((x) => !terms.some((w) => w.user_id === x.user_id && w.valid_from <= day && (!w.valid_to || w.valid_to >= day))).length);
    setPendingJoin(pp.filter((x) => x.company_id === companyId && x.role === "employee" && x.employee_status === "pending").length);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading) return <Loading />;

  const nameOf = (uid: string) => { const p = people.find((x) => x.user_id === uid); return p ? fullName(p) : "—"; };
  const centerOf = (id: string | null) => (id ? centers.find((c) => c.id === id)?.name ?? "—" : "—");
  const working = status.filter((s) => s.last_type === "IN" || s.last_type === "BREAK_IN");
  const onBreak = status.filter((s) => s.last_type === "BREAK_OUT");
  const outside = today.filter((p) => p.inside_radius === false).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("dash.workingNow")} value={working.length} sub={t("dash.remoteN", { count: working.filter((w) => w.work_mode === "teletrabajo").length })} icon={<Users className="h-5 w-5" />} />
        <StatCard title={t("dash.onBreak")} value={onBreak.length} sub={t("dash.rightNow")} icon={<Coffee className="h-5 w-5" />} />
        <StatCard title={t("dash.hoursToday")} value={todaySeconds > 0 ? secondsToHM(todaySeconds) : "0 h"} sub={t("dash.closedSlots")} icon={<Clock className="h-5 w-5" />} />
        <StatCard title={t("dash.pendingCorr")} value={pendingAdj} sub={unclosed ? t("dash.unclosedN", { count: unclosed }) : t("dash.noOldOpen")} icon={<ClipboardCheck className="h-5 w-5" />} />
      </div>

      {(pendingJoin > 0 || noTerms > 0 || unclosed > 0 || outside > 0 || pendingAbs > 0) && (
        <div className="space-y-2">
          {pendingAbs > 0 && <Notice tone="warn">{t("dash.alertAbs", { count: pendingAbs })} <Link to="/ausencias" className="underline">{t("dash.review")}</Link></Notice>}
          {pendingJoin > 0 && <Notice tone="warn">{t("dash.alertJoin", { count: pendingJoin })} <Link to="/empleados" className="underline">{t("dash.goEmployees")}</Link></Notice>}
          {noTerms > 0 && <Notice tone="warn">{t("dash.alertTerms", { count: noTerms })} <Link to="/empleados" className="underline">{t("dash.complete")}</Link></Notice>}
          {unclosed > 0 && <Notice tone="warn">{t("dash.alertUnclosed", { count: unclosed })} <Link to="/incidencias" className="underline">{t("dash.review")}</Link></Notice>}
          {outside > 0 && <Notice tone="info">{t("dash.alertOutside", { count: outside })}</Notice>}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title={t("dash.onShiftNow")} icon={<MapPin className="w-4 h-4" />}>
          {working.length + onBreak.length === 0 ? <Empty>{t("dash.nobody")}</Empty> : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {[...working, ...onBreak].map((s) => (
                <div key={s.user_id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{nameOf(s.user_id)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t(s.last_type === "BREAK_OUT" ? "dash.breakSince" : "dash.workingSince", { time: fmtTime(s.last_ts) })}
                      {DateTime.fromISO(s.last_ts).toISODate() !== DateTime.now().toISODate() && ` (${DateTime.fromISO(s.last_ts, { zone: TZ }).toFormat("dd/MM")})`}
                    </p>
                  </div>
                  <Pill className={s.work_mode === "teletrabajo" ? "bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/20" : undefined}>
                    {s.work_mode === "teletrabajo" ? <Home className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                    {s.work_mode === "teletrabajo" ? MODE_LABEL.teletrabajo : centerOf(s.center_id)}
                  </Pill>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={t("dash.todayPunches")} icon={<Clock className="w-4 h-4" />}
          actions={absentToday.length > 0 ? <Link to="/ausencias" className="text-xs text-accent hover:underline whitespace-nowrap">{t("dash.absentToday", { count: absentToday.length })}</Link> : undefined}>
          {absentToday.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {absentToday.map((a) => <Pill key={a.user_id}>{nameOf(a.user_id)} · {ABSENCE_LABEL[a.kind] ?? a.kind}</Pill>)}
            </div>
          )}
          {today.length === 0 ? <Empty>{t("dash.noPunchesToday")}</Empty> : (
            <Table head={[t("dash.colTime"), t("dash.colPerson"), t("dash.colType"), t("dash.colWhere"), ""]}>
              {today.slice(0, 40).map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-1.5 font-mono">{fmtTime(p.event_ts)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{nameOf(p.user_id)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{TYPE_LABEL[p.type]}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{p.work_mode === "teletrabajo" ? MODE_LABEL.teletrabajo : centerOf(p.center_id)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {p.inside_radius === false && <span className="text-amber-600 dark:text-amber-400">{t("dash.outOfRange")}</span>}
                    {p.is_correction && <span className="text-sky-600 dark:text-sky-400"> {t("dash.correction")}</span>}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
      <p className="text-[11px] text-slate-400">{t("dash.refreshNote")}</p>
    </div>
  );
}

type NextShift = { day: string; start_time: string; end_time: string; label: string | null };

function EmployeeDashboard({ userId, companyId }: { userId: string; companyId: string }) {
  const { t, locale } = useT();
  const { terms, workerCode, todayExpectedSeconds, settings } = useProfile();
  const [loading, setLoading] = useState(true);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [weekSeconds, setWeekSeconds] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [proposals, setProposals] = useState(0);
  const [punches, setPunches] = useState<TodayPunch[]>([]);
  const [nextShift, setNextShift] = useState<NextShift | null>(null);
  const [vacLeft, setVacLeft] = useState<number | null>(null);
  const [toSign, setToSign] = useState<string | null>(null);

  const load = useCallback(async () => {
    const now = DateTime.now().setZone(TZ);
    const day = now.toISODate()!;
    const weekStart = now.startOf("week").toISODate()!;
    const prevYm = now.minus({ months: 1 }).toFormat("yyyy-MM");
    const [d, w, s, pr, tp, sh, vb, so] = await Promise.all([
      supabase.from("v_daily_work_summary").select("work_seconds").eq("user_id", userId).eq("day", day).maybeSingle(),
      supabase.from("v_daily_work_summary").select("work_seconds").eq("user_id", userId).gte("day", weekStart).lte("day", day),
      supabase.from("v_current_status").select("user_id, last_type, last_ts, work_mode, center_id").eq("user_id", userId).maybeSingle(),
      supabase.from("time_record_adjustments").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "proposed"),
      supabase.from("v_time_records_effective").select("id, user_id, type, event_ts, work_mode, center_id, inside_radius, is_correction")
        .eq("user_id", userId).gte("event_ts", now.startOf("day").toUTC().toISO()!).order("event_ts"),
      supabase.from("shifts").select("day, start_time, end_time, label").eq("user_id", userId).gte("day", day).order("day").order("start_time").limit(3),
      supabase.rpc("get_vacation_balance", { p_year: now.year }),
      settings.monthlySignoffEnabled
        ? supabase.from("monthly_signoffs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("ym", prevYm)
        : Promise.resolve({ count: 1 }),
    ]);
    setTodaySeconds(d.data?.work_seconds ?? 0);
    setWeekSeconds((w.data ?? []).reduce((a: number, r: { work_seconds: number }) => a + (r.work_seconds ?? 0), 0));
    setStatus((s.data as Status) ?? null);
    setProposals(pr.count ?? 0);
    setPunches((tp.data ?? []) as TodayPunch[]);
    const nowHM = now.toFormat("HH:mm:ss");
    setNextShift(((sh.data ?? []) as NextShift[]).find((x) => x.day > day || x.end_time > nowHM || x.end_time < x.start_time) ?? null);
    const bal = ((vb.data ?? []) as { remaining: number }[])[0];
    setVacLeft(bal ? Number(bal.remaining) : null);
    setToSign((so as { count: number | null }).count === 0 && now.day <= 15 ? prevYm : null);
    setLoading(false);
  }, [userId, settings.monthlySignoffEnabled]);

  useEffect(() => { load(); }, [load, companyId]);

  if (loading) return <Loading />;

  const active = status && (status.last_type === "IN" || status.last_type === "BREAK_IN");
  const onBreak = status?.last_type === "BREAK_OUT";
  const label = active ? t("dash.working") : onBreak ? t("dash.onBreakShort") : t("dash.offShift");
  const cls = active ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : onBreak ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" : undefined;
  const expected = todayExpectedSeconds ?? terms?.today_expected_seconds ?? null;
  const shiftText = nextShift ? `${nextShift.start_time.slice(0, 5)}–${nextShift.end_time.slice(0, 5)}` : null;
  const shiftDay = nextShift ? (nextShift.day === todayISO() ? t("common.today") : DateTime.fromISO(nextShift.day).setLocale(locale).toFormat("cccc d")) : "";

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t("dash.yourDay")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 capitalize">{DateTime.now().setZone(TZ).setLocale(locale).toFormat(t("fmt.longDay"))}</p>
          </div>
          <Pill className={cls ? `border ${cls}` : undefined}>{label}{(active || onBreak) && status ? ` ${t("dash.since", { time: fmtTime(status.last_ts) })}` : ""}</Pill>
        </div>
      </Card>

      <PunchCard status={status} onDone={load} />

      {proposals > 0 && (
        <Notice tone="warn">{t("dash.proposals", { count: proposals })} <Link to="/incidencias" className="underline">{t("dash.reviewThem")}</Link></Notice>
      )}
      {toSign && (
        <Notice tone="info">{t("dash.toSign", { month: DateTime.fromFormat(toSign, "yyyy-MM").setLocale(locale).toFormat("LLLL") })} <Link to="/mes" className="underline">{t("dash.goMonth")}</Link></Notice>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("dash.workedToday")} value={todaySeconds > 0 ? secondsToHM(todaySeconds) : "0 h"} sub={expected != null ? t("dash.expected", { v: secondsToHM(expected) }) : t("dash.closedSlotsShort")} icon={<Clock className="h-5 w-5" />} />
        <StatCard title={t("dash.thisWeek")} value={secondsToHM(weekSeconds)} sub={terms ? t("dash.agreed", { v: secondsToHM(terms.weekly_minutes * 60) }) : t("dash.sinceMonday")} icon={<Users className="h-5 w-5" />} />
        <StatCard title={t("dash.nextShift")} value={shiftText ?? "—"} sub={nextShift ? [shiftDay, nextShift.label].filter(Boolean).join(" · ") : t("dash.noShifts")} icon={<CalendarDays className="h-5 w-5" />} />
        <StatCard title={t("dash.holidays")} value={vacLeft != null ? t("dash.daysN", { n: vacLeft.toLocaleString(locale) }) : "—"} sub={t(settings.vacationDayType === "laborables" ? "dash.leftWorking" : "dash.leftCalendar")} icon={<Palmtree className="h-5 w-5" />} />
      </div>

      <Card title={t("dash.todayPunches")}>
        {punches.length === 0 ? <Empty>{t("dash.notYet")}</Empty> : (
          <div className="flex flex-wrap gap-2">
            {punches.map((p) => (
              <Pill key={p.id}>{fmtTime(p.event_ts)} · {TYPE_LABEL[p.type]}{p.work_mode === "teletrabajo" ? ` · ${MODE_LABEL.teletrabajo.toLowerCase()}` : ""}{p.is_correction ? ` · ${t("dash.corrected")}` : ""}</Pill>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-4">
          {terms ? (terms.jornada_type === "parcial" ? t("dash.partTime", { pct: terms.part_time_pct ?? "" }) : t("dash.fullTime")) : t("dash.noTerms")}
          {workerCode ? ` · ${t("shell.yourCode")}: ${workerCode}` : ""} · {t("dash.fullRecordPre")} <Link to="/informes" className="underline">{t("nav.myRecords")}</Link>.
        </p>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useT();
  const { isAdmin, userId, companyId, employeeStatus, loading } = useProfile();
  if (loading) return <Loading />;
  if (!companyId || !userId || (!isAdmin && employeeStatus !== "active")) {
    return <Empty>{employeeStatus === "pending" ? t("dash.pendingJoin") : t("dash.noCompany")}</Empty>;
  }
  return isAdmin ? <AdminDashboard companyId={companyId} /> : <EmployeeDashboard userId={userId} companyId={companyId} />;
}
