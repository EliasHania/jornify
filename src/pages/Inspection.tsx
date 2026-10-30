// src/pages/Inspection.tsx — accesos temporales para la Inspección de Trabajo
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { DateTime } from "luxon";
import { ShieldCheck, Copy, Check, Link as LinkIcon, Ban, Eye } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader, Card, Button, Pill, Notice, Empty, Loading, Input, Select, Modal, Table } from "@/components/ui/kit";
import { inspectionUrl } from "@/lib/config";
import { TZ, errMsg, fmtDate, fmtDateTime } from "@/lib/format";
import { t } from "@/i18n";

type LinkRow = {
  id: string; label: string | null; date_from: string | null; date_to: string | null;
  created_at: string; expires_at: string; revoked_at: string | null; access_count: number; last_access_at: string | null;
};
type Access = { id: string; accessed_at: string; user_agent: string | null; ip: string | null };

export default function Inspection() {
  const { isAdmin, companyId, companyCif, companyLegalName, loading: profileLoading } = useProfile();
  const lastMonth = DateTime.now().setZone(TZ).minus({ months: 1 });
  const [from, setFrom] = useState(lastMonth.startOf("month").toISODate()!);
  const [to, setTo] = useState(DateTime.now().setZone(TZ).toISODate()!);
  const [days, setDays] = useState("7");
  const [label, setLabel] = useState("");
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ url: string; expires: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [log, setLog] = useState<{ link: LinkRow; rows: Access[] } | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("inspection_links")
      .select("id, label, date_from, date_to, created_at, expires_at, revoked_at, access_count, last_access_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) setMsg({ tone: "error", text: errMsg(error) });
    setLinks((data ?? []) as LinkRow[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { if (!profileLoading && isAdmin) load(); }, [profileLoading, isAdmin, load]);

  async function create() {
    setMsg(null);
    setCreating(true);
    const { data, error } = await supabase.rpc("admin_create_inspection_link", {
      p_date_from: from, p_date_to: to, p_valid_days: Number(days), p_label: label.trim() || null,
    });
    setCreating(false);
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { token: string; expires_at: string };
    setCreated({ url: inspectionUrl(row.token), expires: row.expires_at });
    setCopied(false);
    setLabel("");
    load();
  }

  async function revoke(id: string) {
    if (!confirm(t("insp.revokeConfirm"))) return;
    const { error } = await supabase.rpc("admin_revoke_inspection_link", { p_id: id });
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    load();
  }

  async function openLog(l: LinkRow) {
    const { data } = await supabase.from("inspection_access_log").select("id, accessed_at, user_agent, ip").eq("link_id", l.id).order("accessed_at", { ascending: false }).limit(200);
    setLog({ link: l, rows: (data ?? []) as Access[] });
  }

  if (!profileLoading && !isAdmin) return <Navigate to="/" replace />;
  if (profileLoading) return <Loading />;

  const stateOf = (l: LinkRow) =>
    l.revoked_at ? { k: "revoked", t: t("insp.revoked"), c: "bg-slate-500/10 text-slate-500 border-slate-500/20" }
      : new Date(l.expires_at) < new Date() ? { k: "expired", t: t("insp.expired"), c: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" }
      : { k: "active", t: t("insp.active"), c: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.inspection")}
        subtitle={t("insp.subtitle")}
      />

      {(!companyCif || !companyLegalName) && (
        <Notice tone="warn">{t("insp.missingLegal")}</Notice>
      )}

      <Card title={t("insp.newAccess")} icon={<ShieldCheck className="w-4 h-4" />}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input label={t("insp.recordsFrom")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label={t("absWeb.to")} type="date" value={to} max={DateTime.now().setZone(TZ).toISODate()!} onChange={(e) => setTo(e.target.value)} />
          <Select label={t("insp.expiresIn")} value={days} onChange={(e) => setDays(e.target.value)}
            options={[1, 3, 7, 15, 30].map((d) => ({ value: String(d), label: t("absWeb.days", { count: d }) }))} />
          <Input label={t("insp.reference")} hint={`(${t("common.optional")})`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("insp.referencePh")} />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("insp.whatSees")}</p>
          <Button variant="primary" disabled={creating} onClick={create} className="shrink-0">{creating ? t("insp.creating") : t("insp.create")}</Button>
        </div>
        {msg && <Notice tone={msg.tone} className="mt-3">{msg.text}</Notice>}
      </Card>

      {created && (
        <Notice tone="ok">
          <p className="font-medium mb-1">{t("insp.created")}</p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <code className="px-2 py-1 rounded bg-white/70 dark:bg-black/30 text-[11px] break-all">{created.url}</code>
            <Button size="sm" onClick={async () => { try { await navigator.clipboard.writeText(created.url); setCopied(true); } catch { /* sin portapapeles */ } }}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? t("insp.copied") : t("insp.copy")}
            </Button>
          </div>
          <p className="mt-1">{t("insp.expiresOn", { when: fmtDateTime(created.expires) })}</p>
        </Notice>
      )}

      <Card title={t("insp.list")} icon={<LinkIcon className="w-4 h-4" />}>
        {loading ? <Loading /> : links.length === 0 ? <Empty>{t("insp.none")}</Empty> : (
          <Table head={[t("insp.reference"), t("insp.period"), t("insp.createdCol"), t("insp.expiresCol"), t("absWeb.status"), t("insp.accesses"), ""]}>
            {links.map((l) => {
              const s = stateOf(l);
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2">{l.label ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.date_from)} – {fmtDate(l.date_to)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(l.expires_at)}</td>
                  <td className="px-3 py-2"><Pill className={`border ${s.c}`}>{s.t}</Pill></td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.access_count}{l.last_access_at ? ` · ${t("insp.last", { when: fmtDateTime(l.last_access_at) })}` : ""}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button size="sm" variant="subtle" onClick={() => openLog(l)}><Eye className="w-3.5 h-3.5" />{t("insp.log")}</Button>
                    {s.k === "active" && <Button size="sm" variant="danger" onClick={() => revoke(l.id)}><Ban className="w-3.5 h-3.5" />{t("insp.revoke")}</Button>}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Notice tone="info">{t("insp.footer")}</Notice>

      <Modal open={!!log} onClose={() => setLog(null)} title={t("insp.logTitle", { label: log?.link.label ?? "" })}>
        {log && (log.rows.length === 0 ? <Empty>{t("insp.notOpened")}</Empty> : (
          <Table head={[t("cells.date"), "IP", t("insp.browser")]}>
            {log.rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(r.accessed_at)}</td>
                <td className="px-3 py-2 font-mono">{r.ip ?? "—"}</td>
                <td className="px-3 py-2 text-[11px] text-slate-500">{r.user_agent ?? "—"}</td>
              </tr>
            ))}
          </Table>
        ))}
      </Modal>
    </div>
  );
}
