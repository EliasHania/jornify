// src/pages/Reports.tsx — registro mensual detallado y resumen para nómina
import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { Download, FileText, FileSpreadsheet, Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader, Card, Button, Notice, Empty, Loading, Tabs, Select, Table, Pill } from "@/components/ui/kit";
import StatCard from "@/components/ui/StatCard";
import {
  buildMonth, fetchCenters, fetchDaily, fetchExpected, fetchPeople, fetchPunches, fetchTerms,
  type Center, type DayRow, type Person, type Terms,
} from "@/lib/data";
import { dayHead, dayCells } from "@/lib/dayCells";
import { locale, t } from "@/i18n";
import { downloadCsv, downloadPdf, downloadXlsx, type Cell } from "@/lib/exporters";
import {
  TZ, currentYM, errMsg, fmtDate, fullName, minutesToHours, monthOptions, monthRange, scheduleText, secondsToClock, secondsToHM,
} from "@/lib/format";

type Balance = {
  user_id: string; display_name: string | null; worker_code: string; is_archived: boolean;
  jornada_type: string | null; weekly_minutes: number | null; part_time_pct: number | null; flexible: boolean | null;
  expected_seconds: number; worked_seconds: number; remote_seconds: number; break_seconds: number;
  balance_seconds: number; excess_seconds: number; days_worked: number; absence_days: number;
  holiday_days: number; corrected_days: number; open_days: number;
};

const jornadaText = (w: Terms | null) =>
  w ? `${w.jornada_type === "parcial" ? t("emp.partPct", { pct: w.part_time_pct ?? "—" }) : t("emp.full")} · ${t("pub.perWeek", { h: minutesToHours(w.weekly_minutes) })}` : t("pub.noTerms");

