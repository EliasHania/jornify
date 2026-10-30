// src/pages/MiKiosco.tsx — la persona trabajadora pone su PIN del kiosco y muestra su QR dinámico
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, QrCode as QrIcon, RefreshCw, IdCard } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader, Card, Button, Notice, Input, Loading, Empty } from "@/components/ui/kit";
import QrCode from "@/components/QrCode";
import { errMsg } from "@/lib/format";
import { t } from "@/i18n";

export default function MiKiosco() {
  const { kiosk, reload, loading, companyId, employeeStatus, isAdmin } = useProfile();
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState<{ code: string; expires_at: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [qrErr, setQrErr] = useState<string | null>(null);
  const started = useRef(0);

  const fetchQr = useCallback(async () => {
    setQrErr(null);
    const { data, error } = await supabase.rpc("get_my_kiosk_qr");
    if (error) { setQrErr(errMsg(error)); setQr(null); return; }
    setQr(data as { code: string; expires_at: string });
  }, []);

  // Cuenta atrás y renovación automática (hasta 5 minutos seguidos)
  useEffect(() => {
    if (!qr) return;
    const timer = setInterval(() => {
      const s = Math.max(0, Math.round((new Date(qr.expires_at).getTime() - Date.now()) / 1000));
      setLeft(s);
      if (s <= 15) {
        if (Date.now() - started.current < 5 * 60_000) fetchQr();
        else if (s === 0) setQr(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [qr, fetchQr]);

  if (loading) return <Loading />;
  if (isAdmin || !companyId || employeeStatus !== "active") return <Empty>{t("myKiosk.onlyActive")}</Empty>;

  async function savePin() {
    setMsg(null);
    if (!/^\d{4,6}$/.test(pin)) { setMsg({ tone: "error", text: t("errors.db.pinLength") }); return; }
    if (pin !== pin2) { setMsg({ tone: "error", text: t("myKiosk.mismatch") }); return; }
    setSaving(true);
    const { error } = await supabase.rpc("set_my_kiosk_pin", { p_pin: pin });
    setSaving(false);
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setPin(""); setPin2("");
    setMsg({ tone: "ok", text: t("myKiosk.saved") });
    reload();
  }
  async function clearPin() {
    if (!confirm(t("myKiosk.clearConfirm"))) return;
    const { error } = await supabase.rpc("clear_my_kiosk_pin");
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setMsg({ tone: "ok", text: t("myKiosk.cleared") });
    reload();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title={t("nav.myKiosk")} subtitle={t("myKiosk.subtitle")} />

      <Card title={t("myKiosk.pinTitle")} icon={<KeyRound className="w-4 h-4" />}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {kiosk.hasPin ? t("myKiosk.hasPin") : t("myKiosk.noPin")}
          </p>
          <div className="grid sm:grid-cols-2 gap-3 max-w-md">
            <Input label={t("myKiosk.newPin")} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder={t("myKiosk.digits")} />
            <Input label={t("myKiosk.repeat")} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} />
          </div>
          <p className="text-[11px] text-slate-400">{t("myKiosk.pinTips")}</p>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={saving} onClick={savePin}>{kiosk.hasPin ? t("myKiosk.change") : t("myKiosk.save")}</Button>
            {kiosk.hasPin && <Button variant="subtle" onClick={clearPin}>{t("myKiosk.clear")}</Button>}
          </div>
        </div>
      </Card>

      <Card title={t("myKiosk.qrTitle")} icon={<QrIcon className="w-4 h-4" />}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t("myKiosk.qrHint")}</p>
          {qr ? (
            <div className="flex flex-col items-center gap-3">
              <QrCode text={qr.code} size={260} />
              <p className="text-xs text-slate-500">{t("myKiosk.expires", { s: left })}</p>
              <Button size="sm" variant="subtle" onClick={() => setQr(null)}>{t("myKiosk.hide")}</Button>
            </div>
          ) : (
            <Button variant="primary" onClick={() => { started.current = Date.now(); fetchQr(); }}><RefreshCw className="w-4 h-4" />{t("myKiosk.show")}</Button>
          )}
          {qrErr && <Notice tone="error">{qrErr}</Notice>}
        </div>
      </Card>

      {kiosk.hasBadge && (
        <Notice tone="info"><span className="inline-flex items-center gap-1"><IdCard className="w-3.5 h-3.5" />{t("myKiosk.badgeA")}</span> {t("myKiosk.badgeB")}</Notice>
      )}
    </div>
  );
}
