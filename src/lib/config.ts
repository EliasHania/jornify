// src/lib/config.ts
// Único sitio donde se cambian las URLs públicas.
// En Netlify: Site settings → Environment variables → VITE_PUBLIC_APP_URL / VITE_LEGAL_BASE_URL

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/** URL pública del panel (para los enlaces de Inspección). Si no se define, se usa el dominio actual. */
export const PUBLIC_APP_URL = trimSlash(
  (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ||
    (typeof window !== "undefined" ? window.location.origin : "")
);

/** Base de las páginas legales (privacidad, condiciones, borrado de cuenta).
 *  Se publican con el propio panel (carpeta public/), así que por defecto es el mismo dominio. */
export const LEGAL_BASE_URL = trimSlash(
  (import.meta.env.VITE_LEGAL_BASE_URL as string | undefined) || PUBLIC_APP_URL || "https://jornify.netlify.app"
);

import { lang, type Lang } from "@/i18n";

const LEGAL_PATHS: Record<Lang, { privacy: string; terms: string; deleteAccount: string }> = {
  es: { privacy: "privacidad", terms: "condiciones", deleteAccount: "eliminar-cuenta" },
  en: { privacy: "en/privacy", terms: "en/terms", deleteAccount: "en/delete-account" },
  fr: { privacy: "fr/confidentialite", terms: "fr/conditions", deleteAccount: "fr/supprimer-compte" },
};

/** Páginas legales en el idioma actual */
export const privacyUrl = (l: Lang = lang()) => `${LEGAL_BASE_URL}/${LEGAL_PATHS[l].privacy}/`;
export const termsUrl = (l: Lang = lang()) => `${LEGAL_BASE_URL}/${LEGAL_PATHS[l].terms}/`;
export const deleteAccountUrl = (l: Lang = lang()) => `${LEGAL_BASE_URL}/${LEGAL_PATHS[l].deleteAccount}/`;

export const inspectionUrl = (token: string) => `${PUBLIC_APP_URL}/inspeccion/${token}`;

/** Página a la que lleva el enlace del correo de "He olvidado mi contraseña" */
export const RESET_PASSWORD_PATH = "/restablecer-contrasena";
export const resetPasswordUrl = () => `${PUBLIC_APP_URL}${RESET_PASSWORD_PATH}`;
