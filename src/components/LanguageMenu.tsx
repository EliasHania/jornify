// src/components/LanguageMenu.tsx — cambio de idioma (barra superior, acceso y Ajustes)
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, Globe } from "lucide-react";
import { LANG_NAME, LANGS, setLanguage, useT, type Lang } from "@/i18n";

const SHORT: Record<Lang, string> = { es: "ES", en: "EN", fr: "FR" };

/** Desplegable compacto: globo + código del idioma */
export default function LanguageMenu({ compact, dark }: { compact?: boolean; dark?: boolean }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t("lang.title")}: ${LANG_NAME[lang]}`}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold cursor-pointer transition",
          dark
            ? "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
            : "border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10"
        )}
      >
        <Globe className="w-4 h-4" />
        <span>{compact ? SHORT[lang] : LANG_NAME[lang]}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      {open && (
        <ul role="listbox" aria-label={t("lang.title")}
          className="absolute right-0 mt-2 w-44 z-50 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden py-1">
          {LANGS.map((l) => (
            <li key={l} role="option" aria-selected={l === lang}>
              <button type="button" onClick={async () => { setOpen(false); if (l !== lang) await setLanguage(l); }}
                className={clsx("w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5",
                  l === lang ? "text-accent font-semibold" : "text-slate-700 dark:text-slate-200")}>
                <span className="w-7 text-[11px] font-bold text-slate-400">{SHORT[l]}</span>
                <span className="flex-1 text-left">{LANG_NAME[l]}</span>
                {l === lang && <Check className="w-4 h-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Lista grande para la página de Ajustes */
export function LanguageOptions() {
  const { lang } = useT();
  const [busy, setBusy] = useState<Lang | null>(null);
  return (
    <div className="grid sm:grid-cols-3 gap-2" role="radiogroup">
      {LANGS.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={l === lang} disabled={!!busy}
          onClick={async () => { if (l === lang) return; setBusy(l); await setLanguage(l); setBusy(null); }}
          className={clsx("flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm cursor-pointer transition",
            l === lang
              ? "border-accent/50 bg-accent/10 text-accent font-semibold"
              : "border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200")}>
          <span className={clsx("h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-bold",
            l === lang ? "bg-accent text-white" : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300")}>{SHORT[l]}</span>
          <span className="flex-1 text-left">{LANG_NAME[l]}</span>
          {l === lang && <Check className="w-4 h-4" />}
        </button>
      ))}
    </div>
  );
}
