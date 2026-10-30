// src/pages/Representacion.tsx — acceso de la representación legal de los trabajadores (datos seudonimizados)
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { DateTime } from "luxon";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader, Card, Button, Select, Notice, Empty, Loading, Tabs, Table } from "@/components/ui/kit";
import { currentYM, errMsg, fmtTime, minutesToHours, monthOptions, monthRange, secondsToClock, secondsToHM } from "@/lib/format";
import { downloadXlsx, type Cell } from "@/lib/exporters";
import { FileSpreadsheet } from "lucide-react";
import { t } from "@/i18n";

type Summary = {
  worker_code: string; jornada_type: string | null; weekly_minutes: number | null; part_time_pct: number | null;
  expected_seconds: number; worked_seconds: number; remote_seconds: number; balance_seconds: number;
  excess_seconds: number; days_worked: number; absence_days: number; corrected_days: number; open_days: number;
};
type Daily = {
  worker_code: string; day: string; first_in_ts: string | null; last_out_ts: string | null;
  work_seconds: number; break_seconds: number; remote_work_seconds: number; has_corrections: boolean; is_open: boolean;
};

export default function Representacion() {
  const { isRlt, isAdmin, workerCode } = useProfile();
  const [ym, setYm] = useState(currentYM());
  const [tab, setTab] = useState<"summary" | "daily">("summary");
  const [summary, setSummary] = useState<Summary[]>([]);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isRlt) return;
    setLoading(true); setError(null);
    Promise.all([supabase.rpc("rlt_monthly_summary", { p_ym: ym }), supabase.rpc("rlt_daily_records", { p_ym: ym })])
      .then(([s, d]) => {
        if (s.error || d.error) setError(errMsg(s.error ?? d.error));
        setSummary((s.data ?? []) as Summary[]);
        setDaily((d.data ?? []) as Daily[]);
      })
      .finally(() => setLoading(false));
  }, [ym, isRlt]);

  if (!isRlt || isAdmin) return <Navigate to="/" replace />;

  const sHead = [t("rlt.code"), t("emp.jornada"), t("emp.hoursWeek"), t("rlt.expected"), t("rlt.worked"), t("fmt.mode.teletrabajo"), t("rlt.balance"), t("rlt.excess"), t("rlt.daysWorked"), t("nav.absences"), t("rlt.correctedDays"), t("rlt.unclosed")];
  const sBody: Cell[][] = summary.map((s) => [
    s.worker_code, s.jornada_type ? (s.jornada_type === "parcial" ? t("emp.partPct", { pct: s.part_time_pct ?? "" }) : t("emp.full")) : t("rlt.undefined"),
    s.weekly_minutes != null ? minutesToHours(s.weekly_minutes) : "—", s.jornada_type ? secondsToClock(s.expected_seconds) : "—",
    secondsToClock(s.worked_seconds), secondsToClock(s.remote_seconds), s.jornada_type ? secondsToClock(s.balance_seconds) : "—",
    s.jornada_type ? secondsToClock(s.excess_seconds) : "—", s.days_worked, s.absence_days, s.corrected_days, s.open_days,
  ]);
  const dRows = daily.filter((d) => !code || d.worker_code === code);
  const dHead = [t("rlt.code"), t("cells.date"), t("rlt.firstIn"), t("rlt.lastOut"), t("cells.worked"), t("cells.breaks"), t("fmt.mode.teletrabajo"), t("rlt.obs")];
  const dBody: Cell[][] = dRows.map((d) => [
    d.worker_code, DateTime.fromISO(d.day).toFormat("dd/MM/yyyy"), fmtTime(d.first_in_ts), fmtTime(d.last_out_ts),
    secondsToClock(d.work_seconds), secondsToClock(d.break_seconds), secondsToClock(d.remote_work_seconds),
    [d.has_corrections && t("rlt.correctedFlag"), d.is_open && t("rlt.openFlag")].filter(Boolean).join(", "),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("rlt.title")}
        subtitle={t("rlt.subtitle")}
        actions={
          <Button disabled={!summary.length} onClick={() => downloadXlsx(`jornify_${t("rlt.file")}_${ym}`, [
            { name: t("rlt.sheetSummary"), title: `${t("rlt.tabSummary")} · ${monthRange(ym).label}`, head: sHead, rows: sBody },
            { name: t("rlt.sheetDaily"), head: dHead, rows: dBody },
          ])}><FileSpreadsheet className="w-4 h-4" />Excel</Button>
        }
      />
      <Notice tone="info">
        {t("rlt.noticeA")} <b className="font-mono">{workerCode}</b>. {t("rlt.noticeB")}
      </Notice>

      <div className="grid md:grid-cols-3 gap-4">
        <Select label={t("rlt.month")} value={ym} onChange={(e) => setYm(e.target.value)} options={monthOptions(48)} />
        {tab === "daily" && <Select label={t("rlt.code")} value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("settingsWeb.all")} options={summary.map((s) => ({ value: s.worker_code, label: s.worker_code }))} />}
      </div>

      <Tabs<"summary" | "daily"> value={tab} onChange={setTab} tabs={[{ value: "summary", label: t("rlt.tabSummary") }, { value: "daily", label: t("rlt.tabDaily") }]} />
      {error && <Notice tone="error">{error}</Notice>}

      {loading ? <Loading /> : (
        <Card>
          {tab === "summary" ? (summary.length === 0 ? <Empty>{t("rlt.noData")}</Empty> : (
            <Table head={sHead}>{sBody.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-2 whitespace-nowrap">{c}</td>)}</tr>)}</Table>
          )) : (dBody.length === 0 ? <Empty>{t("rlt.noData")}</Empty> : (
            <Table head={dHead}>{dBody.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-2 whitespace-nowrap">{c}</td>)}</tr>)}</Table>
          ))}
          <p className="text-[11px] text-slate-400 mt-3">{t("rlt.total", { v: secondsToHM(summary.reduce((a, s) => a + s.worked_seconds, 0)) })}</p>
        </Card>
      )}
    </div>
  );
}
