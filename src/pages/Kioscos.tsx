// src/pages/Kioscos.tsx — la empresa gestiona sus kioscos (tablets) y las credenciales con QR
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { DateTime } from "luxon";
import { Tablet, Plus, Copy, Check, Printer, KeyRound, Ban, Pencil, IdCard } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader, Card, Button, Notice, Empty, Loading, Input, Select, Toggle, Table, Modal, Pill } from "@/components/ui/kit";
import QrCode from "@/components/QrCode";
import { fetchCenters, type Center } from "@/lib/data";
import { downloadBadgesPdf } from "@/lib/badges";
import { PUBLIC_APP_URL } from "@/lib/config";
import { TZ, errMsg, fmtDate } from "@/lib/format";
import { t } from "@/i18n";

type Device = { id: string; name: string; center_id: string | null; allow_pin: boolean; allow_qr: boolean; created_at: string; last_seen_at: string | null; revoked_at: string | null; locked_until: string | null };
type KPerson = { user_id: string; display_name: string | null; worker_code: string | null; has_pin: boolean; pin_locked: boolean; has_badge: boolean; badge_issued_at: string | null };

const kioskUrl = (token: string) => `${PUBLIC_APP_URL}/kiosco#t=${token}`;
const seen = (iso: string | null) => {
  if (!iso) return t("kiosks.never");
  const mins = DateTime.now().diff(DateTime.fromISO(iso), "minutes").minutes;
  if (mins < 10) return t("kiosks.online");
  return DateTime.fromISO(iso, { zone: TZ }).toRelative() ?? "—";
};

