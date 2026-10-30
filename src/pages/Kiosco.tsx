// src/pages/Kiosco.tsx — pantalla de fichaje para una tablet (sin iniciar sesión)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import clsx from "clsx";
import { Delete, LogIn, LogOut, Coffee, Play, QrCode as QrIcon, Search, CheckCircle2, XCircle, Camera, CameraOff, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TZ } from "@/lib/format";
import LanguageMenu from "@/components/LanguageMenu";
import { t } from "@/i18n";
import { tError } from "@/i18n/errors";

const KEY = "jornify.kiosk.token";
type Hello = {
  ok: boolean; error?: string; code?: string; server_time?: string; company?: string; center?: string | null;
  device?: { name: string; allow_pin: boolean; allow_qr: boolean; locked_until: string | null };
  people?: { id: string; name: string }[];
};
type Peek = { ok: boolean; error?: string; code?: string; name?: string; status?: string; since?: string | null; allowed?: string[] };
type Cred = { userId?: string; pin?: string; qr?: string };
type Step = { s: "home" } | { s: "pin"; id: string; name: string } | { s: "actions"; peek: Peek; cred: Cred } | { s: "done"; ok: boolean; title: string; sub?: string };

const ACTION: Record<string, { icon: React.ReactNode; cls: string }> = {
  IN: { icon: <LogIn className="w-8 h-8" />, cls: "bg-emerald-600 hover:bg-emerald-500" },
  BREAK_OUT: { icon: <Coffee className="w-8 h-8" />, cls: "bg-amber-600 hover:bg-amber-500" },
  BREAK_IN: { icon: <Play className="w-8 h-8" />, cls: "bg-sky-600 hover:bg-sky-500" },
  OUT: { icon: <LogOut className="w-8 h-8" />, cls: "bg-rose-600 hover:bg-rose-500" },
};
const ACTION_KEYS = ["IN", "BREAK_OUT", "BREAK_IN", "OUT"] as const;
type ActionKey = (typeof ACTION_KEYS)[number];
const isAction = (k: string): k is ActionKey => (ACTION_KEYS as readonly string[]).includes(k);
const actionLabel = (k: string) => (isAction(k) ? t(`kiosk.action.${k}`) : k);
const doneLabel = (k: string) => (isAction(k) ? t(`kiosk.done.${k}`) : t("kiosk.doneGeneric"));
const statusLabel = (k: string) => (k === "BREAK_OUT" ? t("dash.onBreakShort") : k === "OUT" ? t("dash.offShift") : t("dash.working"));

/** Errores del kiosco: el servidor devuelve un código y un texto en español; se muestra el del idioma actual */
const KIOSK_CODES = ["device", "locked", "bad_qr", "bad_pin", "pin_locked", "bad_request", "inactive", "center", "transition"] as const;
type KioskCode = (typeof KIOSK_CODES)[number];
const kioskError = (r: { code?: string; error?: string }) => {
  if (r.code === "mode") return /QR/.test(r.error ?? "") ? t("kiosk.err.modeQr") : t("kiosk.err.modePin");
  if (r.code && (KIOSK_CODES as readonly string[]).includes(r.code)) return t(`kiosk.err.${r.code as KioskCode}`);
  return r.error ? tError({ message: r.error }) : t("kiosk.err.generic");
};

function readToken(): string | null {
  const m = window.location.hash.match(/t=(jk_[A-Za-z0-9]+)/);
  if (m) {
    try { localStorage.setItem(KEY, m[1]); } catch { /* nada */ }
    history.replaceState(null, "", window.location.pathname);
    return m[1];
  }
  try { return localStorage.getItem(KEY); } catch { return null; }
}

