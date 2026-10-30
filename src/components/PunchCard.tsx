// src/components/PunchCard.tsx — fichar desde el panel web
import { useState } from "react";
import { DateTime } from "luxon";
import { LogIn, LogOut, Coffee, Play, MapPin, Home, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { Button, Card, Notice, Select } from "@/components/ui/kit";
import { TZ, fmtTime, type RecordType } from "@/lib/format";
import { t as tr, useT } from "@/i18n";
import { tError } from "@/i18n/errors";

export type PunchStatus = { last_type: RecordType; last_ts: string; work_mode: string; center_id: string | null } | null;

type Geo = { lat: number; lon: number; acc: number };

function getPosition(): Promise<Geo> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) { reject(new Error("unsupported")); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

const friendly = (e: { message: string }) => {
  const m = e.message;
  if (/Invalid transition/i.test(m)) return tr("punchWeb.transition");
  if (/Invalid ts/i.test(m)) return tr("punchWeb.tooSoon");
  if (/row-level security/i.test(m)) return tr("punchWeb.notActive");
  return tError(e);
};

export default function PunchCard({ status, onDone }: { status: PunchStatus; onDone: () => void }) {
  const { t } = useT();
  const { userId, companyId, remoteAllowed, myCenters, settings } = useProfile();
  const [mode, setMode] = useState<"presencial" | "teletrabajo">("presencial");
  const [centerId, setCenterId] = useState("");
  const [busy, setBusy] = useState<RecordType | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [noGeo, setNoGeo] = useState<RecordType | null>(null);

  const last = status?.last_type ?? "OUT";
  const working = last === "IN" || last === "BREAK_IN";
  const onBreak = last === "BREAK_OUT";
  const stale = (working || onBreak) && status
    ? DateTime.now().diff(DateTime.fromISO(status.last_ts), "hours").hours >= settings.maxShiftHours
    : false;

  const actions: { type: RecordType; label: string; icon: React.ReactNode; variant: "success" | "primary" | "danger" | "ghost" }[] =
    !working && !onBreak ? [{ type: "IN", label: t("punchWeb.in"), icon: <LogIn className="w-5 h-5" />, variant: "success" }]
    : onBreak ? [{ type: "BREAK_IN", label: t("punchWeb.breakIn"), icon: <Play className="w-5 h-5" />, variant: "success" }]
    : [
        { type: "BREAK_OUT", label: t("punchWeb.breakOut"), icon: <Coffee className="w-5 h-5" />, variant: "ghost" },
        { type: "OUT", label: t("punchWeb.out"), icon: <LogOut className="w-5 h-5" />, variant: "danger" },
      ];
  if (stale) actions.push({ type: "IN", label: t("punchWeb.newIn"), icon: <LogIn className="w-5 h-5" />, variant: "primary" });

  const sessionMode = status && (working || onBreak) ? status.work_mode : null;

  async function punch(type: RecordType, withoutGeo = false) {
    if (!userId || !companyId) return;
    setMsg(null);
    setNoGeo(null);
    setBusy(type);
    const effMode = type === "IN" ? mode : (sessionMode ?? "presencial");
    let geo: Geo | null = null;
    if (effMode === "presencial" && !withoutGeo) {
      try {
        geo = await getPosition();
      } catch (e) {
        setBusy(null);
        const denied = (e as GeolocationPositionError)?.code === 1;
        if (settings.geofenceMode === "block") {
          setMsg({ tone: "error", text: denied ? t("punchWeb.geoBlockDenied") : t("punchWeb.geoBlockFail") });
        } else {
          setMsg({ tone: "warn", text: denied ? t("punchWeb.geoFlagDenied") : t("punchWeb.geoFlagFail") });
          setNoGeo(type);
        }
        return;
      }
    }
    const row: Record<string, unknown> = {
      user_id: userId,
      company_id: companyId,
      type,
      meta: { source: "web", ua: navigator.userAgent.slice(0, 160) },
    };
    if (type === "IN") {
      row.work_mode = mode;
      if (mode === "presencial" && centerId) row.center_id = centerId;
    }
    if (geo) { row.latitude = geo.lat; row.longitude = geo.lon; row.accuracy_m = Math.round(geo.acc); }

    const { data, error } = await supabase.from("time_records").insert(row).select("ts, inside_radius, distance_m").single();
    setBusy(null);
    if (error) { setMsg({ tone: "error", text: friendly(error) }); return; }
    const r = data as { ts: string; inside_radius: boolean | null; distance_m: number | null };
    let text = t(`punchWeb.done.${type}`, { time: fmtTime(r.ts) });
    let tone: "ok" | "warn" = "ok";
    if (r.inside_radius === false) {
      tone = "warn";
      text += " " + t("punchWeb.outside", { dist: Math.round(r.distance_m ?? 0) });
      if (geo && geo.acc > 100) text += " " + t("punchWeb.approx", { acc: Math.round(geo.acc) });
    } else if (effMode === "presencial" && !geo) {
      text += " " + t("punchWeb.noLocation");
    }
    setMsg({ tone, text });
    onDone();
  }

  if (!settings.webPunchEnabled) {
    return (
      <Notice tone="info">{t("errors.db.webPunchDisabled")}</Notice>
    );
  }

  return (
    <Card title={t("punchWeb.title")} icon={<MapPin className="w-4 h-4" />}>
      <div className="space-y-4">
        {!working && !onBreak && (
          <div className="grid sm:grid-cols-2 gap-3">
            {remoteAllowed && (
              <Select label={t("cells.mode")} value={mode} onChange={(e) => setMode(e.target.value as "presencial" | "teletrabajo")}
                options={[{ value: "presencial", label: t("punchWeb.onSite") }, { value: "teletrabajo", label: t("fmt.mode.teletrabajo") }]} />
            )}
            {mode === "presencial" && myCenters.length > 1 && (
              <Select label={t("cells.center")} value={centerId} onChange={(e) => setCenterId(e.target.value)} placeholder={t("punchWeb.nearest")}
                options={myCenters.map((c) => ({ value: c.id, label: c.name }))} />
            )}
          </div>
        )}
        {(working || onBreak) && sessionMode && (
          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            {sessionMode === "teletrabajo" ? <Home className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
            {t(onBreak ? (sessionMode === "teletrabajo" ? "punchWeb.sinceBreakRemote" : "punchWeb.sinceBreakSite") : (sessionMode === "teletrabajo" ? "punchWeb.sinceWorkRemote" : "punchWeb.sinceWorkSite"), { time: fmtTime(status!.last_ts) })}
            {DateTime.fromISO(status!.last_ts, { zone: TZ }).toISODate() !== DateTime.now().setZone(TZ).toISODate() && ` (${DateTime.fromISO(status!.last_ts, { zone: TZ }).toFormat("dd/MM")})`}
          </p>
        )}
        {stale && (
          <Notice tone="warn">
            {t("punchWeb.stale", { h: settings.maxShiftHours })}
          </Notice>
        )}
        <div className="flex flex-wrap gap-3">
          {actions.map((a) => (
            <Button key={a.type + a.label} variant={a.variant} disabled={!!busy} onClick={() => punch(a.type)} className="!px-5 !py-3 !text-base">
              {busy === a.type ? <Loader2 className="w-5 h-5 animate-spin" /> : a.icon}{a.label}
            </Button>
          ))}
        </div>
        {msg && <Notice tone={msg.tone === "warn" ? "warn" : msg.tone}>{msg.text}</Notice>}
        {noGeo && (
          <Button variant="ghost" onClick={() => punch(noGeo, true)}>{t("punchWeb.withoutGeo")}</Button>
        )}
        <p className="text-[11px] text-slate-400">
          {remoteAllowed ? t("punchWeb.footRemote") : t("punchWeb.foot")}
        </p>
      </div>
    </Card>
  );
}
