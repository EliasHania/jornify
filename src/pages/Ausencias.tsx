// src/pages/Ausencias.tsx — vacaciones y ausencias: peticiones, aprobación, calendario y saldo
import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import clsx from "clsx";
import { Palmtree, Plus, Check, X, ChevronLeft, ChevronRight, Save, CalendarDays, Trash2, Download } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader, Card, Button, Notice, Empty, Loading, Input, Select, TextArea, Toggle, Table, Tabs, Modal, Pill } from "@/components/ui/kit";
import StatCard from "@/components/ui/StatCard";
import { fetchPeople, type Person } from "@/lib/data";
import { downloadXlsx } from "@/lib/exporters";
import { ABSENCE_COLOR, ABSENCE_LABEL, ABSENCE_STATUS, TZ, daysBetween, errMsg, fmtDate, fmtDateTime, fullName, todayISO } from "@/lib/format";
import { locale, t } from "@/i18n";

export type Absence = {
  id: string; user_id: string; company_id: string; kind: string; date_from: string; date_to: string;
  hours: number | null; notes: string | null; status: string; requested_by: string | null;
  review_comment: string | null; reviewed_at: string | null; created_at: string;
};
type Balance = { user_id: string; display_name: string | null; day_type: string; allowance: number; used: number; requested: number; remaining: number };
type Holiday = { day: string; name: string; center_id: string | null };

const COLS = "id, user_id, company_id, kind, date_from, date_to, hours, notes, status, requested_by, review_comment, reviewed_at, created_at";
const KINDS = ["vacaciones", "permiso", "it", "ausencia", "compensacion", "otro"] as const;
const short = (k: string) => ((KINDS as readonly string[]).includes(k) ? t(`absWeb.short.${k as (typeof KINDS)[number]}`) : "?");

const workDays = (from: string, to: string) => {
  let n = 0;
  for (let d = DateTime.fromISO(from); d <= DateTime.fromISO(to); d = d.plus({ days: 1 })) if (d.weekday <= 5) n++;
  return n;
};
const absDays = (a: Pick<Absence, "date_from" | "date_to" | "hours">) =>
  a.hours ? `${Number(a.hours).toLocaleString(locale())} h` : t("absWeb.days", { count: daysBetween(a.date_from, a.date_to) });
const range = (a: Pick<Absence, "date_from" | "date_to">) => (a.date_from === a.date_to ? fmtDate(a.date_from) : `${fmtDate(a.date_from)} – ${fmtDate(a.date_to)}`);

function StatusPill({ status }: { status: string }) {
  const m = ABSENCE_STATUS[status] ?? { label: status, cls: "" };
  return <Pill className={`border ${m.cls}`}>{m.label}</Pill>;
}

