// src/pages/Employees.tsx — plantilla, condiciones de jornada, centros, ausencias y representantes
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { DateTime } from "luxon";
import { Users, CheckCircle, XCircle, UserX, Copy, Check, Scale, FileText, Trash2, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader, Card, Button, Pill, Notice, Empty, Loading, Tabs, Modal, Input, Select, TextArea, Toggle, Table } from "@/components/ui/kit";
import ScheduleEditor, { cleanSchedule, scheduleWeeklyMinutes } from "@/components/ScheduleEditor";
import { fetchCenters, fetchTerms, type Center, type Terms } from "@/lib/data";
import { ABSENCE_LABEL, ABSENCE_STATUS, CONTRACTS, contractLabel, TZ, errMsg, fmtDate, fullName, minutesToHours, scheduleText, todayISO, type Schedule } from "@/lib/format";
import { liveLabels, t } from "@/i18n";

type Emp = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  dni: string | null;
  role: string | null;
  employee_status: string | null;
  created_at: string | null;
  is_rlt: boolean;
  archived: boolean;
  company_id: string | null;
};

type Absence = { id: string; user_id: string; date_from: string; date_to: string; kind: string; notes: string | null; status: string; hours: number | null };
type Status = { user_id: string; last_type: string; last_ts: string; work_mode: string };

const STATUS_CLS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  removed: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};
const statusLabel = liveLabels(["active", "pending", "rejected", "removed"] as const, (k) => `emp.status.${k}`) as Record<string, string>;

