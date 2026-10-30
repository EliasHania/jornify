// src/components/NotificationBell.tsx — avisos del usuario (campana de la barra superior)
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import clsx from "clsx";
import { DateTime } from "luxon";
import { supabase } from "@/lib/supabaseClient";
import { TZ } from "@/lib/format";
import { t, useT } from "@/i18n";

type Notif = { id: string; kind: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null };

const ago = (iso: string) => {
  const d = DateTime.fromISO(iso, { zone: TZ });
  const mins = Math.round(DateTime.now().diff(d, "minutes").minutes);
  if (mins < 1) return t("bell.now");
  if (mins < 60) return t("bell.minAgo", { n: mins });
  if (mins < 60 * 24) return t("bell.hAgo", { n: Math.round(mins / 60) });
  return d.toFormat("d LLL, HH:mm");
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const { t } = useT();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, link, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data ?? []) as Notif[]);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const unread = items.filter((n) => !n.read_at);

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((xs) => xs.map((x) => (ids.includes(x.id) ? { ...x, read_at: x.read_at ?? now } : x)));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids).is("read_at", null);
  }

  function openItem(n: Notif) {
    markRead([n.id]);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); if (!open) load(); }}
        aria-label={unread.length ? t("bell.unreadA11y", { count: unread.length }) : t("bell.title")}
        className="relative p-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer"
      >
        <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-auto sm:mt-2 sm:w-96 z-50 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">{t("bell.title")}</span>
            {unread.length > 0 && (
              <button type="button" onClick={() => markRead(unread.map((u) => u.id))}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline cursor-pointer">
                <CheckCheck className="w-3.5 h-3.5" />{t("bell.markAll")}
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
            {items.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-10">{t("bell.empty")}</p>
            ) : items.map((n) => (
              <button key={n.id} type="button" onClick={() => openItem(n)}
                className={clsx("w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer flex gap-3",
                  !n.read_at && "bg-accent/5")}>
                <span className={clsx("mt-1.5 h-2 w-2 rounded-full shrink-0", n.read_at ? "bg-transparent" : "bg-accent")} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900 dark:text-white">{n.title}</span>
                  {n.body && <span className="block text-xs text-slate-600 dark:text-slate-400 mt-0.5 break-words">{n.body}</span>}
                  <span className="block text-[11px] text-slate-400 mt-1">{ago(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
