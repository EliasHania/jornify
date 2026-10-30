// src/i18n/index.ts — idiomas del panel web (español, inglés y francés)
//
// · Primera visita: idioma del país (zona horaria y región del navegador, ver detect.ts)
// · Elegido a mano (acceso o Ajustes): se guarda en el navegador y en la cuenta
// · Al entrar en un navegador nuevo se recupera el idioma de la cuenta
import i18n from "i18next"
import { initReactI18next, useTranslation } from "react-i18next"
import { Settings } from "luxon"
import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabaseClient"
import { detectLanguage, formatLocale, isLang, LANGS, type Lang } from "./detect"
import es from "./locales/es"
import en from "./locales/en"
import fr from "./locales/fr"

export { LANGS, isLang, type Lang }

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation"
    resources: { translation: typeof es }
  }
}

const STORAGE_KEY = "jornify.lang"

export const LANG_NAME: Record<Lang, string> = { es: "Español", en: "English", fr: "Français" }

const readSaved = (): Lang | null => {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isLang(v) ? v : null
  } catch {
    return null
  }
}
const writeSaved = (l: Lang) => {
  try {
    localStorage.setItem(STORAGE_KEY, l)
  } catch {
    // modo privado: no pasa nada
  }
}

function browserLanguage(): Lang {
  try {
    const tag = (navigator.languages?.[0] || navigator.language || "").replace("_", "-")
    const [language, region] = tag.split("-")
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return detectLanguage({ language, region: region && region.length === 2 ? region : null, timeZone, preferTimeZone: true })
  } catch {
    return "es"
  }
}

function applySideEffects(l: Lang) {
  Settings.defaultLocale = formatLocale(l)
  if (typeof document !== "undefined") {
    document.documentElement.lang = l
    document.title = i18n.t("meta.title")
  }
}

const initial = readSaved() ?? browserLanguage()

i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en }, fr: { translation: fr } },
  lng: initial,
  fallbackLng: "es",
  supportedLngs: [...LANGS],
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
})
applySideEffects(initial)

i18n.on("languageChanged", (l) => {
  if (isLang(l)) applySideEffects(l)
})

export default i18n

/** Traducción fuera de componentes (utilidades, PDFs…). Dentro de componentes usa useT(). */
export const t = i18n.t.bind(i18n) as typeof i18n.t

export const lang = (): Lang => (isLang(i18n.language) ? i18n.language : "es")
export const locale = () => formatLocale(lang())

export function useT() {
  const { t: tr, i18n: inst } = useTranslation()
  const l: Lang = isLang(inst.language) ? inst.language : "es"
  return { t: tr, lang: l, locale: formatLocale(l) }
}

async function pushToAccount(l: Lang, user?: User | null) {
  try {
    const u = user ?? (await supabase.auth.getSession()).data.session?.user
    if (!u) return
    await supabase.rpc("set_my_locale", { p_locale: l })
    if ((u.user_metadata as { locale?: string } | undefined)?.locale !== l) {
      await supabase.auth.updateUser({ data: { locale: l } })
    }
  } catch {
    // no es crítico
  }
}

/** Cambio de idioma elegido por la persona */
export async function setLanguage(l: Lang) {
  writeSaved(l)
  await i18n.changeLanguage(l)
  await pushToAccount(l)
}

/** Tras iniciar sesión: idioma de la cuenta si en este navegador nunca se eligió; si no, se guarda el actual */
export async function syncLanguageWithAccount(user: User, accountLocale: string | null | undefined) {
  if (!readSaved() && isLang(accountLocale)) {
    writeSaved(accountLocale)
    if (accountLocale !== i18n.language) await i18n.changeLanguage(accountLocale)
    if ((user.user_metadata as { locale?: string } | undefined)?.locale !== accountLocale) {
      supabase.auth.updateUser({ data: { locale: accountLocale } }).catch(() => {})
    }
    return
  }
  if (accountLocale !== lang() || (user.user_metadata as { locale?: string } | undefined)?.locale !== lang()) {
    await pushToAccount(lang(), user)
  }
}

/** Etiquetas que se leen en el idioma actual cada vez que se consultan (para mapas de textos) */
export function liveLabels<K extends string>(keys: readonly K[], key: (k: K) => string): Record<K, string> {
  const o = {} as Record<K, string>
  for (const k of keys) Object.defineProperty(o, k, { get: () => i18n.t(key(k) as never) as string, enumerable: true })
  return o
}
