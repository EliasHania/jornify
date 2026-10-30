// src/i18n/errors.ts — traduce los errores del servidor (Supabase/Postgres) al idioma de la persona
// (mismo archivo en la app y en la web; solo cambia el import de i18n)
import i18n from "./index"

type DbKey = keyof typeof import("./locales/es").default.errors.db

// Mensajes exactos que lanza la base de datos
const EXACT: Record<string, DbKey> = {
  "Activa al menos un modo de identificación": "kioskNeedMode",
  "Algún centro no pertenece a tu empresa": "centerNotYours",
  "Centro de trabajo no válido para este trabajador": "centerInvalidForWorker",
  "Centro no encontrado o inactivo": "centerNotFoundOrInactive",
  "Centro no encontrado": "centerNotFound",
  "Centro no válido": "centerInvalid",
  "CLOSE_SHIFT must have desired_type = OUT": "closeShiftMustBeOut",
  "Company code already exists": "companyCodeExists",
  "Company not found": "companyNotFound",
  "Corrección no encontrada": "correctionNotFound",
  "El centro necesita un nombre": "centerNeedsName",
  "El fichaje a corregir no pertenece a este trabajador": "recordNotOfWorker",
  "El fichaje indicado no pertenece a este trabajador": "recordNotOfWorker",
  "El periodo máximo por enlace es de un año": "linkMaxYear",
  "El PIN tiene que tener de 4 a 6 cifras": "pinLength",
  "El porcentaje de parcialidad tiene que estar entre 0 y 100": "partTimePct",
  "El trabajador no está activo en tu empresa": "workerNotActive",
  "El trabajador no pertenece a tu empresa": "workerNotInCompany",
  "Employee not found in your company (or is admin/owner)": "workerNotInCompany",
  "Enlace no encontrado": "linkNotFound",
  "Ese fichaje no existe o ya fue corregido": "recordGoneOrCorrected",
  "Ese fichaje ya estaba anulado o corregido": "recordAlreadyCorrected",
  "Ese PIN es demasiado fácil": "pinTooEasy",
  "Esta corrección necesita el fichaje original": "correctionNeedsOriginal",
  "Esta corrección ya no está pendiente de tu respuesta": "correctionNotPending",
  "Estos datos de la empresa solo se pueden cambiar desde las opciones específicas": "companyProtectedFields",
  "Explica el motivo de la corrección": "explainCorrection",
  "Explica en qué no estás de acuerdo": "explainDisagreement",
  "Explica por qué no estás de acuerdo": "explainDisagreement",
  "Falta la hora de la corrección": "correctionTimeMissing",
  "Horario no válido": "scheduleInvalid",
  "Horas semanales no válidas": "weeklyHoursInvalid",
  "Indica desde qué fecha se aplica": "termsFromMissing",
  "Indica el fichaje a corregir": "pickRecord",
  "Indica el tipo de fichaje a añadir": "pickRecordType",
  "Indica el tipo de fichaje": "pickRecordType",
  "Indica la hora correcta": "pickCorrectTime",
  "Invalid company code format": "companyCodeFormat",
  "Admin has no company": "noCompany",
  "Admin profile not found": "profileNotFound",
  "Profile not found for user": "profileNotFound",
  "Profile not found": "profileNotFound",
  "Invalid status": "invalidStatus",
  "Kiosco no encontrado": "kioskNotFound",
  "La hora corregida no puede estar en el futuro": "timeInFuture",
  "La hora no puede estar en el futuro": "timeInFuture",
  "La persona no pertenece a la empresa": "workerNotInCompany",
  "La validez tiene que estar entre 1 y 30 días": "linkValidity",
  "Los movimientos de la bolsa no se modifican: añade otro movimiento para corregir": "hourBankImmutable",
  "Marca la ubicación del centro en el mapa": "centerNeedsLocation",
  "Máximo 20 kioscos activos": "kioskMax",
  "Mes no válido (AAAA-MM)": "monthInvalid",
  "Mes no válido": "monthInvalid",
  "Necesitas estar activo en una empresa": "needActive",
  "No authenticated user": "notAuthenticated",
  "Not authenticated": "notAuthenticated",
  "No autorizado para aplicar esta corrección": "notAllowed",
  "Not allowed": "notAllowed",
  "Reviewer mismatch": "notAllowed",
  "You cannot change role/company/status": "notAllowed",
  "No perteneces a ninguna empresa activa": "noActiveCompany",
  "No puedes desactivar el centro principal: marca antes otro como principal": "primaryCenterDeactivate",
  "Only admin signup can create a company": "onlyAdminCreatesCompany",
  "Only admin/owner can manage employees": "adminOnly",
  "Only admin/owner can reopen adjustments": "adminOnly",
  "Only admin/owner can review adjustments": "adminOnly",
  "Only admin/owner can update company center": "adminOnly",
  "Solo el administrador puede asignar centros": "adminOnly",
  "Solo el administrador puede crear accesos para Inspección": "adminOnly",
  "Solo el administrador puede designar representantes": "adminOnly",
  "Solo el administrador puede fijar la jornada": "adminOnly",
  "Solo el administrador puede gestionar centros": "adminOnly",
  "Solo el administrador puede proponer correcciones": "adminOnly",
  "Solo el administrador puede resolver correcciones": "adminOnly",
  "Solo la empresa puede hacer esto": "adminOnly",
  "Para aplicar una corrección con discrepancia explica el motivo": "explainDiscrepancy",
  "Periodo no válido": "periodInvalid",
  "Sin empresa": "noCompany",
  "Solo las personas trabajadoras activas firman su resumen": "signOnlyActive",
  "Solo para representantes de los trabajadores": "rltOnly",
  "Solo puedes cancelar tus peticiones pendientes": "cancelOnlyPending",
  "Solo se conservan los registros de los últimos 4 años": "retention4y",
  "Solo se puede marcar como leída": "notifReadOnly",
  "Solo se pueden firmar meses ya terminados": "signOnlyPast",
  "Teletrabajo no autorizado: tu empresa no lo tiene activado para ti.": "remoteNotAllowed",
  "time_records is append-only. Use a new row (adjustment) instead.": "recordsAppendOnly",
  "Tipo de corrección no válido": "correctionTypeInvalid",
  "Tipo de jornada no válido": "jornadaTypeInvalid",
  "Token no válido": "tokenInvalid",
  "Trabajador no encontrado en tu empresa": "workerNotInCompany",
  "Trabajador no válido": "workerInvalid",
  "Tu empresa exige ubicación para fichar en presencial.": "locationRequired",
  "Tu empresa no permite fichar desde la web. Usa la app o el kiosco.": "webPunchDisabled",
  "Una firma no se puede modificar ni borrar: si algo cambia, se vuelve a firmar": "signoffImmutable",
  "User already belongs to a company": "alreadyInCompany",
  "Ya hay condiciones posteriores a esa fecha": "termsLaterExist",
  "Ya hay una corrección en curso para ese fichaje": "correctionInProgress",
  "You already own a company": "alreadyOwnCompany",
  "Idioma no válido": "invalidLanguage",
  // Auth de Supabase
  "Invalid login credentials": "invalidCredentials",
  "Email not confirmed": "emailNotConfirmed",
  "User already registered": "alreadyRegisteredEmail",
}

