// src/pages/ResetPassword.tsx — página del enlace de "He olvidado mi contraseña"
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { t as tr, useT } from "@/i18n";
import { tError } from "@/i18n/errors";
import LanguageMenu from "@/components/LanguageMenu";

type Phase = "checking" | "ready" | "invalid" | "done";

const linkError = () => {
  const p = new URLSearchParams(window.location.hash.replace(/^#/, "") || window.location.search);
  const code = p.get("error_code") || p.get("error");
  if (!code) return null;
  return /expired/i.test(code) ? tr("resetWeb.expired") : tr("resetWeb.invalidLink");
};

export default function ResetPassword() {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>("checking");
  const [msg, setMsg] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = `Jornify · ${tr("resetWeb.title")}`;
    const err = linkError();
    if (err) { setMsg(err); setPhase("invalid"); return; }

    // El cliente lee el enlace del correo y abre una sesión temporal de recuperación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) setPhase("ready");
    });
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) setPhase("ready");
      else { setMsg(tr("resetWeb.invalidOrExpired")); setPhase((p) => (p === "checking" ? "invalid" : p)); }
    }, 2500);
    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pass.length < 8) { setMsg(t("resetWeb.min8")); return; }
    if (!/[A-Za-z]/.test(pass) || !/\d/.test(pass)) { setMsg(t("resetWeb.lettersNumbers")); return; }
    if (pass !== pass2) { setMsg(t("resetWeb.mismatch")); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    setSaving(false);
    if (error) {
      const m = error.message.toLowerCase();
      setMsg(
        m.includes("same") || m.includes("different") ? t("errors.db.samePassword")
        : m.includes("weak") || m.includes("pwned") || m.includes("leaked") ? t("resetWeb.weak")
        : m.includes("session") || m.includes("jwt") ? t("resetWeb.expired")
        : tError(error)
      );
      return;
    }
    // Se cierra la sesión de recuperación para entrar limpio con la contraseña nueva
    await supabase.auth.signOut();
    setPhase("done");
  }

  const input = "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition";

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4"><LanguageMenu dark /></div>
      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl p-8 space-y-6">
        <div className="space-y-2 text-center">
          <img src="/jornify-logo.webp" alt="Jornify" className="h-12 w-12 rounded-xl mx-auto" />
          <h1 className="text-xl font-semibold tracking-tight text-slate-50">{t("resetWeb.title")}</h1>
        </div>

        {phase === "checking" && <p className="text-sm text-slate-400 text-center">{t("resetWeb.checking")}</p>}

        {phase === "invalid" && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-red-300">{msg}</p>
            <a href="/" className="inline-block text-sm text-cyan-300 hover:underline">{t("login.backToLogin")}</a>
          </div>
        )}

        {phase === "ready" && (
          <form className="space-y-4" onSubmit={save}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300" htmlFor="np">{t("resetWeb.title")}</label>
              <input id="np" type="password" autoComplete="new-password" className={input} value={pass} onChange={(e) => setPass(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300" htmlFor="np2">{t("resetWeb.repeat")}</label>
              <input id="np2" type="password" autoComplete="new-password" className={input} value={pass2} onChange={(e) => setPass2(e.target.value)} required />
            </div>
            <p className="text-[11px] text-slate-500">{t("resetWeb.rules")}</p>
            {msg && <p className="text-xs text-red-400">{msg}</p>}
            <button type="submit" disabled={saving}
              className="w-full cursor-pointer rounded-lg bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-sm font-semibold text-slate-950 py-2.5 transition">
              {saving ? t("resetWeb.saving") : t("resetWeb.save")}
            </button>
          </form>
        )}

        {phase === "done" && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-emerald-300">{t("resetWeb.done")}</p>
            <a href="/" className="inline-block rounded-lg bg-cyan-400 hover:bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">{t("resetWeb.goLogin")}</a>
          </div>
        )}
      </div>
    </div>
  );
}