export default function Reports() {
  const p = useProfile();
  const { isAdmin, userId, companyId, loading: profileLoading } = p;

  const [tab, setTab] = useState<"detail" | "payroll">("detail");
  const [ym, setYm] = useState(currentYM());
  const [people, setPeople] = useState<Person[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [terms, setTerms] = useState<Terms[]>([]);
  const [worker, setWorker] = useState<string>("");
  const [days, setDays] = useState<DayRow[]>([]);
  const [balance, setBalance] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => monthRange(ym), [ym]);

  // Datos fijos
  useEffect(() => {
    if (profileLoading || !companyId) return;
    Promise.all([isAdmin ? fetchPeople() : Promise.resolve([] as Person[]), fetchCenters(companyId), fetchTerms(companyId, isAdmin ? null : userId)])
      .then(([pp, cc, tt]) => {
        setPeople(pp);
        setCenters(cc);
        setTerms(tt);
        if (!isAdmin) setWorker(userId ?? "");
      })
      .catch((e) => setError(errMsg(e)));
  }, [profileLoading, companyId, isAdmin, userId]);

  const workers = useMemo(
    () => people.filter((x) => x.role === "employee" && (x.company_id === companyId || x.is_archived || x.employee_status === "removed"))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), locale())),
    [people, companyId]
  );
  useEffect(() => { if (isAdmin && !worker && workers.length) setWorker(workers[0].user_id); }, [isAdmin, worker, workers]);

  const centerName = useCallback((id: string | null) => (id ? centers.find((c) => c.id === id)?.name ?? "—" : centers.find((c) => c.is_primary)?.name ?? t("pub.mainCenter")), [centers]);

  const loadMonth = useCallback(async (uid: string) => {
    if (!companyId) return [] as DayRow[];
    const end = DateTime.fromISO(range.endISO).plus({ hours: 14 }).toUTC().toISO()!;
    const [punches, daily, expected] = await Promise.all([
      fetchPunches({ companyId, userId: uid, fromISO: range.startISO, toISO: end }),
      fetchDaily(companyId, range.startDate, range.endDate, uid),
      fetchExpected(range.startDate, range.endDate, uid).catch(() => []),
    ]);
    return buildMonth(range.startDate, range.endDate, punches, daily, expected.filter((e) => e.user_id === uid));
  }, [companyId, range]);

  // Detalle
  useEffect(() => {
    if (tab !== "detail" || !companyId) return;
    if (!worker) { setDays([]); setBalance([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    Promise.all([loadMonth(worker), supabase.rpc("get_monthly_balance", { p_ym: ym, p_user_id: worker })])
      .then(([d, b]) => {
        setDays(d);
        if (b.error) throw b.error;
        setBalance((b.data ?? []) as Balance[]);
      })
      .catch((e) => setError(errMsg(e, t("rep.loadError"))))
      .finally(() => setLoading(false));
  }, [tab, worker, ym, companyId, loadMonth]);

  // Nómina
  useEffect(() => {
    if (tab !== "payroll" || !isAdmin) return;
    setLoading(true);
    setError(null);
    supabase.rpc("get_monthly_balance", { p_ym: ym, p_user_id: null })
      .then(({ data, error: e }) => { if (e) setError(errMsg(e)); setBalance((data ?? []) as Balance[]); })
      .then(() => setLoading(false));
  }, [tab, ym, isAdmin]);

  const person = isAdmin ? people.find((x) => x.user_id === worker) : null;
  const workerName = isAdmin ? (person ? (person.is_archived ? t("emp.deleted") : fullName(person)) : "—") : [p.firstName, p.lastName].filter(Boolean).join(" ") || "—";
  const workerDni = isAdmin ? person?.dni ?? "" : p.dni ?? "";
  const monthTerms = terms.filter((w) => w.user_id === worker && w.valid_from <= range.endDate && (!w.valid_to || w.valid_to >= range.startDate));
  const termsNow = monthTerms[0] ?? null;
  const b = balance.find((x) => x.user_id === worker);
  const hasTerms = !!b?.jornada_type;
  const companyLine = [p.companyLegalName || p.companyName, p.companyCif && `${t("pub.cif")} ${p.companyCif}`].filter(Boolean).join(" · ");
  const companyAddr = [p.companyAddress, p.companyPostalCode, p.companyCity, p.companyProvince].filter(Boolean).join(", ");

  const workerPdfTable = (rows: DayRow[]) => rows.map((d) => dayCells(d, centerName, hasTerms));

  function summaryRows(bb: Balance | undefined): [string, string][] {
    if (!bb) return [];
    return [
      [t("cells.worked"), secondsToClock(bb.worked_seconds)],
      [t("pub.ofWhichRemote"), secondsToClock(bb.remote_seconds)],
      ...(bb.jornada_type ? [
        [t("rep.expectedBySchedule"), secondsToClock(bb.expected_seconds)] as [string, string],
        [t("rlt.balance"), secondsToClock(bb.balance_seconds)] as [string, string],
        [bb.jornada_type === "parcial" ? t("rep.aboveComp") : t("rep.aboveExtra"), secondsToClock(bb.excess_seconds)] as [string, string],
      ] : []),
      [t("rep.daysWorked"), String(bb.days_worked)],
      [t("rep.absHol"), `${bb.absence_days} / ${bb.holiday_days}`],
    ];
  }

  const pdfSpecFor = (name: string, dni: string, wt: Terms[], rows: DayRow[], bb: Balance | undefined) => ({
    title: t("rep.pdfTitle"),
    subtitle: `${t("rep.pdfLaw")} · ${range.label}`,
    blocks: [
      { heading: t("inc.company"), rows: [[t("settingsWeb.legalName"), p.companyLegalName || p.companyName || "—"], [t("pub.cif"), p.companyCif || "—"], [t("rep.domicile"), companyAddr || "—"], [t("pub.agreement"), p.collectiveAgreement || "—"]] as [string, string][] },
      { heading: t("corrWeb.worker"), rows: [[t("settingsWeb.holName"), name], [t("emp.idNumber"), dni || "—"], [t("emp.jornada"), wt.map((x) => jornadaText(x)).join(" | ") || "—"], [t("emp.schedule"), wt.map((x) => `${scheduleText(x.schedule)}${x.flexible ? ` (${t("emp.flexibleShort")})` : ""}`).join(" | ") || "—"]] as [string, string][] },
      { heading: t("rep.monthSummary"), rows: summaryRows(bb) },
    ],
    tables: [{ head: hasTerms ? dayHead() : dayHead().filter((_, i) => i !== 7), body: hasTerms ? workerPdfTable(rows) : workerPdfTable(rows).map((r) => r.filter((_, i) => i !== 7)) }],
    notes: [t("rep.note1"), t("rep.note2"), t("rep.note3")],
    signatures: true,
  });

  async function exportWorkerPdf() {
    await downloadPdf({ filename: `jornify_${workerName}_${ym}`, landscape: true, ...pdfSpecFor(workerName, workerDni, monthTerms, days, b) });
  }

  async function exportWorkerXlsx() {
    await downloadXlsx(`jornify_${workerName}_${ym}`, [{
      name: range.label,
      title: `${t("pub.record")} · ${range.label}`,
      info: [
        [t("inc.company"), companyLine], [t("rep.domicile"), companyAddr], [t("corrWeb.worker"), workerName], [t("emp.idNumber"), workerDni || "—"],
        [t("emp.jornada"), monthTerms.map(jornadaText).join(" | ") || "—"],
        [t("emp.schedule"), monthTerms.map((x) => scheduleText(x.schedule)).join(" | ") || "—"],
      ],
      head: dayHead(),
      rows: days.map((d) => dayCells(d, centerName, true)),
      footer: summaryRows(b),
      widths: [11, 11, 30, 22, 14, 18, 10, 10, 40],
    }]);
  }

  async function exportAllPdf() {
    if (!balance.length) return;
    setBusy(true);
    try {
      const allTerms = terms;
      // Un PDF por persona, en secuencia, para no saturar el navegador
      for (const bb of balance) {
        const per = people.find((x) => x.user_id === bb.user_id);
        const name = bb.is_archived ? t("emp.deleted") : bb.display_name || per?.email || bb.worker_code;
        const rows = await loadMonth(bb.user_id);
        const wt = allTerms.filter((x) => x.user_id === bb.user_id && x.valid_from <= range.endDate && (!x.valid_to || x.valid_to >= range.startDate));
        await downloadPdf({ filename: `jornify_${name}_${ym}`, landscape: true, ...pdfSpecFor(name, per?.dni ?? "", wt, rows, bb) });
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const payHead = [t("corrWeb.worker"), t("rlt.code"), t("emp.jornada"), t("emp.hoursWeek"), t("cells.expected"), t("cells.worked"), t("fmt.mode.teletrabajo"), t("rlt.balance"), t("rep.above"), t("rlt.daysWorked"), t("nav.absences"), t("rep.holidays"), t("rlt.correctedDays"), t("rlt.unclosed")];
  const payRows: Cell[][] = balance.map((x) => [
    x.is_archived ? t("emp.deleted") : x.display_name ?? "—", x.worker_code,
    x.jornada_type ? (x.jornada_type === "parcial" ? t("emp.partPct", { pct: x.part_time_pct ?? "" }) : t("emp.full")) : t("rlt.undefined"),
    x.weekly_minutes != null ? minutesToHours(x.weekly_minutes) : "—",
    x.jornada_type ? secondsToClock(x.expected_seconds) : "—", secondsToClock(x.worked_seconds), secondsToClock(x.remote_seconds),
    x.jornada_type ? secondsToClock(x.balance_seconds) : "—", x.jornada_type ? secondsToClock(x.excess_seconds) : "—",
    x.days_worked, x.absence_days, x.holiday_days, x.corrected_days, x.open_days,
  ]);

  if (profileLoading) return <Loading />;
  if (!companyId) return <Empty>{t("errors.db.noCompany")}</Empty>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAdmin ? t("nav.reports") : t("nav.myRecords")}
        subtitle={isAdmin ? t("rep.adminSub") : t("rep.workerSub")}
        actions={tab === "detail" && days.length > 0 && !loading ? (
          <>
            <Button onClick={exportWorkerXlsx}><Download className="w-4 h-4" />Excel</Button>
            <Button variant="primary" onClick={exportWorkerPdf}><FileText className="w-4 h-4" />PDF</Button>
          </>
        ) : tab === "payroll" && balance.length > 0 && !loading ? (
          <>
            <Button onClick={() => downloadCsv(`jornify_${t("rep.payFile")}_${ym}`, payHead, payRows)}><Download className="w-4 h-4" />CSV</Button>
            <Button onClick={() => downloadXlsx(`jornify_${t("rep.payFile")}_${ym}`, [{ name: t("rlt.sheetSummary"), title: `${t("rep.tabPayroll")} · ${range.label}`, info: [[t("inc.company"), companyLine]], head: payHead, rows: payRows }])}>
              <FileSpreadsheet className="w-4 h-4" />Excel
            </Button>
            <Button variant="primary" disabled={busy} onClick={exportAllPdf}><Users className="w-4 h-4" />{busy ? t("rep.generating") : t("rep.pdfEach")}</Button>
          </>
        ) : undefined}
      />

      {isAdmin && (
        <Tabs<"detail" | "payroll"> value={tab} onChange={setTab} tabs={[{ value: "detail", label: t("rep.tabDetail") }, { value: "payroll", label: t("rep.tabPayroll") }]} />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Select label={t("rlt.month")} value={ym} onChange={(e) => setYm(e.target.value)} options={monthOptions(48)} />
        {isAdmin && tab === "detail" && (
          <Select label={t("corrWeb.worker")} value={worker} onChange={(e) => setWorker(e.target.value)}
            options={workers.map((w) => ({ value: w.user_id, label: (w.is_archived ? t("emp.deleted") : fullName(w)) + (w.company_id !== companyId ? ` (${t("rep.left")})` : "") }))} />
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {(!p.companyCif || !p.companyLegalName) && isAdmin && (
        <Notice tone="warn">{t("rep.missingLegal")}</Notice>
      )}

      {loading ? <Loading /> : tab === "detail" ? (
        <>
          {termsNow ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {jornadaText(termsNow)} · {scheduleText(termsNow.schedule)}{termsNow.flexible ? ` (${t("emp.flexibleShort")})` : ""}
              {monthTerms.length > 1 && ` · ${t("rep.changed", { from: fmtDate(monthTerms[0].valid_from) })}`}
            </p>
          ) : (
            <Notice tone="warn">{isAdmin ? t("rep.noTermsAdmin") : t("rep.noTermsWorker")}</Notice>
          )}

          {b && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title={t("cells.worked")} value={secondsToHM(b.worked_seconds)} sub={b.remote_seconds ? t("rep.inRemote", { v: secondsToHM(b.remote_seconds) }) : t("absWeb.days", { count: b.days_worked })} />
              <StatCard title={t("cells.expected")} value={hasTerms ? secondsToHM(b.expected_seconds) : "—"} sub={hasTerms ? t("rep.absHolSub", { a: b.absence_days, h: b.holiday_days }) : t("rep.noTermsShort")} />
              <StatCard title={t("rlt.balance")} value={hasTerms ? secondsToHM(b.balance_seconds) : "—"} sub={t("rep.balanceSub")} />
              <StatCard title={b.jornada_type === "parcial" ? t("rep.complementary") : t("rep.aboveJornada")} value={hasTerms ? secondsToHM(b.excess_seconds) : "—"}
                sub={b.open_days ? t("rep.openDays", { count: b.open_days }) : b.corrected_days ? t("rep.correctedDays", { count: b.corrected_days }) : t("rep.monthExcess")} />
            </div>
          )}

          <Card className="!p-0 overflow-hidden">
            {days.every((d) => !d.punches.length && !d.absence && !d.holiday) ? <Empty>{t("rep.noPunches", { month: range.label })}</Empty> : (
              <Table head={dayHead()} className="border-0 rounded-none">
                {days.map((d) => {
                  const cells = dayCells(d, centerName, hasTerms);
                  const weekend = [6, 7].includes(DateTime.fromISO(d.day, { zone: TZ }).weekday);
                  const empty = !d.punches.length && !d.absence && !d.holiday;
                  return (
                    <tr key={d.day} className={empty ? "text-slate-400" : weekend ? "bg-slate-50/60 dark:bg-white/[0.02]" : ""}>
                      {cells.map((c, i) => (
                        <td key={i} className={`px-3 py-1.5 ${i === 8 ? "" : "whitespace-nowrap"}`}>
                          {i === 8 && d.open ? <Pill className="bg-red-500/10 text-red-600 border-red-500/20">{c}</Pill> : c}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
          <p className="text-[11px] text-slate-400">
            {t("rep.footNote")} {isAdmin ? t("rep.footAdmin") : t("rep.footWorker")}
          </p>
        </>
      ) : (
        <>
          <Card className="!p-0 overflow-hidden">
            {balance.length === 0 ? <Empty>{t("rep.noData", { month: range.label })}</Empty> : (
              <Table head={payHead} className="border-0 rounded-none">
                {payRows.map((r, i) => (
                  <tr key={i} className={balance[i].open_days ? "bg-red-500/5" : ""}>
                    {r.map((c, j) => <td key={j} className="px-3 py-2 whitespace-nowrap">{c}</td>)}
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <Notice tone="info">
            {t("rep.payNote")}
            {balance.some((x) => x.open_days) && ` ${t("rep.payNoteRed")}`}
          </Notice>
        </>
      )}
    </div>
  );
}
