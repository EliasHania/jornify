// src/i18n/detect.ts — elige el idioma por defecto según el país (mismo archivo en la app y en la web)
//
// Regla de Jornify:
//   · Países de habla hispana ............ español
//   · Marruecos, Francia y francófonos ... francés
//   · Países con varias lenguas oficiales (Bélgica, Suiza, Canadá, Luxemburgo):
//     el idioma del dispositivo si es es/en/fr; si no, el más habitual del país
//   · Países de habla inglesa ............ inglés
//   · Cualquier otro país ................ el idioma del dispositivo si es es/en/fr; si no, inglés
//
// El país sale de la región del dispositivo y, si no hay, de la zona horaria.

export const LANGS = ["es", "en", "fr"] as const
export type Lang = (typeof LANGS)[number]

export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v)

const SPANISH = new Set([
  "ES", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "GT", "CU", "BO", "DO", "HN", "PY", "SV", "NI", "CR", "PA", "UY", "PR", "GQ", "AD", "EA", "IC",
])

const FRENCH = new Set([
  "FR", "MA", "DZ", "TN", "MC", "SN", "CI", "CM", "ML", "BF", "NE", "TD", "GN", "BJ", "TG", "CD", "CG", "GA", "MG", "HT",
  "RE", "GP", "MQ", "GF", "YT", "NC", "PF", "PM", "BL", "MF", "WF", "MR", "DJ", "KM", "BI", "CF", "SC", "MU", "LB",
])

const ENGLISH = new Set([
  "GB", "IE", "US", "AU", "NZ", "JM", "BS", "BB", "TT", "BZ", "GY", "GH", "NG", "KE", "UG", "ZA", "ZW", "ZM", "MT", "SG", "PH",
  "GI", "IM", "JE", "GG", "BM", "KY", "VG", "AG", "DM", "GD", "KN", "LC", "VC", "SL", "LR", "GM", "BW", "NA", "MW", "FJ",
])

// Países con varias lenguas oficiales: idioma por defecto si el del dispositivo no es es/en/fr
const MULTI: Record<string, Lang> = { BE: "fr", CH: "fr", CA: "en", LU: "fr" }

// Zona horaria → país (solo las que importan para la regla; el resto se resuelve por idioma del dispositivo)
const TZ_COUNTRY: Record<string, string> = {
  "Europe/Madrid": "ES", "Atlantic/Canary": "ES", "Africa/Ceuta": "ES",
  "Africa/Casablanca": "MA", "Africa/El_Aaiun": "MA",
  "Europe/Paris": "FR", "Africa/Algiers": "DZ", "Africa/Tunis": "TN", "Europe/Monaco": "MC",
  "Europe/Brussels": "BE", "Europe/Zurich": "CH", "Europe/Luxembourg": "LU", "Europe/Andorra": "AD",
  "Africa/Dakar": "SN", "Africa/Abidjan": "CI", "Africa/Douala": "CM", "Africa/Bamako": "ML", "Africa/Ouagadougou": "BF",
  "Africa/Niamey": "NE", "Africa/Ndjamena": "TD", "Africa/Conakry": "GN", "Africa/Porto-Novo": "BJ", "Africa/Lome": "TG",
  "Africa/Kinshasa": "CD", "Africa/Lubumbashi": "CD", "Africa/Brazzaville": "CG", "Africa/Libreville": "GA",
  "Indian/Antananarivo": "MG", "America/Port-au-Prince": "HT", "Indian/Reunion": "RE", "America/Guadeloupe": "GP",
  "America/Martinique": "MQ", "America/Cayenne": "GF", "Africa/Nouakchott": "MR", "Africa/Djibouti": "DJ",
  "America/Mexico_City": "MX", "America/Cancun": "MX", "America/Monterrey": "MX", "America/Tijuana": "MX",
  "America/Argentina/Buenos_Aires": "AR", "America/Buenos_Aires": "AR", "America/Bogota": "CO", "America/Santiago": "CL",
  "America/Lima": "PE", "America/Caracas": "VE", "America/Guayaquil": "EC", "America/Guatemala": "GT", "America/Havana": "CU",
  "America/La_Paz": "BO", "America/Santo_Domingo": "DO", "America/Tegucigalpa": "HN", "America/Asuncion": "PY",
  "America/El_Salvador": "SV", "America/Managua": "NI", "America/Costa_Rica": "CR", "America/Panama": "PA",
  "America/Montevideo": "UY", "America/Puerto_Rico": "PR", "Africa/Malabo": "GQ",
  "America/Toronto": "CA", "America/Montreal": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA",
  "America/Winnipeg": "CA", "America/Halifax": "CA",
  "Europe/London": "GB", "Europe/Dublin": "IE",
}

export type DeviceHints = {
  /** Región del dispositivo o del navegador (ISO 3166, p. ej. "ES", "MA") */
  region?: string | null
  /** Idioma del dispositivo (ISO 639, p. ej. "es", "ar") */
  language?: string | null
  /** Zona horaria IANA (p. ej. "Africa/Casablanca") */
  timeZone?: string | null
  /** Si true, la zona horaria manda sobre la región (en la web la región del navegador es poco fiable) */
  preferTimeZone?: boolean
}

export function countryFrom(h: DeviceHints): string | null {
  const region = h.region ? h.region.toUpperCase() : null
  const tz = h.timeZone ? TZ_COUNTRY[h.timeZone] ?? null : null
  return h.preferTimeZone ? tz ?? region : region ?? tz
}

export function detectLanguage(h: DeviceHints): Lang {
  const country = countryFrom(h)
  const lang = h.language ? h.language.toLowerCase().slice(0, 2) : null
  if (country && SPANISH.has(country)) return "es"
  if (country && FRENCH.has(country)) return "fr"
  if (country && ENGLISH.has(country)) return "en"
  if (country && MULTI[country]) return isLang(lang) ? lang : MULTI[country]
  return isLang(lang) ? lang : "en"
}

/** Locale para formatear fechas y números (Intl / Luxon) */
export function formatLocale(lang: Lang): string {
  return lang === "en" ? "en-GB" : lang === "fr" ? "fr-FR" : "es-ES"
}