export default function Kioscos() {
  const { isAdmin, companyId, companyName, loading: pl } = useProfile();
  const [devices, setDevices] = useState<Device[]>([]);
  const [people, setPeople] = useState<KPerson[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", center: "", allow_pin: true, allow_qr: true });
  const [editing, setEditing] = useState<Device | null>(null);
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    const [d, p, c] = await Promise.all([
      supabase.from("kiosk_devices").select("id, name, center_id, allow_pin, allow_qr, created_at, last_seen_at, revoked_at, locked_until").eq("company_id", companyId).order("created_at"),
      supabase.rpc("admin_kiosk_people"),
      fetchCenters(companyId, true),
    ]);
    if (d.error) setMsg({ tone: "error", text: errMsg(d.error) });
    setDevices((d.data ?? []) as Device[]);
    setPeople((p.data ?? []) as KPerson[]);
    setCenters(c);
    setLoading(false);
  }, [companyId]);
  useEffect(() => { if (!pl && isAdmin) load(); }, [pl, isAdmin, load]);

  if (!pl && !isAdmin) return <Navigate to="/" replace />;
  if (pl || loading) return <Loading />;

  const centerName = (id: string | null) => (id ? centers.find((c) => c.id === id)?.name ?? "—" : t("kiosks.anyCenter"));
  const active = devices.filter((d) => !d.revoked_at);

  async function create() {
    setMsg(null);
    if (!form.name.trim()) { setMsg({ tone: "error", text: t("kiosks.needName") }); return; }
    const { data, error } = await supabase.rpc("admin_create_kiosk", { p_name: form.name.trim(), p_center_id: form.center || null });
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    const r = data as { id: string; token: string };
    if (!form.allow_pin || !form.allow_qr) {
      await supabase.rpc("admin_update_kiosk", { p_id: r.id, p_name: form.name.trim(), p_center_id: form.center || null, p_allow_pin: form.allow_pin, p_allow_qr: form.allow_qr });
    }
    setCreating(false);
    setCopied(false);
    setCreated({ name: form.name.trim(), token: r.token });
    setForm({ name: "", center: "", allow_pin: true, allow_qr: true });
    load();
  }

  async function saveEdit() {
    if (!editing) return;
    const { error } = await supabase.rpc("admin_update_kiosk", { p_id: editing.id, p_name: editing.name, p_center_id: editing.center_id, p_allow_pin: editing.allow_pin, p_allow_qr: editing.allow_qr });
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setEditing(null);
    load();
  }

  async function revoke(d: Device) {
    if (!confirm(t("kiosks.revokeConfirm", { name: d.name }))) return;
    const { error } = await supabase.rpc("admin_revoke_kiosk", { p_id: d.id });
    if (error) setMsg({ tone: "error", text: errMsg(error) }); else load();
  }

  async function printBadges(ids: string[]) {
    const list = people.filter((p) => ids.includes(p.user_id));
    if (!list.length) return;
    if (list.some((p) => p.has_badge) && !confirm(t("kiosks.reprintConfirm"))) return;
    setBusy(true);
    setMsg(null);
    try {
      const badges = [];
      for (const p of list) {
        const { data, error } = await supabase.rpc("admin_issue_badge", { p_user_id: p.user_id });
        if (error) throw error;
        badges.push({ name: p.display_name ?? "—", code: data as string, workerCode: p.worker_code });
      }
      await downloadBadgesPdf(companyName ?? "", badges);
      setMsg({ tone: "ok", text: t("kiosks.badgesDone", { count: badges.length }) });
      setSel([]);
      load();
    } catch (e) {
      setMsg({ tone: "error", text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function personAction(p: KPerson, action: "reset_pin" | "revoke_badge") {
    const q = action === "reset_pin" ? t("kiosks.resetPinConfirm", { name: p.display_name ?? "" }) : t("kiosks.revokeBadgeConfirm", { name: p.display_name ?? "" });
    if (!confirm(q)) return;
    const { error } = await supabase.rpc(action === "reset_pin" ? "admin_reset_pin" : "admin_revoke_badge", { p_user_id: p.user_id });
    if (error) setMsg({ tone: "error", text: errMsg(error) }); else load();
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.kiosks")} subtitle={t("kiosks.subtitle")}
        actions={<Button variant="primary" onClick={() => { setMsg(null); setCreating(true); }}><Plus className="w-4 h-4" />{t("kiosks.new")}</Button>} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <Card title={t("kiosks.title")} icon={<Tablet className="w-4 h-4" />}>
        {devices.length === 0 ? <Empty>{t("kiosks.none")}</Empty> : (
          <Table head={[t("settingsWeb.holName"), t("cells.center"), t("kiosks.ident"), t("kiosks.lastSeen"), t("absWeb.status"), ""]}>
            {devices.map((d) => (
              <tr key={d.id} className={d.revoked_at ? "opacity-50" : undefined}>
                <td className="px-3 py-2 font-medium whitespace-nowrap">{d.name}</td>
                <td className="px-3 py-2 whitespace-nowrap">{centerName(d.center_id)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{[d.allow_pin && "PIN", d.allow_qr && "QR"].filter(Boolean).join(" + ")}</td>
                <td className="px-3 py-2 whitespace-nowrap">{seen(d.last_seen_at)}</td>
                <td className="px-3 py-2">
                  {d.revoked_at ? <Pill>{t("kiosks.disabled")}</Pill>
                    : d.locked_until && d.locked_until > new Date().toISOString() ? <Pill className="border bg-amber-500/10 text-amber-600 border-amber-500/20">{t("kiosks.lockedFew")}</Pill>
                    : <Pill className="border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">{t("insp.active")}</Pill>}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {!d.revoked_at && <>
                    <Button size="sm" variant="subtle" onClick={() => setEditing({ ...d })} title={t("common.edit")} aria-label={t("common.edit")}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="subtle" onClick={() => revoke(d)} title={t("kiosks.deactivate")} aria-label={t("kiosks.deactivate")}><Ban className="w-3.5 h-3.5" /></Button>
                  </>}
                </td>
              </tr>
            ))}
          </Table>
        )}
        <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p><b>{t("kiosks.howTitle")}</b> {t("kiosks.how")}</p>
          <p>{t("kiosks.howFoot")}</p>
        </div>
      </Card>

      <Card title={t("kiosks.peopleTitle")} icon={<IdCard className="w-4 h-4" />}
        actions={<Button disabled={!sel.length || busy} onClick={() => printBadges(sel)}><Printer className="w-4 h-4" />{t("kiosks.printBadges")}{sel.length ? ` (${sel.length})` : ""}</Button>}>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t("kiosks.peopleHint")}</p>
        {people.length === 0 ? <Empty>{t("kiosks.noPeople")}</Empty> : (
          <Table head={[
            <input key="all" type="checkbox" aria-label={t("kiosks.selectAll")} checked={sel.length === people.length} onChange={(e) => setSel(e.target.checked ? people.map((p) => p.user_id) : [])} />,
            t("absWeb.person"), t("rlt.code"), "PIN", t("kiosks.badge"), "",
          ]}>
            {people.map((p) => (
              <tr key={p.user_id}>
                <td className="px-3 py-2"><input type="checkbox" aria-label={t("kiosks.select", { name: p.display_name ?? "" })} checked={sel.includes(p.user_id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.user_id] : sel.filter((x) => x !== p.user_id))} /></td>
                <td className="px-3 py-2 whitespace-nowrap">{p.display_name}</td>
                <td className="px-3 py-2 font-mono">{p.worker_code}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.pin_locked ? <span className="text-amber-600">{t("kiosks.locked")}</span> : p.has_pin ? t("common.yes") : <span className="text-slate-400">{t("kiosks.noPin")}</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.has_badge ? `${t("common.yes")} (${fmtDate(p.badge_issued_at)})` : <span className="text-slate-400">{t("common.no")}</span>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button size="sm" variant="subtle" disabled={busy} onClick={() => printBadges([p.user_id])} title={t("kiosks.printBadge")} aria-label={t("kiosks.printBadge")}><Printer className="w-3.5 h-3.5" /></Button>
                  {p.has_pin && <Button size="sm" variant="subtle" onClick={() => personAction(p, "reset_pin")} title={t("kiosks.resetPin")} aria-label={t("kiosks.resetPin")}><KeyRound className="w-3.5 h-3.5" /></Button>}
                  {p.has_badge && <Button size="sm" variant="subtle" onClick={() => personAction(p, "revoke_badge")} title={t("kiosks.revokeBadge")} aria-label={t("kiosks.revokeBadge")}><Ban className="w-3.5 h-3.5" /></Button>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title={t("kiosks.new")}
        footer={<><Button onClick={() => setCreating(false)}>{t("common.cancel")}</Button><Button variant="primary" onClick={create}>{t("kiosks.create")}</Button></>}>
        <div className="space-y-4">
          <Input label={t("settingsWeb.holName")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("kiosks.namePh")} />
          <Select label={t("centers.defaultName")} value={form.center} onChange={(e) => setForm({ ...form, center: e.target.value })} placeholder={t("kiosks.noFixedCenter")}
            options={centers.map((c) => ({ value: c.id, label: c.name }))} />
          <p className="text-[11px] text-slate-400 -mt-2">{t("kiosks.centerHint")}</p>
          <Toggle checked={form.allow_pin} onChange={(v) => setForm({ ...form, allow_pin: v })} label={t("kiosks.withPin")} description={t("kiosks.withPinDesc")} />
          <Toggle checked={form.allow_qr} onChange={(v) => setForm({ ...form, allow_qr: v })} label={t("kiosks.withQr")} description={t("kiosks.withQrDesc")} />
        </div>
      </Modal>

      <Modal open={!!created} onClose={() => setCreated(null)} title={t("kiosks.activateTitle", { name: created?.name ?? "" })}
        footer={<Button variant="primary" onClick={() => setCreated(null)}>{t("kiosks.done")}</Button>}>
        {created && (
          <div className="space-y-4">
            <Notice tone="warn">{t("kiosks.linkOnce")}</Notice>
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <QrCode text={kioskUrl(created.token)} size={180} />
              <div className="space-y-2 min-w-0 flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("kiosks.scanOrCopy")}</p>
                <code className="block text-[11px] break-all rounded-lg bg-slate-100 dark:bg-white/5 p-2">{kioskUrl(created.token)}</code>
                <Button size="sm" onClick={async () => { await navigator.clipboard.writeText(kioskUrl(created.token)); setCopied(true); }}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? t("insp.copied") : t("kiosks.copyLink")}
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("kiosks.lostLink")}</p>
          </div>
        )}
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={t("kiosks.edit")}
        footer={<><Button onClick={() => setEditing(null)}>{t("common.cancel")}</Button><Button variant="primary" onClick={saveEdit}>{t("common.save")}</Button></>}>
        {editing && (
          <div className="space-y-4">
            <Input label={t("settingsWeb.holName")} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <Select label={t("centers.defaultName")} value={editing.center_id ?? ""} onChange={(e) => setEditing({ ...editing, center_id: e.target.value || null })} placeholder={t("kiosks.noFixedCenter")}
              options={centers.map((c) => ({ value: c.id, label: c.name }))} />
            <Toggle checked={editing.allow_pin} onChange={(v) => setEditing({ ...editing, allow_pin: v })} label={t("kiosks.withPin")} />
            <Toggle checked={editing.allow_qr} onChange={(v) => setEditing({ ...editing, allow_qr: v })} label={t("kiosks.withQr")} />
          </div>
        )}
      </Modal>
      {active.length === 0 && devices.length > 0 && <p className="text-xs text-slate-400">{t("kiosks.allDisabled")}</p>}
    </div>
  );
}
