// src/pages/InspectionPublic.tsx — vista pública para la Inspección de Trabajo (acceso por enlace temporal)
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { DateTime } from "luxon";
import { AlertCircle, FileSpreadsheet, FileText, ShieldCheck, Printer } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { buildMonth, type DailyRow, type Punch } from "@/lib/data";
import { dayHead, dayCells } from "@/lib/dayCells";
import { downloadPdf, downloadXlsx, type Cell } from "@/lib/exporters";
import LanguageMenu from "@/components/LanguageMenu";
import { t } from "@/i18n";
import { ACTION_LABEL, ADJ_STATUS, MODE_LABEL, TYPE_LABEL, contractLabel, fmtDate, fmtDateTime, minutesToHours, scheduleText, secondsToClock, type RecordType, type Schedule } from "@/lib/format";

/** Columnas de día sin la de «Previsto» (la Inspección ve lo trabajado, no lo previsto) */
const dayHeadNoExpected = () => dayHead().filter((_, i) => i !== 7);
const noExpected = <T,>(r: T[]) => r.filter((_, i) => i !== 7);

type TermsJ = {
  valid_from: string; valid_to: string | null; jornada_type: string; weekly_minutes: number; part_time_pct: number | null;
  schedule: Schedule; flexible: boolean; remote_allowed: boolean; contract_type: string | null;
};
type Data = {
  error?: string;
  generated_at: string;
  period: { from: string; to: string };
  link: { created_at: string; expires_at: string; label: string | null };
  company: { name: string; legal_name: string | null; cif: string | null; address: string | null; city: string | null; province: string | null; postal_code: string | null; collective_agreement: string | null };
  centers: { id: string; name: string; address: string | null }[];
  workers: { user_id: string; code: string; first_name: string | null; last_name: string | null; dni: string | null; email: string | null; terms: TermsJ[] }[];
  records: { id: string; user_id: string; type: RecordType; event_ts: string; registered_at: string; work_mode: string; center_id: string | null; inside_radius: boolean | null; is_correction: boolean; hash: string }[];
  daily: { user_id: string; day: string; work_seconds: number; break_seconds: number; remote_work_seconds: number; has_corrections: boolean; is_open: boolean }[];
  annulled: { record_id: string; user_id: string; type: RecordType; event_ts: string; registered_at: string; annulled_at: string; reason: string }[];
  corrections: { id: string; user_id: string; action: string; status: string; type: RecordType | null; effective_ts: string | null; reason: string | null; requested_by: string; created_at: string; reviewed_at: string | null; worker_response: string | null; worker_comment: string | null; admin_comment: string | null; discrepancy: boolean }[];
};

const errorText = (code: string | undefined) =>
  code === "expired" ? t("pub.expired") : code === "revoked" ? t("pub.revoked") : t("pub.invalid");

const termsText = (w: TermsJ) =>
  [
    w.jornada_type === "parcial" ? t("emp.partPct", { pct: w.part_time_pct ?? "" }) : t("emp.full"),
    t("pub.perWeek", { h: minutesToHours(w.weekly_minutes) }),
    scheduleText(w.schedule) + (w.flexible ? ` (${t("emp.flexibleShort")})` : ""),
    w.remote_allowed ? t("pub.remoteAllowed") : null,
    w.contract_type ? contractLabel(w.contract_type) : null,
  ].filter(Boolean).join(" · ") +
  ` (${w.valid_to ? t("pub.fromTo", { from: fmtDate(w.valid_from), to: fmtDate(w.valid_to) }) : t("pub.since", { from: fmtDate(w.valid_from) })})`;

