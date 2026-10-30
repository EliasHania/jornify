import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { privacyUrl, termsUrl, resetPasswordUrl } from "../lib/config";
import { useT } from "@/i18n";
import { tError } from "@/i18n/errors";
import LanguageMenu from "@/components/LanguageMenu";

export function LoginPage() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [sent, setSent] = useState(false);

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { setError(t("errors.db.invalidEmail")); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: resetPasswordUrl() });
    setLoading(false);
    // Mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados
    if (error && /rate limit|too many|seconds/i.test(error.message)) { setError(t("errors.db.tooMany")); return; }
    setSent(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) setError(tError(error));
    } catch (err) {
      setError(tError(err));
    } finally {
      setLoading(false);
    }
  };

  const input = "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition";

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4"><LanguageMenu dark /></div>
      <div className="w-full max-w-md">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl p-8 space-y-6">
          <div className="space-y-2 text-center">
            <img src="/jornify-logo.webp" alt="Jornify" className="h-12 w-12 rounded-xl mx-auto" />
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">Jornify</h1>
            <p className="text-sm text-slate-400">{t("login.subtitle")}</p>
          </div>

          {mode === "forgot" ? (
            sent ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-slate-300">
                  {t("login.sentPre")} <b className="text-slate-100">{email.trim().toLowerCase()}</b>{t("login.sentPost")}
                </p>
                <button type="button" onClick={() => { setMode("login"); setSent(false); }} className="text-sm text-cyan-300 hover:underline cursor-pointer">
                  {t("login.backToLogin")}
                </button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleForgot}>
                <p className="text-sm text-slate-400">{t("login.forgotIntro")}</p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300" htmlFor="femail">{t("login.email")}</label>
                  <input id="femail" type="email" autoComplete="email" className={input} placeholder={t("login.emailPh")}
                    value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full cursor-pointer inline-flex items-center justify-center rounded-lg bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-semibold text-slate-950 py-2.5 transition">
                  {loading ? t("login.sending") : t("login.sendLink")}
                </button>
                <button type="button" onClick={() => { setMode("login"); setError(null); }} className="w-full text-xs text-slate-400 hover:text-slate-200 cursor-pointer">
                  {t("login.backToLogin")}
                </button>
              </form>
            )
          ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300" htmlFor="email">{t("login.email")}</label>
              <input id="email" type="email" autoComplete="email" className={input} placeholder={t("login.emailPh")}
                value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300" htmlFor="password">{t("login.password")}</label>
              <input id="password" type="password" autoComplete="current-password" className={input} placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full cursor-pointer inline-flex items-center justify-center rounded-lg bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-semibold text-slate-950 py-2.5 mt-2 transition">
              {loading ? t("login.signingIn") : t("login.signIn")}
            </button>
            <button type="button" onClick={() => { setMode("forgot"); setError(null); }} className="w-full text-xs text-cyan-300 hover:underline cursor-pointer">
              {t("login.forgot")}
            </button>
          </form>
          )}

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <p className="text-[11px] text-slate-500 text-center">
            {t("login.sameCreds")}
          </p>
          <p className="text-[11px] text-slate-500 text-center space-x-3">
            <a href={privacyUrl()} target="_blank" rel="noreferrer" className="hover:underline">{t("shell.privacy")}</a>
            <a href={termsUrl()} target="_blank" rel="noreferrer" className="hover:underline">{t("shell.terms")}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