export default function Employees() {
  const { isAdmin, companyId, companyCode, loading: profileLoading } = useProfile();
  const [emps, setEmps] = useState<Emp[]>([]);
  const [terms, setTerms] = useState<Terms[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [assign, setAssign] = useState<{ user_id: string; center_id: string }[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [status, setStatus] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "pending" | "former">("active");
  const [acting, setActing] = useState<string | null>(null);
  const [open, setOpen] = useState<Emp | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [p, t, c, a, ab, s] = await Promise.all([
        supabase.from("profiles").select("user_id, first_name, last_name, email, dni, role, employee_status, created_at, is_rlt, archived, company_id").order("created_at"),
        fetchTerms(companyId),
        fetchCenters(companyId),
        supabase.from("employee_centers").select("user_id, center_id").eq("company_id", companyId),
        supabase.from("employee_absences").select("id, user_id, date_from, date_to, kind, notes, status, hours").eq("company_id", companyId).in("status", ["approved", "requested"]).order("date_from", { ascending: false }),
        supabase.from("v_current_status").select("user_id, last_type, last_ts, work_mode").eq("company_id", companyId),
      ]);
      if (p.error) throw p.error;
      setEmps((p.data ?? []) as Emp[]);
      setTerms(t);
      setCenters(c);
      setAssign((a.data ?? []) as { user_id: string; center_id: string }[]);
      setAbsences((ab.data ?? []) as Absence[]);
      setStatus((s.data ?? []) as Status[]);
    } catch (e) {
      setError(errMsg(e, t("emp.loadError")));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { if (!profileLoading && isAdmin) load(); }, [profileLoading, isAdmin, load]);

  const today = todayISO();
  const currentTerms = useCallback(
    (uid: string) => terms.find((w) => w.user_id === uid && w.valid_from <= today && (!w.valid_to || w.valid_to >= today)) ?? null,
    [terms, today]
  );

  const groups = useMemo(() => {
    const isAdm = (e: Emp) => e.role === "admin" || e.role === "owner";
    return {
      active: emps.filter((e) => e.company_id === companyId && (isAdm(e) || e.employee_status === "active")),
      pending: emps.filter((e) => e.company_id === companyId && !isAdm(e) && e.employee_status === "pending"),
      former: emps.filter((e) => e.company_id !== companyId || e.employee_status === "removed" || e.employee_status === "rejected" || e.archived),
    };
  }, [emps, companyId]);

  async function setEmpStatus(uid: string, st: "active" | "rejected" | "removed") {
    setActing(uid);
    const { error: e } = await supabase.rpc("admin_set_employee_status", { p_employee_user_id: uid, p_status: st });
    setActing(null);
    if (e) { setError(errMsg(e)); return; }
    load();
  }

  if (!profileLoading && !isAdmin) return <Navigate to="/" replace />;
  if (profileLoading) return <Loading />;

  const list = groups[filter];
  const noTerms = groups.active.filter((e) => e.role === "employee" && !currentTerms(e.user_id)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.employees")}
        subtitle={t("emp.subtitle")}
        actions={companyCode && (
          <Button onClick={async () => { try { await navigator.clipboard.writeText(companyCode); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* sin portapapeles */ } }}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {t("emp.companyCode")}: <span className="font-mono">{companyCode}</span>
          </Button>
        )}
      />

      {error && <Notice tone="error">{error}</Notice>}
      {noTerms > 0 && (
        <Notice tone="warn">{t("emp.noTerms", { count: noTerms })}</Notice>
      )}

      <Tabs<"active" | "pending" | "former">
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: "active", label: t("emp.tabActive") },
          { value: "pending", label: t("emp.tabPending"), count: groups.pending.length },
          { value: "former", label: t("emp.tabFormer") },
        ]}
      />

      {loading ? <Loading /> : (
        <Card className="!p-0 overflow-hidden">
          {list.length === 0 ? <Empty>{filter === "pending" ? t("emp.noRequests") : t("emp.nobody")}</Empty> : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {list.map((e) => {
                const adm = e.role === "admin" || e.role === "owner";
                const w = currentTerms(e.user_id);
                const st = status.find((s) => s.user_id === e.user_id);
                const working = st && (st.last_type === "IN" || st.last_type === "BREAK_IN");
                const onBreak = st?.last_type === "BREAK_OUT";
                const sk = e.archived || e.company_id !== companyId ? "removed" : e.employee_status && STATUS_CLS[e.employee_status] ? e.employee_status : "pending";
                const meta = { label: statusLabel[sk], cls: STATUS_CLS[sk] };
                const nCenters = assign.filter((a) => a.user_id === e.user_id).length;
                return (
                  <div key={e.user_id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-5 py-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="relative flex items-center justify-center h-10 w-10 rounded-full bg-accent/10 dark:bg-accent/20 shrink-0">
                        <Users className="w-5 h-5 text-accent" />
                        {(working || onBreak) && <span className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${working ? "bg-emerald-500" : "bg-amber-500"}`} />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate flex items-center gap-2">
                          {e.archived ? t("emp.deleted") : fullName(e)}
                          {e.is_rlt && <Pill className="bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/20"><Scale className="w-3 h-3" />RLT</Pill>}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {adm ? t("roles.admin") : w
                            ? [
                                w.jornada_type === "parcial" ? t("emp.partPct", { pct: w.part_time_pct ?? "" }) : t("emp.full"),
                                t("emp.perWeek", { h: minutesToHours(w.weekly_minutes) }),
                                w.remote_allowed ? t("emp.remote") : null,
                                nCenters ? t("emp.centersN", { count: nCenters }) : null,
                              ].filter(Boolean).join(" · ")
                            : e.employee_status === "active" ? t("dash.noTerms") : e.email ?? ""}
                          {working && ` · ${t("emp.workingSince", { time: DateTime.fromISO(st!.last_ts, { zone: TZ }).toFormat("HH:mm") })}`}
                          {onBreak && ` · ${t("emp.onBreak")}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Pill className={`border ${adm ? STATUS_CLS.active : meta.cls}`}>{adm ? t("roles.admin") : meta.label}</Pill>
                      {filter === "pending" && (
                        <>
                          <Button size="sm" variant="success" disabled={acting === e.user_id} onClick={() => setEmpStatus(e.user_id, "active")}><CheckCircle className="w-3.5 h-3.5" />{t("emp.accept")}</Button>
                          <Button size="sm" variant="danger" disabled={acting === e.user_id} onClick={() => setEmpStatus(e.user_id, "rejected")}><XCircle className="w-3.5 h-3.5" />{t("absWeb.reject")}</Button>
                        </>
                      )}
                      {filter === "active" && !adm && (
                        <Button size="sm" variant="primary" onClick={() => setOpen(e)}><FileText className="w-3.5 h-3.5" />{t("emp.file")}</Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {filter === "former" && (
        <Notice tone="info">
          {t("emp.formerNote")}
        </Notice>
      )}

      {open && companyId && (
        <EmployeeFile
          emp={open}
          companyId={companyId}
          terms={terms.filter((w) => w.user_id === open.user_id)}
          centers={centers}
          assigned={assign.filter((a) => a.user_id === open.user_id).map((a) => a.center_id)}
          absences={absences.filter((a) => a.user_id === open.user_id)}
          onClose={() => setOpen(null)}
          onChanged={load}
          onRemove={async () => {
            if (!confirm(t("emp.removeConfirm", { name: fullName(open) }))) return;
            await setEmpStatus(open.user_id, "removed");
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Ficha del trabajador
// ---------------------------------------------------------------------
function EmployeeFile({ emp, companyId, terms, centers, assigned, absences, onClose, onChanged, onRemove }: {
  emp: Emp; companyId: string; terms: Terms[]; centers: Center[]; assigned: string[]; absences: Absence[];
  onClose: () => void; onChanged: () => void; onRemove: () => void;
}) {
  const [tab, setTab] = useState<"jornada" | "centros" | "ausencias" | "otros">("jornada");
  const today = todayISO();
  const current = terms.find((w) => w.valid_from <= today && (!w.valid_to || w.valid_to >= today)) ?? terms[0] ?? null;

  return (
    <Modal open wide onClose={onClose} title={t("emp.fileOf", { name: fullName(emp) })}>
      <div className="space-y-5">
        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          <div><span className="text-slate-400">{t("login.email")}</span><p className="text-slate-800 dark:text-slate-200 truncate">{emp.email ?? "—"}</p></div>
          <div><span className="text-slate-400">{t("emp.idNumber")}</span><p className="text-slate-800 dark:text-slate-200">{emp.dni ?? t("emp.idByWorker")}</p></div>
          <div><span className="text-slate-400">{t("emp.joined")}</span><p className="text-slate-800 dark:text-slate-200">{fmtDate(emp.created_at)}</p></div>
        </div>

        <Tabs<"jornada" | "centros" | "ausencias" | "otros">
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "jornada", label: t("emp.tabTerms") },
            { value: "centros", label: t("emp.tabCenters") },
            { value: "ausencias", label: t("emp.tabAbsences") },
            { value: "otros", label: t("emp.tabOther") },
          ]}
        />

        {tab === "jornada" && <TermsEditor emp={emp} current={current} history={terms} onSaved={onChanged} />}
        {tab === "centros" && <CentersEditor emp={emp} centers={centers} assigned={assigned} onSaved={onChanged} />}
        {tab === "ausencias" && <AbsencesEditor emp={emp} companyId={companyId} absences={absences} onSaved={onChanged} />}
        {tab === "otros" && <OtherEditor emp={emp} onSaved={onChanged} onRemove={onRemove} />}
      </div>
    </Modal>
  );
}

function TermsEditor({ emp, current, history, onSaved }: { emp: Emp; current: Terms | null; history: Terms[]; onSaved: () => void }) {
  const [validFrom, setValidFrom] = useState(todayISO());
  const [jt, setJt] = useState<"completa" | "parcial">(current?.jornada_type ?? "completa");
  const [hours, setHours] = useState(String((current?.weekly_minutes ?? 2400) / 60));
  const [pct, setPct] = useState(current?.part_time_pct != null ? String(current.part_time_pct) : "");
  const [schedule, setSchedule] = useState<Schedule>(current?.schedule ?? {});
  const [flexible, setFlexible] = useState(current?.flexible ?? false);
  const [remote, setRemote] = useState(current?.remote_allowed ?? false);
  const [contract, setContract] = useState(current?.contract_type ?? "");
  const [notes, setNotes] = useState(current?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const schedMin = scheduleWeeklyMinutes(schedule);
  const weeklyMin = Math.round(parseFloat(hours.replace(",", ".")) * 60);

  async function save() {
    setMsg(null);
    if (!Number.isFinite(weeklyMin) || weeklyMin < 0 || weeklyMin > 4800) { setMsg({ tone: "error", text: t("errors.db.weeklyHoursInvalid") }); return; }
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_work_terms", {
      p_user_id: emp.user_id,
      p_valid_from: validFrom,
      p_jornada_type: jt,
      p_weekly_minutes: weeklyMin,
      p_part_time_pct: jt === "parcial" && pct ? Number(pct.replace(",", ".")) : null,
      p_schedule: cleanSchedule(schedule),
      p_flexible: flexible,
      p_remote_allowed: remote,
      p_contract_type: contract || null,
      p_notes: notes || null,
    });
    setSaving(false);
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setMsg({ tone: "ok", text: t("emp.termsSaved") });
    onSaved();
  }

  return (
    <div className="space-y-4">
      {current ? (
        <Notice tone="info">
          {t("emp.currentTerms", {
            from: fmtDate(current.valid_from),
            type: current.jornada_type === "parcial" ? t("emp.partPct", { pct: current.part_time_pct ?? "" }) : t("emp.full"),
            hours: minutesToHours(current.weekly_minutes),
            schedule: scheduleText(current.schedule),
          })}
        </Notice>
      ) : (
        <Notice tone="warn">{t("emp.noTermsYet")}</Notice>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        <Input label={t("emp.applyFrom")} type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        <Select label={t("emp.jornadaType")} value={jt} onChange={(e) => setJt(e.target.value as "completa" | "parcial")}
          options={[{ value: "completa", label: t("emp.full") }, { value: "parcial", label: t("emp.part") }]} />
        <Input label={t("emp.weeklyHours")} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
        {jt === "parcial" && (
          <Input label={t("emp.pct")} hint={t("emp.pctHint")} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
        )}
        <Select label={t("emp.contract")} value={contract} onChange={(e) => setContract(e.target.value)} placeholder={t("emp.unspecified")}
          options={CONTRACTS.map((v) => ({ value: v, label: contractLabel(v) }))} />
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("emp.weeklySchedule")} <span className="font-normal text-slate-400">{t("emp.weeklyScheduleHint")}</span></p>
        <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3">
          <ScheduleEditor value={schedule} onChange={setSchedule} />
        </div>
        {schedMin > 0 && Math.abs(schedMin - weeklyMin) > 1 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
            {t("emp.schedMismatch", { sched: minutesToHours(schedMin), weekly: minutesToHours(weeklyMin) })}{" "}
            <button type="button" className="underline cursor-pointer" onClick={() => setHours(String(schedMin / 60))}>{t("emp.use", { v: minutesToHours(schedMin) })}</button>
          </p>
        )}
        {schedMin === 0 && <p className="text-xs text-slate-400 mt-1.5">{t("emp.noFixed")}</p>}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Toggle checked={flexible} onChange={setFlexible} label={t("emp.flexible")} description={t("emp.flexibleDesc")} />
        <Toggle checked={remote} onChange={setRemote} label={t("emp.canRemote")} description={t("emp.canRemoteDesc")} />
      </div>
      <TextArea label={t("emp.notes")} hint={`(${t("common.optional")})`} value={notes} onChange={(e) => setNotes(e.target.value)} />

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex justify-end"><Button variant="primary" disabled={saving} onClick={save}>{saving ? t("resetWeb.saving") : t("emp.saveTerms")}</Button></div>

      {history.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("absWeb.history")}</p>
          <Table head={[t("absWeb.from"), t("absWeb.to"), t("emp.jornada"), t("emp.hoursWeek"), t("emp.schedule"), t("fmt.mode.teletrabajo")]}>
            {history.map((w) => (
              <tr key={w.id}>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(w.valid_from)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{w.valid_to ? fmtDate(w.valid_to) : t("emp.current")}</td>
                <td className="px-3 py-2 whitespace-nowrap">{w.jornada_type === "parcial" ? t("emp.partPct", { pct: w.part_time_pct ?? "" }) : t("emp.full")}</td>
                <td className="px-3 py-2 whitespace-nowrap">{minutesToHours(w.weekly_minutes)}</td>
                <td className="px-3 py-2">{scheduleText(w.schedule)}{w.flexible ? ` (${t("emp.flexibleShort")})` : ""}</td>
                <td className="px-3 py-2">{w.remote_allowed ? t("common.yes") : t("common.no")}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  );
}

function CentersEditor({ emp, centers, assigned, onSaved }: { emp: Emp; centers: Center[]; assigned: string[]; onSaved: () => void }) {
  const [sel, setSel] = useState<string[]>(assigned);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const active = centers.filter((c) => c.active);

  async function save() {
    setSaving(true);
    setMsg(null);
    const { error } = await supabase.rpc("admin_set_employee_centers", { p_user_id: emp.user_id, p_center_ids: sel });
    setSaving(false);
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setMsg({ tone: "ok", text: t("emp.centersSaved") });
    onSaved();
  }

  return (
    <div className="space-y-4">
      <Notice tone="info">{t("emp.centersHint")}</Notice>
      {active.length === 0 ? <Empty>{t("emp.noCenters")}</Empty> : (
        <div className="space-y-2">
          {active.map((c) => (
            <label key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer">
              <input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} />
              <span className="text-sm text-slate-800 dark:text-slate-200">{c.name}</span>
              {c.is_primary && <Pill>{t("emp.primary")}</Pill>}
              <span className="ml-auto text-xs text-slate-400">{t("emp.radius", { m: c.radius_m })}</span>
            </label>
          ))}
        </div>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex justify-end"><Button variant="primary" disabled={saving} onClick={save}>{saving ? t("resetWeb.saving") : t("emp.saveCenters")}</Button></div>
    </div>
  );
}

function AbsencesEditor({ emp, companyId, absences, onSaved }: { emp: Emp; companyId: string; absences: Absence[]; onSaved: () => void }) {
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [kind, setKind] = useState("vacaciones");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function add() {
    setMsg(null);
    if (to < from) { setMsg({ tone: "error", text: t("absWeb.endBeforeStart") }); return; }
    setSaving(true);
    const { error } = await supabase.from("employee_absences").insert({ company_id: companyId, user_id: emp.user_id, date_from: from, date_to: to, kind, notes: notes.trim() || null });
    setSaving(false);
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setNotes("");
    onSaved();
  }
  async function remove(id: string) {
    if (!confirm(t("emp.deleteAbsence"))) return;
    const { error } = await supabase.from("employee_absences").delete().eq("id", id);
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    onSaved();
  }

  return (
    <div className="space-y-4">
      <Notice tone="info">
        {t("emp.absHint")} <Link to="/ausencias" className="underline">{t("nav.absences")}</Link>.
      </Notice>
      <div className="grid sm:grid-cols-4 gap-3 items-end">
        <Input label={t("absWeb.from")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label={t("absWeb.to")} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select label={t("absWeb.type")} value={kind} onChange={(e) => setKind(e.target.value)} options={Object.entries(ABSENCE_LABEL).map(([value, label]) => ({ value, label }))} />
        <Input label={t("emp.note")} hint={`(${t("common.optional")})`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex justify-end"><Button variant="primary" disabled={saving} onClick={add}><Plus className="w-4 h-4" />{t("emp.addAbsence")}</Button></div>
      {absences.length === 0 ? <Empty>{t("emp.noAbsences")}</Empty> : (
        <Table head={[t("absWeb.from"), t("absWeb.to"), t("absWeb.type"), t("absWeb.status"), t("emp.note"), ""]}>
          {absences.map((a) => (
            <tr key={a.id}>
              <td className="px-3 py-2 whitespace-nowrap">{fmtDate(a.date_from)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{fmtDate(a.date_to)}</td>
              <td className="px-3 py-2">{ABSENCE_LABEL[a.kind] ?? a.kind}{a.hours ? ` (${a.hours} h)` : ""}</td>
              <td className="px-3 py-2">{ABSENCE_STATUS[a.status]?.label ?? a.status}</td>
              <td className="px-3 py-2">{a.notes ?? ""}</td>
              <td className="px-3 py-2 text-right">
                <button type="button" onClick={() => remove(a.id)} className="p-1 text-slate-400 hover:text-red-500 cursor-pointer" aria-label={t("common.delete")}><Trash2 className="w-3.5 h-3.5" /></button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function OtherEditor({ emp, onSaved, onRemove }: { emp: Emp; onSaved: () => void; onRemove: () => void }) {
  const [rlt, setRlt] = useState(emp.is_rlt);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function toggleRlt(v: boolean) {
    setMsg(null);
    const { error } = await supabase.rpc("admin_set_rlt", { p_user_id: emp.user_id, p_is_rlt: v });
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setRlt(v);
    setMsg({ tone: "ok", text: v ? t("emp.rltOn") : t("emp.rltOff") });
    onSaved();
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Toggle checked={rlt} onChange={toggleRlt} label={t("emp.rltLabel")}
          description={t("emp.rltDesc")} />
        <p className="text-[11px] text-slate-400">{t("emp.rltHint")}</p>
      </div>
      <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-2">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{t("emp.leaveTitle")}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("emp.leaveHint")}</p>
        <Button variant="danger" onClick={onRemove}><UserX className="w-4 h-4" />{t("emp.remove")}</Button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
