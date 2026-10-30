// src/pages/Mes.tsx — firma del resumen mensual y bolsa de horas
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DateTime } from "luxon";
import clsx from "clsx";
import { FileSignature, PiggyBank, Check, X, Plus, Download, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader, Card, Button, Notice, Empty, Loading, Input, Select, TextArea, Table, Tabs, Modal, Pill } from "@/components/ui/kit";
import StatCard from "@/components/ui/StatCard";
import { fetchPeople, type Person } from "@/lib/data";
import { downloadXlsx } from "@/lib/exporters";
import { TZ, errMsg, fmtDate, fmtDateTime, fullName, secondsToClock, secondsToHM, todayISO } from "@/lib/format";
import { liveLabels, t } from "@/i18n";

type SignRow = {
  user_id: string; display_name: string | null; worker_code: string | null; worked_seconds: number; expected_seconds: number; balance_seconds: number;
  signed_at: string | null; agrees: boolean | null; comment: string | null; snapshot_hash: string | null; changed_since: boolean | null;
};
type BankRow = { user_id: string; display_name: string | null; ym: string; balance_seconds: number; entries_seconds: number; running_seconds: number };
type Entry = { id: string; user_id: string; day: string; minutes: number; kind: string; note: string | null; created_at: string };

const KIND = liveLabels(["initial", "paid", "adjust"] as const, (k) => `mes.kind.${k}`) as Record<string, string>;
const ymLabel = (ym: string) => DateTime.fromFormat(ym, "yyyy-MM").toFormat("LLLL yyyy");
const pastMonths = (n = 18) => {
  const now = DateTime.now().setZone(TZ);
  return Array.from({ length: n }, (_, i) => now.minus({ months: i + 1 })).map((d) => ({ value: d.toFormat("yyyy-MM"), label: d.toFormat("LLLL yyyy") }));
};
const signState = (r: SignRow) =>
  !r.signed_at ? { label: t("mes.unsigned"), cls: "bg-slate-500/10 text-slate-500 border-slate-500/20" }
  : r.changed_since ? { label: t("mes.changedAfter"), cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" }
  : r.agrees ? { label: t("pub.agree"), cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" }
  : { label: t("pub.disagree"), cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" };

// ---------------------------------------------------------------------
// Bolsa de horas (tabla por meses)
// ---------------------------------------------------------------------
function BankTable({ rows }: { rows: BankRow[] }) {
  return (
    <Table head={[t("rlt.month"), t("mes.monthDiff"), t("mes.entries"), t("mes.running")]}>
      {[...rows].reverse().map((r) => (
        <tr key={r.user_id + r.ym}>
          <td className="px-3 py-2 capitalize whitespace-nowrap">{ymLabel(r.ym)}</td>
          <td className={clsx("px-3 py-2", r.balance_seconds < 0 && "text-red-500")}>{secondsToHM(r.balance_seconds)}</td>
          <td className="px-3 py-2">{r.entries_seconds ? secondsToHM(r.entries_seconds) : "—"}</td>
          <td className={clsx("px-3 py-2 font-semibold", r.running_seconds < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400")}>{secondsToHM(r.running_seconds)}</td>
        </tr>
      ))}
    </Table>
  );
}

// ---------------------------------------------------------------------
// Trabajador
// ---------------------------------------------------------------------
function WorkerMonth() {
  const { userId, settings } = useProfile();
  const months = useMemo(() => pastMonths(), []);
  const [ym, setYm] = useState(months[0].value);
  const [row, setRow] = useState<SignRow | null>(null);
  const [history, setHistory] = useState<{ ym: string; signed_at: string; agrees: boolean; comment: string | null }[]>([]);
  const [bank, setBank] = useState<BankRow[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [disagree, setDisagree] = useState(false);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const [s, h, b, e] = await Promise.all([
      supabase.rpc("get_month_signoffs", { p_ym: ym }),
      supabase.from("monthly_signoffs").select("ym, signed_at, agrees, comment").eq("user_id", userId).order("signed_at", { ascending: false }).limit(24),
      settings.hourBankEnabled ? supabase.rpc("get_hour_bank", {}) : Promise.resolve({ data: [] }),
      settings.hourBankEnabled ? supabase.from("hour_bank_entries").select("id, user_id, day, minutes, kind, note, created_at").eq("user_id", userId).order("day", { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
    if ((s as { error?: unknown }).error) setMsg({ tone: "error", text: errMsg((s as { error: unknown }).error) });
    setRow(((s.data ?? []) as SignRow[])[0] ?? null);
    setHistory((h.data ?? []) as { ym: string; signed_at: string; agrees: boolean; comment: string | null }[]);
    setBank((b.data ?? []) as BankRow[]);
    setEntries((e.data ?? []) as Entry[]);
    setLoading(false);
  }, [userId, ym, settings.hourBankEnabled]);
  useEffect(() => { load(); }, [load]);

  async function sign(agree: boolean) {
    setMsg(null);
    if (!agree && comment.trim().length < 5) { setMsg({ tone: "error", text: t("errors.db.explainDisagreement") }); return; }
    setSaving(true);
    const { error } = await supabase.rpc("sign_month", { p_ym: ym, p_agree: agree, p_comment: agree ? null : comment.trim(), p_user_agent: navigator.userAgent.slice(0, 200) });
    setSaving(false);
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setDisagree(false); setComment("");
    setMsg({ tone: "ok", text: agree ? t("mes.signedOk") : t("mes.signedDisagree") });
    load();
  }

  if (loading) return <Loading />;
  const st = row ? signState(row) : null;
  const current = bank.length ? bank[bank.length - 1] : null;

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.myMonth")} subtitle={t("mes.workerSub")}
        actions={<Select value={ym} onChange={(e) => setYm(e.target.value)} options={months} />} />

      {settings.monthlySignoffEnabled ? (
        <Card title={t("mes.summaryOf", { month: ymLabel(ym) })} icon={<FileSignature className="w-4 h-4" />}
          actions={st ? <Pill className={`border ${st.cls}`}>{st.label}</Pill> : undefined}>
          {!row ? <Empty>{t("mes.noData")}</Empty> : (
            <div className="space-y-4">
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                <StatCard title={t("cells.worked")} value={secondsToHM(row.worked_seconds)} />
                <StatCard title={t("cells.expected")} value={secondsToHM(row.expected_seconds)} sub={t("mes.bySchedule")} />
                <StatCard title={t("mes.diff")} value={secondsToHM(row.balance_seconds)} sub={row.balance_seconds > 0 ? t("mes.above") : row.balance_seconds < 0 ? t("mes.below") : ""} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("mes.detailA")} <Link to="/informes" className="underline">{t("nav.myRecords")}</Link>{t("mes.detailB")}
              </p>
              {row.signed_at && (
                <Notice tone={row.changed_since ? "warn" : row.agrees ? "ok" : "info"}>
                  {row.agrees ? t("mes.signedAgreeOn", { when: fmtDateTime(row.signed_at) }) : t("mes.signedDisagreeOn", { when: fmtDateTime(row.signed_at) })}{row.comment ? `: “${row.comment}”` : "."}
                  {row.changed_since && ` ${t("mes.changedNote")}`}
                </Notice>
              )}
              {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
              {(!row.signed_at || row.changed_since) && (
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button variant="danger" onClick={() => { setComment(""); setDisagree(true); }}><X className="w-4 h-4" />{t("mes.notAgree")}</Button>
                  <Button variant="success" disabled={saving} onClick={() => sign(true)}><Check className="w-4 h-4" />{t("mes.signAgree")}</Button>
                </div>
              )}
              <p className="text-[11px] text-slate-400">{t("mes.hashNote")}</p>
            </div>
          )}
        </Card>
      ) : <Notice tone="info">{t("mes.signoffOff")}</Notice>}

      {settings.hourBankEnabled && (
        <Card title={t("mes.myBank")} icon={<PiggyBank className="w-4 h-4" />}
          actions={current ? <span className={clsx("text-sm font-semibold", current.running_seconds < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400")}>{secondsToHM(current.running_seconds)}</span> : undefined}>
          {bank.length === 0 ? <Empty>{t("mes.bankStarts", { from: settings.hourBankStart ? fmtDate(settings.hourBankStart) : "—" })}</Empty> : (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("mes.bankHint")} <Link to="/ausencias" className="underline">{t("mes.compRest")}</Link>.
              </p>
              <BankTable rows={bank} />
              {entries.length > 0 && (
                <Table head={[t("cells.date"), t("mes.entry"), t("absWeb.hours"), t("emp.note")]}>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.day)}</td>
                      <td className="px-3 py-2">{KIND[e.kind] ?? e.kind}</td>
                      <td className="px-3 py-2">{secondsToHM(e.minutes * 60)}</td>
                      <td className="px-3 py-2 text-slate-500">{e.note ?? ""}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
          )}
        </Card>
      )}

      {history.length > 0 && (
        <Card title={t("mes.mySignatures")}>
          <Table head={[t("rlt.month"), t("mes.signed"), t("mes.result"), t("mes.comment")]}>
            {history.map((h) => (
              <tr key={h.ym + h.signed_at}>
                <td className="px-3 py-2 capitalize whitespace-nowrap">{ymLabel(h.ym)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(h.signed_at)}</td>
                <td className="px-3 py-2">{h.agrees ? t("pub.agree") : t("pub.disagree")}</td>
                <td className="px-3 py-2 text-slate-500">{h.comment ?? ""}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={disagree} onClose={() => setDisagree(false)} title={t("mes.disagreeTitle", { month: ymLabel(ym) })}
        footer={<><Button onClick={() => setDisagree(false)}>{t("common.cancel")}</Button><Button variant="danger" disabled={saving} onClick={() => sign(false)}>{t("mes.signDisagree")}</Button></>}>
        <div className="space-y-3">
          <TextArea label={t("mes.whatDisagree")} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder={t("mes.whatDisagreePh")} />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("mes.disagreeHint")} <Link to="/incidencias" className="underline">{t("mes.correctionLink")}</Link>.
          </p>
          {msg?.tone === "error" && <Notice tone="error">{msg.text}</Notice>}
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------
// Empresa
// ---------------------------------------------------------------------
function AdminMonth() {
  const { companyId, settings } = useProfile();
  const months = useMemo(() => pastMonths(), []);
  const [tab, setTab] = useState<"sign" | "bank">(settings.monthlySignoffEnabled || !settings.hourBankEnabled ? "sign" : "bank");
  const [ym, setYm] = useState(months[0].value);
  const [rows, setRows] = useState<SignRow[]>([]);
  const [bank, setBank] = useState<BankRow[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ user: "", day: todayISO(), kind: "paid", hours: "", note: "" });
  const [fmsg, setFmsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setError(null);
    const [s, b, e, pp] = await Promise.all([
      supabase.rpc("get_month_signoffs", { p_ym: ym }),
      settings.hourBankEnabled ? supabase.rpc("get_hour_bank", {}) : Promise.resolve({ data: [], error: null }),
      settings.hourBankEnabled ? supabase.from("hour_bank_entries").select("id, user_id, day, minutes, kind, note, created_at").eq("company_id", companyId).order("day", { ascending: false }).limit(300) : Promise.resolve({ data: [] }),
      fetchPeople(),
    ]);
    if (s.error) setError(errMsg(s.error));
    if (b.error) setError(errMsg(b.error));
    setRows((s.data ?? []) as SignRow[]);
    setBank((b.data ?? []) as BankRow[]);
    setEntries((e.data ?? []) as Entry[]);
    setPeople(pp.filter((p) => p.company_id === companyId && p.role === "employee" && p.employee_status === "active"));
    setLoading(false);
  }, [companyId, ym, settings.hourBankEnabled]);
  useEffect(() => { load(); }, [load]);

  const byUser = useMemo(() => {
    const m = new Map<string, BankRow[]>();
    for (const r of bank) m.set(r.user_id, [...(m.get(r.user_id) ?? []), r]);
    return [...m.entries()].map(([uid, list]) => ({ uid, name: list[0].display_name ?? "—", list, total: list[list.length - 1].running_seconds }));
  }, [bank]);
  const nameOf = (uid: string) => { const p = people.find((x) => x.user_id === uid); return p ? fullName(p) : byUser.find((b) => b.uid === uid)?.name ?? "—"; };

  async function addEntry() {
    setFmsg(null);
    const h = Number(f.hours.replace(",", "."));
    if (!f.user) { setFmsg(t("absWeb.pickPerson")); return; }
    if (!Number.isFinite(h) || h === 0 || Math.abs(h) > 1500) { setFmsg(t("mes.hoursInvalid")); return; }
    const minutes = Math.round(h * 60) * (f.kind === "paid" ? (h > 0 ? -1 : 1) : 1);
    const { error } = await supabase.from("hour_bank_entries").insert({ company_id: companyId, user_id: f.user, day: f.day, minutes, kind: f.kind, note: f.note.trim() || null });
    if (error) { setFmsg(errMsg(error)); return; }
    setAdding(false);
    setF({ user: "", day: todayISO(), kind: "paid", hours: "", note: "" });
    load();
  }

  function exportSign() {
    downloadXlsx(`${t("mes.signFile")}_${ym}`, [{
      name: t("mes.signSheet"), title: `${t("mes.signTitle")} · ${ymLabel(ym)}`,
      head: [t("absWeb.person"), t("rlt.code"), t("cells.worked"), t("cells.expected"), t("mes.diff"), t("absWeb.status"), t("mes.signed"), t("mes.comment"), t("mes.hash")],
      rows: rows.map((r) => [r.display_name ?? "", r.worker_code ?? "", secondsToClock(r.worked_seconds), secondsToClock(r.expected_seconds),
        secondsToClock(r.balance_seconds), signState(r).label, r.signed_at ? fmtDateTime(r.signed_at) : "", r.comment ?? "", r.snapshot_hash ?? ""]),
    }]);
  }
  function exportBank() {
    downloadXlsx(t("mes.bankFile"), [{
      name: t("mes.bankSheet"), title: t("settingsWeb.bank"),
      head: [t("absWeb.person"), t("rlt.month"), t("mes.monthDiff"), t("mes.entries"), t("mes.running")],
      rows: bank.map((r) => [r.display_name ?? "", r.ym, secondsToClock(r.balance_seconds), secondsToClock(r.entries_seconds), secondsToClock(r.running_seconds)]),
    }, {
      name: t("mes.entries"), head: [t("absWeb.person"), t("cells.date"), t("absWeb.type"), t("absWeb.hours"), t("emp.note"), t("mes.recordedAt")],
      rows: entries.map((e) => [nameOf(e.user_id), fmtDate(e.day), KIND[e.kind] ?? e.kind, secondsToClock(e.minutes * 60), e.note ?? "", fmtDateTime(e.created_at)]),
    }]);
  }

  if (loading) return <Loading />;
  const signed = rows.filter((r) => r.signed_at && !r.changed_since).length;
  const disagree = rows.filter((r) => r.signed_at && r.agrees === false).length;

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.monthClose")} subtitle={t("mes.adminSub")} />
      {error && <Notice tone="error">{error}</Notice>}
      <Tabs<"sign" | "bank"> value={tab} onChange={setTab} tabs={[
        { value: "sign", label: t("mes.tabSign") },
        { value: "bank", label: t("settingsWeb.bank") },
      ]} />

      {tab === "sign" && (
        <Card title={t("mes.signCard")} icon={<FileSignature className="w-4 h-4" />}
          actions={<Button onClick={exportSign} aria-label={t("mes.downloadXlsx")}><Download className="w-4 h-4" /></Button>}>
          <Select value={ym} onChange={(e) => setYm(e.target.value)} options={months} className="max-w-xs mb-3" />
          {!settings.monthlySignoffEnabled && <Notice tone="info" className="mb-4">{t("mes.signoffOffAdmin")}</Notice>}
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t("mes.signedCount", { n: signed, total: rows.length })}{disagree ? ` · ${t("mes.disagreeCount", { count: disagree })}` : ""}.</p>
          {rows.length === 0 ? <Empty>{t("mes.noWorkers")}</Empty> : (
            <Table head={[t("absWeb.person"), t("cells.worked"), t("cells.expected"), t("mes.diff"), t("absWeb.status"), t("mes.signed"), t("mes.comment")]}>
              {rows.map((r) => {
                const s = signState(r);
                return (
                  <tr key={r.user_id}>
                    <td className="px-3 py-2 whitespace-nowrap">{r.display_name}</td>
                    <td className="px-3 py-2">{secondsToHM(r.worked_seconds)}</td>
                    <td className="px-3 py-2">{secondsToHM(r.expected_seconds)}</td>
                    <td className={clsx("px-3 py-2", r.balance_seconds < 0 && "text-red-500")}>{secondsToHM(r.balance_seconds)}</td>
                    <td className="px-3 py-2"><Pill className={`border ${s.cls}`}>{s.label}</Pill></td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.signed_at ? fmtDateTime(r.signed_at) : "—"}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-xs">{r.comment ?? ""}</td>
                  </tr>
                );
              })}
            </Table>
          )}
          <p className="text-[11px] text-slate-400 mt-3">{t("mes.signFoot")}</p>
        </Card>
      )}

      {tab === "bank" && (
        !settings.hourBankEnabled ? <Notice tone="info">{t("mes.bankOff")}</Notice> : (
          <Card title={t("settingsWeb.bank")} icon={<PiggyBank className="w-4 h-4" />}
            actions={<div className="flex gap-2"><Button onClick={exportBank}><Download className="w-4 h-4" /></Button><Button variant="primary" onClick={() => { setFmsg(null); setAdding(true); }}><Plus className="w-4 h-4" />{t("mes.entry")}</Button></div>}>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t("mes.bankAdminHint", { from: settings.hourBankStart ? fmtDate(settings.hourBankStart) : "—" })}</p>
            {byUser.length === 0 ? <Empty>{t("mes.noDataYet")}</Empty> : (
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {byUser.map((u) => (
                  <div key={u.uid} className="py-2">
                    <button type="button" onClick={() => setOpenUser(openUser === u.uid ? null : u.uid)} className="w-full flex items-center justify-between gap-3 cursor-pointer text-left">
                      <span className="text-sm text-slate-800 dark:text-slate-100">{u.name}</span>
                      <span className={clsx("text-sm font-semibold", u.total < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400")}>{secondsToHM(u.total)}</span>
                    </button>
                    {openUser === u.uid && <div className="mt-3"><BankTable rows={u.list} /></div>}
                  </div>
                ))}
              </div>
            )}
            {entries.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-medium text-slate-500 mb-2">{t("mes.recordedEntries")}</p>
                <Table head={[t("absWeb.person"), t("cells.date"), t("absWeb.type"), t("absWeb.hours"), t("emp.note")]}>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{nameOf(e.user_id)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.day)}</td>
                      <td className="px-3 py-2">{KIND[e.kind] ?? e.kind}</td>
                      <td className="px-3 py-2">{secondsToHM(e.minutes * 60)}</td>
                      <td className="px-3 py-2 text-slate-500">{e.note ?? ""}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>
        )
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title={t("mes.entryTitle")}
        footer={<><Button onClick={() => setAdding(false)}>{t("common.cancel")}</Button><Button variant="primary" onClick={addEntry}>{t("common.save")}</Button></>}>
        <div className="space-y-3">
          <Select label={t("absWeb.person")} value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} placeholder={t("absWeb.choose")} options={people.map((p) => ({ value: p.user_id, label: fullName(p) }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select label={t("absWeb.type")} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={Object.entries(KIND).map(([value, label]) => ({ value, label }))} />
            <Input label={t("cells.date")} type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
          </div>
          <Input label={t("absWeb.hours")} type="number" step="0.25" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })}
            hint={f.kind === "paid" ? t("mes.paidHint") : t("mes.adjustHint")} />
          <Input label={t("emp.note")} hint={`(${t("common.optional")})`} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={t("mes.notePh")} />
          <Notice tone="info"><span className="inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{t("mes.immutableA")}</span> {t("mes.immutableB")}</Notice>
          {fmsg && <Notice tone="error">{fmsg}</Notice>}
        </div>
      </Modal>
    </div>
  );
}

export default function Mes() {
  const { isAdmin, loading, companyId, employeeStatus } = useProfile();
  if (loading) return <Loading />;
  if (!companyId || (!isAdmin && employeeStatus !== "active")) return <Empty>{t("absWeb.needCompany")}</Empty>;
  return isAdmin ? <AdminMonth /> : <WorkerMonth />;
}