// ---------------------------------------------------------------------
// Formulario (trabajador: pide · empresa: registra aprobada)
// ---------------------------------------------------------------------
function AbsenceForm({ people, onDone, admin, remaining, dayType }: {
  people?: Person[]; onDone: () => void; admin: boolean; remaining?: number | null; dayType: string;
}) {
  const { userId, companyId, settings } = useProfile();
  const [who, setWho] = useState("");
  const [kind, setKind] = useState("vacaciones");
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [byHours, setByHours] = useState(false);
  const [hours, setHours] = useState("2");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);

  const kinds = Object.entries(ABSENCE_LABEL)
    .filter(([k]) => (admin || k !== "it") && (k !== "compensacion" || settings.hourBankEnabled))
    .map(([value, label]) => ({ value, label }));
  const n = to >= from ? (dayType === "laborables" ? workDays(from, to) : daysBetween(from, to)) : 0;
  const over = kind === "vacaciones" && !byHours && remaining != null && n > remaining;

  async function submit() {
    setMsg(null);
    const target = admin ? who : userId;
    if (!target || !companyId) { setMsg({ tone: "error", text: t("absWeb.pickPerson") }); return; }
    const end = byHours ? from : to;
    if (end < from) { setMsg({ tone: "error", text: t("absWeb.endBeforeStart") }); return; }
    const h = byHours ? Number(hours.replace(",", ".")) : null;
    if (byHours && (!h || h <= 0 || h >= 24)) { setMsg({ tone: "error", text: t("absWeb.hoursRange") }); return; }
    setSaving(true);
    const { error } = await supabase.from("employee_absences").insert({
      company_id: companyId, user_id: target, kind, date_from: from, date_to: end, hours: h, notes: notes.trim() || null,
      status: admin ? "approved" : "requested",
    });
    setSaving(false);
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setNotes("");
    setMsg({ tone: "ok", text: admin ? t("absWeb.registered") : t("absWeb.sent") });
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        {admin && (
          <Select label={t("absWeb.person")} value={who} onChange={(e) => setWho(e.target.value)} placeholder={t("absWeb.choose")}
            options={(people ?? []).map((p) => ({ value: p.user_id, label: fullName(p) }))} />
        )}
        <Select label={t("absWeb.type")} value={kind} onChange={(e) => setKind(e.target.value)} options={kinds} />
        <Input label={byHours ? t("absWeb.day") : t("absWeb.from")} type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} />
        {byHours
          ? <Input label={t("absWeb.hours")} type="number" min={0.5} max={23.5} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} />
          : <Input label={t("absWeb.to")} type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} />}
      </div>
      <Toggle checked={byHours} onChange={setByHours} label={t("absWeb.byHours")} description={t("absWeb.byHoursDesc")} />
      <TextArea label={t("absWeb.comment")} hint={t("absWeb.commentHint")} value={notes} onChange={(e) => setNotes(e.target.value)} className="max-w-2xl" />
      {!byHours && n > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t(dayType === "laborables" ? "absWeb.nWorking" : "absWeb.nCalendar", { count: n })}
          {kind === "vacaciones" && remaining != null && ` ${t("absWeb.leftAfter", { n: remaining.toLocaleString(locale()) })}`}
        </p>
      )}
      {over && <Notice tone="warn">{t("absWeb.over")}</Notice>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex justify-end">
        <Button variant="primary" disabled={saving} onClick={submit}><Plus className="w-4 h-4" />{admin ? t("absWeb.register") : t("absWeb.send")}</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Trabajador
// ---------------------------------------------------------------------
function WorkerView() {
  const { userId, settings } = useProfile();
  const [year, setYear] = useState(DateTime.now().setZone(TZ).year);
  const [bal, setBal] = useState<Balance | null>(null);
  const [rows, setRows] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [b, a] = await Promise.all([
      supabase.rpc("get_vacation_balance", { p_year: year }),
      supabase.from("employee_absences").select(COLS).eq("user_id", userId)
        .gte("date_to", `${year}-01-01`).lte("date_from", `${year}-12-31`).order("date_from", { ascending: false }),
    ]);
    if (a.error) setError(errMsg(a.error));
    setBal(((b.data ?? []) as Balance[])[0] ?? null);
    setRows((a.data ?? []) as Absence[]);
    setLoading(false);
  }, [userId, year]);
  useEffect(() => { load(); }, [load]);

  async function cancel(id: string) {
    if (!confirm(t("absWeb.cancelConfirm"))) return;
    const { error } = await supabase.from("employee_absences").update({ status: "cancelled" }).eq("id", id);
    if (error) setError(errMsg(error)); else load();
  }

  if (loading) return <Loading />;
  const y0 = DateTime.now().setZone(TZ).year;

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.absences")} subtitle={t("absWeb.workerSub")}
        actions={<Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))} options={[y0 - 1, y0, y0 + 1].map((y) => ({ value: String(y), label: String(y) }))} />} />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("absWeb.yearTitle", { year })} value={bal ? t("dash.daysN", { n: Number(bal.allowance).toLocaleString(locale()) }) : "—"}
          sub={t(settings.vacationDayType === "laborables" ? "absWeb.workingDays" : "absWeb.calendarDays")} icon={<Palmtree className="h-5 w-5" />} />
        <StatCard title={t("absWeb.used")} value={bal ? `${bal.used}` : "—"} sub={t("absWeb.daysWord")} />
        <StatCard title={t("absWeb.pendingResp")} value={bal ? `${bal.requested}` : "—"} sub={t("absWeb.daysRequested")} />
        <StatCard title={t("absWeb.left")} value={bal ? `${Number(bal.remaining).toLocaleString(locale())}` : "—"} sub={t("absWeb.leftSub")} />
      </div>
      <Card title={t("absWeb.newRequest")} icon={<Plus className="w-4 h-4" />}>
        <AbsenceForm onDone={load} admin={false} remaining={bal ? Number(bal.remaining) - bal.requested : null} dayType={settings.vacationDayType} />
      </Card>
      <Card title={t("absWeb.yours", { year })} icon={<CalendarDays className="w-4 h-4" />}>
        {rows.length === 0 ? <Empty>{t("absWeb.noneYear", { year })}</Empty> : (
          <Table head={[t("absWeb.dates"), t("absWeb.type"), t("absWeb.duration"), t("absWeb.status"), t("absWeb.answer"), ""]}>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2 whitespace-nowrap">{range(a)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{ABSENCE_LABEL[a.kind] ?? a.kind}</td>
                <td className="px-3 py-2 whitespace-nowrap">{absDays(a)}</td>
                <td className="px-3 py-2"><StatusPill status={a.status} /></td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{a.review_comment ?? ""}</td>
                <td className="px-3 py-2 text-right">
                  {a.status === "requested" && <Button size="sm" variant="subtle" onClick={() => cancel(a.id)}>{t("common.cancel")}</Button>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------
// Empresa
// ---------------------------------------------------------------------
function TeamCalendar({ people, absences, holidays, ym, setYm }: {
  people: Person[]; absences: Absence[]; holidays: Holiday[]; ym: string; setYm: (v: string) => void;
}) {
  const start = DateTime.fromFormat(ym, "yyyy-MM", { zone: TZ }).startOf("month");
  const days = Array.from({ length: start.daysInMonth! }, (_, i) => start.plus({ days: i }));
  const today = todayISO();
  const cell = (uid: string, iso: string) =>
    absences.find((a) => a.user_id === uid && a.date_from <= iso && a.date_to >= iso && (a.status === "approved" || a.status === "requested"));

  return (
    <Card title={t("absWeb.teamCalendar")} icon={<CalendarDays className="w-4 h-4" />}
      actions={
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => setYm(start.minus({ months: 1 }).toFormat("yyyy-MM"))} aria-label={t("absWeb.prevMonth")}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium px-2 capitalize min-w-[120px] text-center">{start.setLocale(locale()).toFormat("LLLL yyyy")}</span>
          <Button size="sm" onClick={() => setYm(start.plus({ months: 1 }).toFormat("yyyy-MM"))} aria-label={t("absWeb.nextMonth")}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      }>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
        <table className="text-[11px] border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300">
              <th className="sticky left-0 z-10 bg-slate-100 dark:bg-slate-800 text-left font-medium px-3 py-2 min-w-[150px]">{t("absWeb.person")}</th>
              {days.map((d) => {
                const iso = d.toISODate()!;
                const hol = holidays.find((h) => h.day === iso);
                return (
                  <th key={iso} title={hol?.name} className={clsx("px-0.5 py-1 font-medium w-7 text-center",
                    d.weekday >= 6 && "text-slate-400", hol && "text-rose-500", iso === today && "text-accent")}>
                    <div>{d.setLocale(locale()).toFormat("ccccc")}</div><div>{d.day}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.user_id} className="border-t border-slate-100 dark:border-white/5">
                <td className="sticky left-0 z-10 bg-white dark:bg-card px-3 py-1.5 whitespace-nowrap text-slate-700 dark:text-slate-200">{fullName(p)}</td>
                {days.map((d) => {
                  const iso = d.toISODate()!;
                  const a = cell(p.user_id, iso);
                  const hol = holidays.some((h) => h.day === iso && !h.center_id);
                  return (
                    <td key={iso} className={clsx("p-0.5 text-center", (d.weekday >= 6 || hol) && "bg-slate-50 dark:bg-white/[0.03]")}>
                      {a && (
                        <span title={`${ABSENCE_LABEL[a.kind] ?? a.kind}${a.hours ? ` (${a.hours} h)` : ""} · ${ABSENCE_STATUS[a.status]?.label}`}
                          className={clsx("block rounded border h-6 leading-6 font-semibold", ABSENCE_COLOR[a.kind],
                            a.status === "requested" && "opacity-50 border-dashed")}>
                          {short(a.kind)}{a.hours ? "½" : ""}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2 mt-3 text-[11px] text-slate-500">
        {KINDS.map((k) => (
          <span key={k} className="inline-flex items-center gap-1"><span className={clsx("inline-block min-w-5 px-0.5 text-center rounded border font-semibold", ABSENCE_COLOR[k])}>{short(k)}</span>{ABSENCE_LABEL[k]}</span>
        ))}
        <span>· {t("absWeb.legend")}</span>
      </div>
    </Card>
  );
}

function AdminView() {
  const { companyId, settings } = useProfile();
  const [tab, setTab] = useState<"pending" | "calendar" | "balance" | "all">("pending");
  const [people, setPeople] = useState<Person[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [year, setYear] = useState(DateTime.now().setZone(TZ).year);
  const [ym, setYm] = useState(DateTime.now().setZone(TZ).toFormat("yyyy-MM"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ a: Absence; approve: boolean } | null>(null);
  const [comment, setComment] = useState("");
  const [adding, setAdding] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState("");
  const [personFilter, setPersonFilter] = useState("");

  const load = useCallback(async () => {
    if (!companyId) return;
    const from = `${year - 1}-01-01`;
    const [pp, ab, hol, bal] = await Promise.all([
      fetchPeople(),
      supabase.from("employee_absences").select(COLS).eq("company_id", companyId).gte("date_to", from).order("date_from", { ascending: false }),
      supabase.from("company_holidays").select("day, name, center_id").eq("company_id", companyId).gte("day", from),
      supabase.rpc("get_vacation_balance", { p_year: year }),
    ]);
    if (ab.error) setError(errMsg(ab.error));
    setPeople(pp.filter((p) => p.company_id === companyId && p.role === "employee" && p.employee_status === "active"));
    setAbsences((ab.data ?? []) as Absence[]);
    setHolidays((hol.data ?? []) as Holiday[]);
    setBalances((bal.data ?? []) as Balance[]);
    setEdits({});
    setLoading(false);
  }, [companyId, year]);
  useEffect(() => { load(); }, [load]);

  const nameOf = useCallback((uid: string) => { const p = people.find((x) => x.user_id === uid); return p ? fullName(p) : t("absWeb.former"); }, [people]);
  const pending = absences.filter((a) => a.status === "requested").sort((a, b) => a.date_from.localeCompare(b.date_from));
  const overlaps = (a: Absence) => absences.filter((o) => o.id !== a.id && o.user_id !== a.user_id && (o.status === "approved" || o.status === "requested") && o.date_from <= a.date_to && o.date_to >= a.date_from);

  const filtered = useMemo(() => absences.filter((a) => (!statusFilter || a.status === statusFilter) && (!personFilter || a.user_id === personFilter)), [absences, statusFilter, personFilter]);

  async function doReview() {
    if (!review) return;
    const { error } = await supabase.from("employee_absences")
      .update({ status: review.approve ? "approved" : "rejected", review_comment: comment.trim() || null }).eq("id", review.a.id);
    if (error) { setError(errMsg(error)); return; }
    setReview(null); setComment("");
    load();
  }

  async function remove(a: Absence) {
    if (!confirm(t("absWeb.deleteConfirm", { name: nameOf(a.user_id), when: range(a) }))) return;
    const { error } = await supabase.from("employee_absences").delete().eq("id", a.id);
    if (error) setError(errMsg(error)); else load();
  }

  async function saveAllowance(uid: string) {
    const v = Number((edits[uid] ?? "").replace(",", "."));
    if (!Number.isFinite(v) || v < 0 || v > 120) { setError(t("absWeb.daysRange")); return; }
    const { error } = await supabase.from("vacation_allowances").upsert({ company_id: companyId, user_id: uid, year, days: v, updated_at: new Date().toISOString() });
    if (error) setError(errMsg(error)); else load();
  }

  function exportXlsx() {
    downloadXlsx(`${t("absWeb.xlsxFile")}_${year}`, [{
      name: t("absWeb.xlsxSheet"), title: t("absWeb.xlsxTitle", { year: year - 1 }),
      head: [t("absWeb.person"), t("absWeb.type"), t("absWeb.from"), t("absWeb.to"), t("absWeb.hours"), t("absWeb.status"), t("absWeb.comment"), t("absWeb.answer"), t("absWeb.requestedAt")],
      rows: filtered.map((a) => [nameOf(a.user_id), ABSENCE_LABEL[a.kind] ?? a.kind, fmtDate(a.date_from), fmtDate(a.date_to), a.hours ?? "",
        ABSENCE_STATUS[a.status]?.label ?? a.status, a.notes ?? "", a.review_comment ?? "", fmtDateTime(a.created_at)]),
    }, {
      name: t("absWeb.balanceSheet", { year }), title: t(settings.vacationDayType === "laborables" ? "absWeb.balanceTitleWorking" : "absWeb.balanceTitleCalendar", { year }),
      head: [t("absWeb.person"), t("absWeb.yearDays"), t("absWeb.approved"), t("absWeb.pending"), t("absWeb.remaining")],
      rows: balances.map((b) => [b.display_name ?? "", Number(b.allowance), b.used, b.requested, Number(b.remaining)]),
    }]);
  }

  if (loading) return <Loading />;
  const y0 = DateTime.now().setZone(TZ).year;

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.absences")} subtitle={t("absWeb.adminSub")}
        actions={<>
          <Button onClick={exportXlsx}><Download className="w-4 h-4" />Excel</Button>
          <Button variant="primary" onClick={() => setAdding(true)}><Plus className="w-4 h-4" />{t("absWeb.register")}</Button>
        </>} />
      {error && <Notice tone="error">{error}</Notice>}
      <Tabs<"pending" | "calendar" | "balance" | "all"> value={tab} onChange={setTab} tabs={[
        { value: "pending", label: t("absWeb.pending"), count: pending.length },
        { value: "calendar", label: t("absWeb.calendar") },
        { value: "balance", label: t("absWeb.balance") },
        { value: "all", label: t("absWeb.history") },
      ]} />

      {tab === "pending" && (
        pending.length === 0 ? <Card><Empty>{t("absWeb.noPending")}</Empty></Card> : (
          <div className="grid lg:grid-cols-2 gap-4">
            {pending.map((a) => {
              const ov = overlaps(a);
              const b = balances.find((x) => x.user_id === a.user_id);
              return (
                <Card key={a.id}>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{nameOf(a.user_id)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t("absWeb.requestedOn", { when: fmtDateTime(a.created_at) })}</p>
                      </div>
                      <Pill className={`border ${ABSENCE_COLOR[a.kind]}`}>{ABSENCE_LABEL[a.kind] ?? a.kind}</Pill>
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-200">{range(a)} · {absDays(a)}</p>
                    {a.notes && <p className="text-xs text-slate-600 dark:text-slate-300 italic">“{a.notes}”</p>}
                    {a.kind === "vacaciones" && b && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t("absWeb.theyHave", { left: Number(b.remaining).toLocaleString(locale()), total: Number(b.allowance).toLocaleString(locale()) })}</p>
                    )}
                    {ov.length > 0 && (
                      <Notice tone="warn">{t("absWeb.overlap", { names: [...new Set(ov.map((o) => nameOf(o.user_id)))].join(", ") })}</Notice>
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button variant="danger" onClick={() => { setComment(""); setReview({ a, approve: false }); }}><X className="w-4 h-4" />{t("absWeb.reject")}</Button>
                      <Button variant="success" onClick={() => { setComment(""); setReview({ a, approve: true }); }}><Check className="w-4 h-4" />{t("absWeb.approve")}</Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {tab === "calendar" && (people.length === 0 ? <Card><Empty>{t("absWeb.noActive")}</Empty></Card> :
        <TeamCalendar people={people} absences={absences} holidays={holidays} ym={ym} setYm={setYm} />)}

      {tab === "balance" && (
        <Card title={t("absWeb.balanceYear", { year })} icon={<Palmtree className="w-4 h-4" />}
          actions={<Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))} options={[y0 - 1, y0, y0 + 1].map((y) => ({ value: String(y), label: String(y) }))} />}>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            {t(settings.vacationDayType === "laborables" ? "absWeb.defaultWorking" : "absWeb.defaultCalendar", { n: settings.vacationDays })}
          </p>
          {balances.length === 0 ? <Empty>{t("absWeb.noActive")}</Empty> : (
            <Table head={[t("absWeb.person"), t("absWeb.yearDays"), t("absWeb.approved"), t("absWeb.pending"), t("absWeb.remaining"), ""]}>
              {balances.map((b) => (
                <tr key={b.user_id}>
                  <td className="px-3 py-2 whitespace-nowrap">{b.display_name}</td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} max={120} step={0.5} value={edits[b.user_id] ?? String(b.allowance)}
                      onChange={(e) => setEdits({ ...edits, [b.user_id]: e.target.value })}
                      className="w-20 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1 text-xs" />
                  </td>
                  <td className="px-3 py-2">{b.used}</td>
                  <td className="px-3 py-2">{b.requested}</td>
                  <td className={clsx("px-3 py-2 font-medium", Number(b.remaining) < 0 && "text-red-500")}>{Number(b.remaining).toLocaleString(locale())}</td>
                  <td className="px-3 py-2 text-right">
                    {edits[b.user_id] !== undefined && edits[b.user_id] !== String(b.allowance) && (
                      <Button size="sm" variant="primary" onClick={() => saveAllowance(b.user_id)}><Save className="w-3.5 h-3.5" />{t("common.save")}</Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === "all" && (
        <Card>
          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} placeholder={t("absWeb.allPeople")} options={people.map((p) => ({ value: p.user_id, label: fullName(p) }))} />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} placeholder={t("absWeb.allStatuses")} options={Object.entries(ABSENCE_STATUS).map(([value, m]) => ({ value, label: m.label }))} />
          </div>
          {filtered.length === 0 ? <Empty>{t("absWeb.none")}</Empty> : (
            <Table head={[t("absWeb.person"), t("absWeb.dates"), t("absWeb.type"), t("absWeb.duration"), t("absWeb.status"), t("absWeb.comment"), ""]}>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{nameOf(a.user_id)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{range(a)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{ABSENCE_LABEL[a.kind] ?? a.kind}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{absDays(a)}</td>
                  <td className="px-3 py-2"><StatusPill status={a.status} /></td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{[a.notes, a.review_comment].filter(Boolean).join(" · ")}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => remove(a)} className="p-1 text-slate-400 hover:text-red-500 cursor-pointer" aria-label={t("common.delete")}><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      <Modal open={!!review} onClose={() => setReview(null)} title={review?.approve ? t("absWeb.approveTitle") : t("absWeb.rejectTitle")}
        footer={<>
          <Button onClick={() => setReview(null)}>{t("common.cancel")}</Button>
          <Button variant={review?.approve ? "success" : "danger"} onClick={doReview}>{review?.approve ? t("absWeb.approve") : t("absWeb.reject")}</Button>
        </>}>
        {review && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {nameOf(review.a.user_id)} · {ABSENCE_LABEL[review.a.kind]} · {range(review.a)} ({absDays(review.a)})
            </p>
            <TextArea label={t("absWeb.message")} hint={`(${t("common.optional")})`} value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder={review.approve ? t("absWeb.approvePh") : t("absWeb.rejectPh")} />
          </div>
        )}
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title={t("absWeb.register")} wide>
        <AbsenceForm admin people={people} dayType={settings.vacationDayType} onDone={() => { setAdding(false); load(); }} />
      </Modal>
    </div>
  );
}

export default function Ausencias() {
  const { isAdmin, loading, companyId, employeeStatus } = useProfile();
  if (loading) return <Loading />;
  if (!companyId || (!isAdmin && employeeStatus !== "active")) return <Empty>{t("absWeb.needCompany")}</Empty>;
  return isAdmin ? <AdminView /> : <WorkerView />;
}