const recordType = (v: string) => {
  const k = v.trim().toUpperCase()
  if (k === "IN" || k === "OUT" || k === "BREAK_OUT" || k === "BREAK_IN") return i18n.t(`records.type.${k}`)
  return i18n.t("errors.start")
}

// Mensajes con datos variables
const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Acción no válida para una corrección en estado/, () => i18n.t("errors.db.correctionBadAction")],
  [/^Adjustment .+ already reviewed/, () => i18n.t("errors.db.correctionAlreadyReviewed")],
  [/^Adjustment .+ not found/, () => i18n.t("errors.db.correctionNotFound")],
  [/^Anular ese fichaje deja los fichajes en un orden imposible: (\S+) y después (\S+?)\.?$/,
    (m) => i18n.t("errors.db.voidImpossibleOrder", { a: recordType(m[1]), b: recordType(m[2]) })],
  [/^La corrección deja los fichajes en un orden imposible: (\S+) y después (\S+) \((.+)\)\.?$/,
    (m) => i18n.t("errors.db.impossibleOrder", { a: recordType(m[1]), b: recordType(m[2]), when: m[3] })],
  [/^Fuera del centro de trabajo: estás a (\d+) m y el radio permitido es (\d+) m/,
    (m) => i18n.t("errors.db.outOfFence", { dist: m[1], radius: m[2] })],
  [/^Horario no válido[: (]+día (\d+)\)?$/, (m) => i18n.t("errors.db.scheduleInvalidDay", { day: m[1] })],
  [/^Tramo horario no válido \(día (\d+)\)/, (m) => i18n.t("errors.db.scheduleSlotInvalid", { day: m[1] })],
  [/^Máximo 20 plantillas de turno/, () => i18n.t("shiftsWeb.tplMax")],
  [/^Invalid close time/, () => i18n.t("errors.db.closeBeforeOpen")],
  [/^Invalid transition/i, () => i18n.t("errors.db.invalidTransition")],
  [/^Invalid ts .*Must be greater/i, () => i18n.t("errors.db.alreadyRegistered")],
  [/^Only rejected adjustments can be reopened/, () => i18n.t("errors.db.onlyRejectedReopen")],
  [/^Ya hay otro fichaje exactamente a esa hora \((.+)\)/, (m) => i18n.t("errors.db.sameTimeRecord", { when: m[1] })],
  [/row-level security|permission denied/i, () => i18n.t("errors.db.notAllowed")],
  [/duplicate key value violates unique constraint/i, () => i18n.t("errors.db.duplicate")],
  [/rate limit|too many requests|for security purposes, you can only request/i, () => i18n.t("errors.db.tooMany")],
  [/password should be at least/i, () => i18n.t("errors.db.passwordShort")],
  [/new password should be different/i, () => i18n.t("errors.db.samePassword")],
  [/unable to validate email|email address .* is invalid|invalid email/i, () => i18n.t("errors.db.invalidEmail")],
  [/user already registered|already been registered/i, () => i18n.t("errors.db.alreadyRegisteredEmail")],
  [/jwt expired|invalid jwt|auth session missing|refresh token|not authenticated/i, () => i18n.t("errors.db.notAuthenticated")],
  [/network request failed|failed to fetch|networkerror|fetch failed|load failed/i, () => i18n.t("errors.network")],
]

function rawMessage(e: unknown): string {
  if (!e) return ""
  if (typeof e === "string") return e
  const o = e as { message?: unknown; error_description?: unknown; error?: unknown }
  const m = o.message ?? o.error_description ?? o.error
  return typeof m === "string" ? m : ""
}

/** Mensaje de error listo para enseñar, en el idioma actual */
export function tError(e: unknown, fallback?: string): string {
  const raw = rawMessage(e).trim()
  if (!raw) return fallback ?? i18n.t("errors.generic")
  const key = EXACT[raw] ?? EXACT[raw.replace(/\.$/, "")]
  if (key) return i18n.t(`errors.db.${key}`)
  for (const [re, fn] of PATTERNS) {
    const m = raw.match(re)
    if (m) return fn(m)
  }
  // Mensaje desconocido: en español se enseña tal cual; en otros idiomas, uno genérico con el detalle
  if (i18n.language === "es") return raw
  return `${fallback ?? i18n.t("errors.generic")} (${raw})`
}