// ---------------------------------------------------------------------
// Lector de QR con la cámara (BarcodeDetector si existe; si no, jsQR)
// ---------------------------------------------------------------------
function QrScanner({ active, onCode }: { active: boolean; onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(true);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [err, setErr] = useState<string | null>(null);
  const cb = useRef(onCode);
  cb.current = onCode;

  useEffect(() => {
    if (!on || !active) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (stopped) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setErr(null);
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        const detector = BD ? new BD({ formats: ["qr_code"] }) : null;
        const jsQR = detector ? null : (await import("jsqr")).default;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        const tick = async () => {
          if (stopped) return;
          try {
            if (v.readyState >= 2) {
              let code: string | null = null;
              if (detector) {
                const r = await detector.detect(v);
                code = r[0]?.rawValue ?? null;
              } else if (jsQR) {
                canvas.width = v.videoWidth; canvas.height = v.videoHeight;
                ctx.drawImage(v, 0, 0);
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
              }
              if (code && code.startsWith("JFY")) cb.current(code);
            }
          } catch { /* sigue */ }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        setErr(t("kiosk.noCamera"));
      }
    })();
    return () => { stopped = true; if (timer) clearTimeout(timer); stream?.getTracks().forEach((tr) => tr.stop()); };
  }, [on, active, facing]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-black/60 border border-white/10">
        {on && active ? <video ref={video} playsInline muted className={clsx("w-full h-full object-cover", facing === "user" && "-scale-x-100")} /> : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500"><CameraOff className="w-10 h-10" /></div>
        )}
        <div className="pointer-events-none absolute inset-[18%] border-4 border-white/70 rounded-3xl" />
        {err && <p className="absolute bottom-0 inset-x-0 bg-black/70 text-xs text-amber-300 p-2 text-center">{err}</p>}
      </div>
      <div className="flex gap-2 justify-center">
        <button type="button" onClick={() => setOn(!on)} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm flex items-center gap-2 cursor-pointer">
          {on ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}{on ? t("kiosk.camOff") : t("kiosk.camOn")}
        </button>
        <button type="button" onClick={() => setFacing(facing === "user" ? "environment" : "user")} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm cursor-pointer">
          {t("kiosk.camSwitch")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
export default function Kiosco() {
  const [token, setToken] = useState<string | null>(() => readToken());
  const [hello, setHello] = useState<Hello | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [step, setStep] = useState<Step>({ s: "home" });
  const [pin, setPin] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const lastQr = useRef<{ code: string; at: number } | null>(null);
  const idle = useRef<number | undefined>(undefined);

  const loadHello = useCallback(async () => {
    if (!token) return;
    const { data, error } = await supabase.rpc("kiosk_hello", { p_token: token });
    if (error) { setHello({ ok: false, error: t("kiosk.offlineRetry") }); return; }
    const h = data as Hello;
    setHello(h);
    if (h.server_time) setOffset(new Date(h.server_time).getTime() - Date.now());
  }, [token]);

  useEffect(() => { loadHello(); const timer = setInterval(loadHello, 5 * 60_000); return () => clearInterval(timer); }, [loadHello]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    document.title = `Jornify · ${t("kiosk.title")}`;
    document.documentElement.classList.add("dark");
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const req = () => nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    req();
    const onVis = () => document.visibilityState === "visible" && req();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release().catch(() => {}); };
  }, []);

  const home = useCallback(() => { setStep({ s: "home" }); setPin(""); setQuery(""); setBusy(false); }, []);

  // Vuelve al inicio si no se toca nada
  useEffect(() => {
    if (idle.current) clearTimeout(idle.current);
    if (step.s === "home") return;
    idle.current = window.setTimeout(home, step.s === "done" ? 3500 : 20000);
    return () => { if (idle.current) clearTimeout(idle.current); };
  }, [step, pin, home]);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 4000); return () => clearTimeout(timer); }, [toast]);

  const identify = useCallback(async (cred: Cred) => {
    if (!token) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("kiosk_punch", { p_token: token, p_user_id: cred.userId ?? null, p_pin: cred.pin ?? null, p_qr: cred.qr ?? null, p_type: null });
    setBusy(false);
    if (error) { setToast(t("kiosk.offline")); return; }
    const r = data as Peek;
    if (!r.ok) {
      setPin("");
      if (r.code === "device") loadHello();
      if (r.code === "bad_pin" || r.code === "bad_qr") setToast(kioskError(r));
      else setStep({ s: "done", ok: false, title: kioskError(r) });
      return;
    }
    setStep({ s: "actions", peek: r, cred });
  }, [token, loadHello]);

  async function punch(type: string, cred: Cred) {
    if (!token) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("kiosk_punch", { p_token: token, p_user_id: cred.userId ?? null, p_pin: cred.pin ?? null, p_qr: cred.qr ?? null, p_type: type });
    setBusy(false);
    if (error) { setToast(t("kiosk.offline")); return; }
    const r = data as { ok: boolean; error?: string; code?: string; name?: string; ts?: string };
    if (!r.ok) { setStep({ s: "done", ok: false, title: kioskError(r) }); return; }
    setStep({ s: "done", ok: true, title: doneLabel(type), sub: `${r.name} · ${DateTime.fromISO(r.ts!, { zone: TZ }).toFormat("HH:mm")}` });
  }

  const onQr = useCallback((code: string) => {
    if (step.s !== "home" || busy) return;
    const l = lastQr.current;
    if (l && l.code === code && Date.now() - l.at < 6000) return;
    lastQr.current = { code, at: Date.now() };
    identify({ qr: code });
  }, [step.s, busy, identify]);

  // Lector de QR USB (teclea el código y Enter)
  useEffect(() => {
    let buf = "";
    let timer: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { if (buf.startsWith("JFY")) onQr(buf.trim()); buf = ""; return; }
      if (e.key.length === 1) { buf += e.key; clearTimeout(timer); timer = window.setTimeout(() => { buf = ""; }, 300); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(timer); };
  }, [onQr]);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (hello?.people ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [hello, query]);

  const clock = DateTime.fromMillis(now + offset, { zone: TZ });

  // ------------------------------------------------- sin activar
  if (!token || (hello && !hello.ok && (hello.code === "device" || (hello.error && /activado/.test(hello.error))))) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <img src="/jornify-logo.webp" alt="Jornify" className="h-14 w-14 rounded-2xl mx-auto" />
          <h1 className="text-2xl font-semibold">{t("nav.kiosks")}</h1>
          <p className="text-slate-400 text-sm">
            {token ? t("kiosk.deactivated") : t("kiosk.notActivated")} {t("kiosk.howActivate")}
          </p>
          <div className="flex justify-center"><LanguageMenu compact dark /></div>
          {token && <button type="button" onClick={() => { try { localStorage.removeItem(KEY); } catch { /* nada */ } setToken(null); setHello(null); }}
            className="text-xs text-slate-500 underline cursor-pointer">{t("kiosk.forget")}</button>}
        </div>
      </div>
    );
  }

  const dev = hello?.device;
  const locked = dev?.locked_until && new Date(dev.locked_until).getTime() > now + offset;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col select-none">
      <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/jornify-logo.webp" alt="" className="h-10 w-10 rounded-xl" />
          <div className="min-w-0">
            <p className="font-semibold truncate">{hello?.company ?? "…"}</p>
            <p className="text-xs text-slate-400 truncate">{[dev?.name, hello?.center].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-4xl font-semibold tabular-nums tracking-tight">{clock.toFormat("HH:mm:ss")}</p>
            <p className="text-xs text-slate-400">{(() => { const s = clock.toLocaleString({ weekday: "long", day: "numeric", month: "long" }); return s.charAt(0).toUpperCase() + s.slice(1); })()}</p>
          </div>
          <LanguageMenu compact dark />
        </div>
      </header>

      {hello && !hello.ok && <p className="text-center text-amber-300 text-sm py-2 bg-amber-500/10">{hello.code ? kioskError(hello) : hello.error}</p>}

      <main className="flex-1 p-6 flex flex-col">
        {/* ---------------- inicio ---------------- */}
        {step.s === "home" && (
          <div className={clsx("grid gap-6 flex-1", dev?.allow_pin && dev?.allow_qr ? "lg:grid-cols-[1fr_380px]" : "")}>
            {dev?.allow_pin && (
              <section className="flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="text-xl font-semibold">{t("kiosk.tapName")}</h2>
                  {(hello?.people?.length ?? 0) > 12 && (
                    <label className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                      <Search className="w-4 h-4 text-slate-400" />
                      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("kiosk.search")} className="bg-transparent outline-none text-sm w-40" />
                    </label>
                  )}
                </div>
                {people.length === 0 ? (
                  <p className="text-slate-400 text-sm">
                    {(hello?.people?.length ?? 0) === 0 ? t("kiosk.nobodyPin") : t("kiosk.noMatch")}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto">
                    {people.map((p) => (
                      <button key={p.id} type="button" disabled={!!locked} onClick={() => { setPin(""); setStep({ s: "pin", id: p.id, name: p.name }); }}
                        className="rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/10 px-4 py-5 text-left cursor-pointer disabled:opacity-40">
                        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-accent/20 text-accent font-semibold mb-2">{p.name.slice(0, 1)}</span>
                        <span className="block text-lg font-medium truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
            {dev?.allow_qr && (
              <section className="space-y-3">
                <h2 className="text-xl font-semibold flex items-center gap-2"><QrIcon className="w-5 h-5" />{t("kiosk.showQr")}</h2>
                <p className="text-sm text-slate-400">{t("kiosk.showQrHint")}</p>
                <QrScanner active={step.s === "home" && !locked} onCode={onQr} />
              </section>
            )}
            {locked && <p className="text-amber-300 text-center lg:col-span-2">{t("kiosk.lockedLong")}</p>}
          </div>
        )}

        {/* ---------------- PIN ---------------- */}
        {step.s === "pin" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <button type="button" onClick={home} className="self-start flex items-center gap-2 text-slate-400 hover:text-white cursor-pointer"><ArrowLeft className="w-5 h-5" />{t("common.back")}</button>
            <h2 className="text-3xl font-semibold">{step.name}</h2>
            <p className="text-slate-400">{t("kiosk.typePin")}</p>
            <div className="flex gap-3 h-6">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <span key={i} className={clsx("w-4 h-4 rounded-full border-2", i < pin.length ? "bg-white border-white" : "border-white/40")} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} type="button" onClick={() => pin.length < 6 && setPin(pin + d)}
                  className="h-20 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/10 text-3xl font-medium cursor-pointer">{d}</button>
              ))}
              <button type="button" onClick={() => setPin(pin.slice(0, -1))} aria-label={t("common.delete")}
                className="h-20 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center cursor-pointer"><Delete className="w-7 h-7" /></button>
              <button type="button" onClick={() => pin.length < 6 && setPin(pin + "0")}
                className="h-20 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/10 text-3xl font-medium cursor-pointer">0</button>
              <button type="button" disabled={pin.length < 4 || busy} onClick={() => identify({ userId: step.id, pin })}
                className="h-20 rounded-2xl bg-accent/80 hover:bg-accent text-slate-950 text-xl font-semibold cursor-pointer disabled:opacity-30">OK</button>
            </div>
          </div>
        )}

        {/* ---------------- acciones ---------------- */}
        {step.s === "actions" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <button type="button" onClick={home} className="self-start flex items-center gap-2 text-slate-400 hover:text-white cursor-pointer"><ArrowLeft className="w-5 h-5" />{t("common.cancel")}</button>
            <h2 className="text-3xl font-semibold">{t("kiosk.hello", { name: step.peek.name })}</h2>
            <p className="text-slate-400">
              {statusLabel(step.peek.status ?? "OUT")}
              {step.peek.since && step.peek.status !== "OUT" ? ` · ${t("dash.since", { time: DateTime.fromISO(step.peek.since, { zone: TZ }).toFormat("HH:mm") })}` : ""}
            </p>
            {(step.peek.allowed ?? []).length === 0 ? <p className="text-amber-300">{t("kiosk.cantNow")}</p> : (
              <div className="grid sm:grid-cols-2 gap-4 w-full max-w-2xl">
                {(step.peek.allowed ?? []).map((k) => (
                  <button key={k} type="button" disabled={busy} onClick={() => punch(k, step.cred)}
                    className={clsx("h-32 rounded-3xl text-2xl font-semibold flex flex-col items-center justify-center gap-2 cursor-pointer disabled:opacity-50", ACTION[k]?.cls)}>
                    {ACTION[k]?.icon}{actionLabel(k)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------------- resultado ---------------- */}
        {step.s === "done" && (
          <button type="button" onClick={home} className="flex-1 flex flex-col items-center justify-center gap-4 cursor-pointer">
            {step.ok ? <CheckCircle2 className="w-28 h-28 text-emerald-400" /> : <XCircle className="w-28 h-28 text-rose-400" />}
            <p className="text-3xl font-semibold text-center">{step.title}</p>
            {step.sub && <p className="text-xl text-slate-300">{step.sub}</p>}
          </button>
        )}
      </main>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-5 py-3 rounded-2xl shadow-2xl text-lg">{toast}</div>}

      <footer className="px-6 py-3 text-[11px] text-slate-500 flex justify-between gap-4 border-t border-white/5">
        <span>{t("kiosk.footer")}</span>
        <button type="button" className="underline cursor-pointer" onClick={() => {
          if (confirm(t("kiosk.deactivateConfirm"))) {
            try { localStorage.removeItem(KEY); } catch { /* nada */ }
            setToken(null); setHello(null);
          }
        }}>{t("kiosk.deactivateHere")}</button>
      </footer>
    </div>
  );
}