export default function InspectionPublic() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [worker, setWorker] = useState<string>("");

  useEffect(() => {
    document.title = `Jornify · ${t("pub.docTitle")}`;
    if (!token) { setError(errorText("invalid")); setLoading(false); return; }
    supabase.rpc("inspection_get_data", { p_token: token }).then(({ data: d, error: e }) => {
      if (e) setError(t("pub.loadError"));
      else if ((d as Data)?.error) setError(errorText((d as Data).error));
      else setData(d as Data);
      setLoading(false);
    });
  }, [token]);

  const centerName = useMemo(() => {
    const m = new Map((data?.centers ?? []).map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : t("pub.mainCenter"));
  }, [data]);

  const perWorker = useMemo(() => {
    if (!data) return [];
    return data.workers.map((w) => {
      const punches: Punch[] = data.records.filter((r) => r.user_id === w.user_id).map((r) => ({
        id: r.id, user_id: r.user_id, company_id: "", type: r.type, event_ts: r.event_ts, ts: r.registered_at,
        work_mode: (r.work_mode as Punch["work_mode"]) ?? "presencial", center_id: r.center_id, inside_radius: r.inside_radius,
        distance_m: null, is_correction: r.is_correction,
      }));
      const daily: DailyRow[] = data.daily.filter((d) => d.user_id === w.user_id);
      const days = buildMonth(data.period.from, data.period.to, punches, daily, null);
      const total = daily.reduce((a, d) => a + d.work_seconds, 0);
      const remote = daily.reduce((a, d) => a + d.remote_work_seconds, 0);
      return { w, days, total, remote, name: [w.first_name, w.last_name].filter(Boolean).join(" ") || w.code };
    });
  }, [data]);

  if (loading) return <Shell><p className="text-sm text-slate-500">{t("pub.loading")}</p></Shell>;
  if (error || !data) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      </Shell>
    );
  }

  const c = data.company;
  const companyLine = [c.legal_name || c.name, c.cif && `${t("pub.cif")} ${c.cif}`, [c.address, c.postal_code, c.city, c.province].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const shown = worker ? perWorker.filter((x) => x.w.user_id === worker) : perWorker;
  const nameById = (uid: string) => perWorker.find((x) => x.w.user_id === uid)?.name ?? "—";

  const corrHead = [t("corrWeb.worker"), t("pub.action"), t("dash.colTime"), t("corrWeb.reason"), t("pub.origin"), t("absWeb.status"), t("pub.workerAnswer"), t("pub.companyComment"), t("insp.createdCol"), t("pub.resolvedCol")];
  const corrRows: Cell[][] = data.corrections.map((x) => [
    nameById(x.user_id), ACTION_LABEL[x.action] ?? x.action, x.effective_ts ? fmtDateTime(x.effective_ts) : "", x.reason ?? "",
    x.requested_by === "empresa" ? t("inc.company") : t("corrWeb.worker"), (ADJ_STATUS[x.status]?.label ?? x.status) + (x.discrepancy ? ` (${t("pub.withDiscrepancy")})` : ""),
    [x.worker_response === "accepted" ? t("pub.agree") : x.worker_response === "disputed" ? t("pub.disagree") : "", x.worker_comment].filter(Boolean).join(": "),
    x.admin_comment ?? "", fmtDateTime(x.created_at), x.reviewed_at ? fmtDateTime(x.reviewed_at) : "",
  ]);
  const annHead = [t("corrWeb.worker"), t("pub.annulledPunch"), t("pub.originalTime"), t("pub.registered"), t("pub.annulledOn"), t("corrWeb.reason")];
  const annRows: Cell[][] = data.annulled.map((a) => [nameById(a.user_id), TYPE_LABEL[a.type], fmtDateTime(a.event_ts), fmtDateTime(a.registered_at), fmtDateTime(a.annulled_at), a.reason]);

  const exportXlsx = () =>
    downloadXlsx(`${t("pub.file")}_${c.cif ?? "empresa"}_${data.period.from}_${data.period.to}`, [
      ...shown.map((p) => ({
        name: p.name.slice(0, 28),
        title: `${t("pub.record")} · ${p.name}`,
        info: [
          [t("inc.company"), companyLine], [t("corrWeb.worker"), p.name], [t("emp.idNumber"), p.w.dni ?? "—"],
          [t("pub.terms"), p.w.terms.map(termsText).join(" | ") || t("rlt.noData")],
          [t("insp.period"), `${fmtDate(data.period.from)} – ${fmtDate(data.period.to)}`],
        ] as [string, Cell][],
        head: dayHeadNoExpected(),
        rows: p.days.map((d) => noExpected(dayCells(d, centerName, false))),
        footer: [[t("pub.totalWorked"), secondsToClock(p.total)], [t("pub.ofWhichRemote"), secondsToClock(p.remote)]] as [string, Cell][],
        widths: [11, 11, 30, 22, 14, 18, 10, 40],
      })),
      { name: t("pub.sheetCorr"), head: corrHead, rows: corrRows },
      { name: t("pub.sheetAnn"), head: annHead, rows: annRows },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `${t("pub.file")}_${c.cif ?? "empresa"}_${data.period.from}_${data.period.to}`,
      title: t("pub.pdfTitle"),
      subtitle: `${companyLine} · ${t("insp.period")} ${fmtDate(data.period.from)} – ${fmtDate(data.period.to)}`,
      landscape: true,
      tables: [
        ...shown.map((p) => ({
          title: `${p.name}${p.w.dni ? ` · ${p.w.dni}` : ""} · ${p.w.terms.map(termsText).join(" | ") || t("pub.noTerms")} · ${t("pub.total", { v: secondsToClock(p.total) })}`,
          head: dayHeadNoExpected(),
          body: p.days.filter((d) => d.punches.length || d.holiday || d.absence).map((d) => noExpected(dayCells(d, centerName, false))),
        })),
        ...(corrRows.length ? [{ title: t("pub.sheetCorr"), head: corrHead, body: corrRows }] : []),
        ...(annRows.length ? [{ title: t("pub.annKept"), head: annHead, body: annRows }] : []),
      ],
      notes: [
        t("pub.noteTz"),
        data.link.label ? t("pub.noteGenRef", { when: fmtDateTime(data.generated_at), ref: data.link.label }) : t("pub.noteGen", { when: fmtDateTime(data.generated_at) }),
      ],
    });

  return (
    <Shell>
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
          <p className="text-base font-semibold text-slate-900">{c.legal_name || c.name}</p>
          <p className="text-xs text-slate-600">{companyLine}</p>
          {c.collective_agreement && <p className="text-xs text-slate-600">{t("pub.agreement")}: {c.collective_agreement}</p>}
          <p className="text-xs text-slate-600">
            {t("pub.authPeriod")}: <b>{fmtDate(data.period.from)} – {fmtDate(data.period.to)}</b> · {t("pub.validUntil", { when: fmtDateTime(data.link.expires_at) })}
            {data.link.label && <> · {t("pub.ref")}: {data.link.label}</>}
          </p>
          <p className="text-[11px] text-slate-500">{t("pub.logged")}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 print:hidden">
          <label className="text-xs text-slate-600">
            {t("corrWeb.worker")}
            <select value={worker} onChange={(e) => setWorker(e.target.value)} className="mt-1 block w-full sm:w-72 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">{t("pub.allStaff", { n: perWorker.length })}</option>
              {perWorker.map((p) => <option key={p.w.user_id} value={p.w.user_id}>{p.name}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <PubBtn onClick={exportXlsx}><FileSpreadsheet className="w-4 h-4" />Excel</PubBtn>
            <PubBtn onClick={exportPdf}><FileText className="w-4 h-4" />PDF</PubBtn>
            <PubBtn onClick={() => window.print()}><Printer className="w-4 h-4" />{t("pub.print")}</PubBtn>
          </div>
        </div>

        {shown.map((p) => (
          <section key={p.w.user_id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden break-inside-avoid">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
              <p className="text-sm font-semibold text-slate-900">{p.name} <span className="font-normal text-slate-500">· {p.w.dni ?? t("pub.noDni")}</span></p>
              <p className="text-[11px] text-slate-600">{p.w.terms.length ? p.w.terms.map(termsText).join(" | ") : t("pub.noTermsLong")}</p>
              <p className="text-[11px] text-slate-600">{t("pub.totalWorked")}: <b>{secondsToClock(p.total)}</b>{p.remote ? ` · ${t("pub.ofWhichRemoteV", { v: secondsToClock(p.remote) })}` : ""}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>{dayHeadNoExpected().map((h) => <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {p.days.filter((d) => d.punches.length).map((d) => {
                    const r = dayCells(d, centerName, false);
                    return <tr key={d.day}>{noExpected(r).map((v, i) => <td key={i} className="px-3 py-1.5 whitespace-nowrap">{v}</td>)}</tr>;
                  })}
                  {!p.days.some((d) => d.punches.length) && <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-400">{t("pub.noPunches")}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <PubTable title={t("pub.corrTitle")} head={corrHead} rows={worker ? corrRows.filter((_, i) => data.corrections[i].user_id === worker) : corrRows}
          empty={t("pub.noCorr")} />
        <PubTable title={t("pub.annTitle")} head={annHead} rows={worker ? annRows.filter((_, i) => data.annulled[i].user_id === worker) : annRows}
          empty={t("pub.noAnn")} />

        <p className="text-[11px] text-slate-500">
          {t("pub.footer", { when: fmtDateTime(data.generated_at) })} {t("cells.mode")}: {[MODE_LABEL.presencial, MODE_LABEL.teletrabajo].join(" / ")}.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 px-4 py-8 print:bg-white print:p-0">
      <div className="w-full max-w-6xl mx-auto space-y-6">
        <header className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-cyan-500/15 flex items-center justify-center shrink-0"><ShieldCheck className="w-5 h-5 text-cyan-700" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight">{t("pub.header")}</h1>
            <p className="text-xs text-slate-500">{t("pub.headerSub", { date: DateTime.now().toLocaleString(DateTime.DATE_FULL) })}</p>
          </div>
          <div className="print:hidden shrink-0"><LanguageMenu compact /></div>
        </header>
        {children}
      </div>
    </div>
  );
}

function PubBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
      {children}
    </button>
  );
}

function PubTable({ title, head, rows, empty }: { title: string; head: string[]; rows: Cell[][]; empty: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <p className="px-5 py-3 border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900">{title}</p>
      {rows.length === 0 ? <p className="px-5 py-4 text-xs text-slate-400">{empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-700"><tr>{head.map((h) => <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="px-3 py-1.5">{v}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
