// src/hooks/useProfile.tsx
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import type { Schedule } from "@/lib/format"
import { syncLanguageWithAccount } from "@/i18n"

type Role = "admin" | "owner" | "employee" | null

export type MyTerms = {
  valid_from: string
  jornada_type: "completa" | "parcial"
  weekly_minutes: number
  part_time_pct: number | null
  schedule: Schedule
  flexible: boolean
  today_expected_seconds: number
} | null

export type MyCenter = { id: string; name: string; lat: number; lon: number; radius_m: number; is_primary: boolean }

export type CompanySettings = {
  allowRemote: boolean
  geofenceMode: "flag" | "block"
  maxShiftHours: number
  vacationDays: number
  vacationDayType: "naturales" | "laborables"
  remindersEnabled: boolean
  hourBankEnabled: boolean
  hourBankStart: string | null
  monthlySignoffEnabled: boolean
  webPunchEnabled: boolean
}

const defaultSettings: CompanySettings = {
  allowRemote: false, geofenceMode: "flag", maxShiftHours: 14, vacationDays: 30, vacationDayType: "naturales",
  remindersEnabled: true, hourBankEnabled: false, hourBankStart: null, monthlySignoffEnabled: true, webPunchEnabled: true,
}

type ProfileCtx = {
  // Usuario
  userId: string | null
  role: Role
  isAdmin: boolean
  isRlt: boolean
  workerCode: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  dni: string | null
  createdAt: string | null
  employeeStatus: string | null
  terms: MyTerms
  remoteAllowed: boolean
  todayExpectedSeconds: number | null
  myCenters: MyCenter[]
  kiosk: { hasPin: boolean; hasBadge: boolean }
  settings: CompanySettings
  // Empresa
  companyId: string | null
  companyName: string | null
  companyLegalName: string | null
  companyCif: string | null
  companyAddress: string | null
  companyCity: string | null
  companyProvince: string | null
  companyPostalCode: string | null
  companyCountry: string | null
  companyPhone: string | null
  collectiveAgreement: string | null
  companyCode: string | null
  loading: boolean
  reload: () => Promise<void>
}

const empty: Omit<ProfileCtx, "reload"> = {
  userId: null, role: null, isAdmin: false, isRlt: false, workerCode: null,
  firstName: null, lastName: null, email: null, dni: null, createdAt: null, employeeStatus: null,
  terms: null, remoteAllowed: false, todayExpectedSeconds: null, myCenters: [],
  kiosk: { hasPin: false, hasBadge: false }, settings: defaultSettings,
  companyId: null, companyName: null, companyLegalName: null, companyCif: null,
  companyAddress: null, companyCity: null, companyProvince: null,
  companyPostalCode: null, companyCountry: null, companyPhone: null,
  collectiveAgreement: null, companyCode: null,
  loading: true,
}

const ProfileContext = createContext<ProfileCtx>({ ...empty, reload: async () => {} })

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<ProfileCtx, "reload">>(empty)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setState({ ...empty, loading: false }); return }

    const { data: prof } = await supabase
      .from("profiles")
      .select("role, company_id, first_name, last_name, dni, email, created_at, employee_status, is_rlt, locale")
      .eq("user_id", user.id)
      .maybeSingle()

    const [{ data: comp }, { data: ctx }] = await Promise.all([
      prof?.company_id
        ? supabase
            .from("companies")
            .select("name, code, legal_name, cif, address, city, province, postal_code, country, contact_phone, collective_agreement, web_punch_enabled")
            .eq("id", prof.company_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.rpc("get_my_context"),
    ])

    // Idioma: el de la cuenta en un navegador nuevo, o guardar en la cuenta el de este navegador
    syncLanguageWithAccount(user, (prof as { locale?: string | null } | null)?.locale).catch(() => {})

    const role = (prof?.role as Role) ?? null
    const c = (ctx ?? {}) as {
      worker_code?: string; terms?: MyTerms; remote_allowed?: boolean; today_expected_seconds?: number | null
      centers?: MyCenter[]; kiosk?: { has_pin?: boolean; has_badge?: boolean }
      company?: {
        allow_remote?: boolean; geofence_mode?: "flag" | "block"; max_shift_hours?: number; vacation_days?: number
        vacation_day_type?: "naturales" | "laborables"; reminders_enabled?: boolean; hour_bank_enabled?: boolean
        hour_bank_start?: string | null; monthly_signoff_enabled?: boolean
      }
    }
    const cc = c.company ?? {}

    setState({
      userId: user.id,
      role,
      isAdmin: role === "admin" || role === "owner",
      isRlt: !!prof?.is_rlt,
      workerCode: c.worker_code ?? null,
      firstName: prof?.first_name ?? null,
      lastName: prof?.last_name ?? null,
      email: prof?.email ?? user.email ?? null,
      dni: prof?.dni ?? null,
      createdAt: prof?.created_at ?? null,
      employeeStatus: prof?.employee_status ?? null,
      terms: c.terms ?? null,
      remoteAllowed: !!c.remote_allowed,
      todayExpectedSeconds: c.today_expected_seconds ?? null,
      myCenters: c.centers ?? [],
      kiosk: { hasPin: !!c.kiosk?.has_pin, hasBadge: !!c.kiosk?.has_badge },
      settings: {
        allowRemote: !!cc.allow_remote,
        geofenceMode: cc.geofence_mode ?? "flag",
        maxShiftHours: cc.max_shift_hours ?? 14,
        vacationDays: cc.vacation_days ?? 30,
        vacationDayType: cc.vacation_day_type ?? "naturales",
        remindersEnabled: cc.reminders_enabled ?? true,
        hourBankEnabled: !!cc.hour_bank_enabled,
        hourBankStart: cc.hour_bank_start ?? null,
        monthlySignoffEnabled: cc.monthly_signoff_enabled ?? true,
        webPunchEnabled: (comp as { web_punch_enabled?: boolean } | null)?.web_punch_enabled ?? true,
      },
      companyId: prof?.company_id ?? null,
      companyName: comp?.name ?? null,
      companyLegalName: comp?.legal_name ?? null,
      companyCif: comp?.cif ?? null,
      companyAddress: comp?.address ?? null,
      companyCity: comp?.city ?? null,
      companyProvince: comp?.province ?? null,
      companyPostalCode: comp?.postal_code ?? null,
      companyCountry: comp?.country ?? null,
      companyPhone: comp?.contact_phone ?? null,
      collectiveAgreement: comp?.collective_agreement ?? null,
      companyCode: comp?.code ?? null,
      loading: false,
    })
  }, [])

  useEffect(() => { load() }, [load])

  return <ProfileContext.Provider value={{ ...state, reload: load }}>{children}</ProfileContext.Provider>
}

export const useProfile = () => useContext(ProfileContext)
