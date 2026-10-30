// src/components/layout/nav.ts
import {
  LayoutDashboard,
  CalendarRange,
  Users2,
  MapPin,
  ShieldCheck,
  Settings,
  ClipboardCheck,
  Scale,
  Palmtree,
  CalendarClock,
  FileSignature,
  Tablet,
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import { t } from "@/i18n";

export type NavItem = { label: string; icon: LucideIcon; to: string };

export const adminNav = (): NavItem[] => [
  { label: t("nav.dashboard"), icon: LayoutDashboard, to: "/" },
  { label: t("nav.reports"), icon: CalendarRange, to: "/informes" },
  { label: t("nav.employees"), icon: Users2, to: "/empleados" },
  { label: t("nav.absences"), icon: Palmtree, to: "/ausencias" },
  { label: t("nav.shifts"), icon: CalendarClock, to: "/turnos" },
  { label: t("nav.monthClose"), icon: FileSignature, to: "/mes" },
  { label: t("nav.corrections"), icon: ClipboardCheck, to: "/incidencias" },
  { label: t("nav.centers"), icon: MapPin, to: "/centros" },
  { label: t("nav.kiosks"), icon: Tablet, to: "/kioscos" },
  { label: t("nav.inspection"), icon: ShieldCheck, to: "/inspeccion" },
  { label: t("nav.settings"), icon: Settings, to: "/ajustes" },
];

export const employeeNav = (isRlt: boolean): NavItem[] => [
  { label: t("nav.myDay"), icon: LayoutDashboard, to: "/" },
  { label: t("nav.myRecords"), icon: CalendarRange, to: "/informes" },
  { label: t("nav.myMonth"), icon: FileSignature, to: "/mes" },
  { label: t("nav.absences"), icon: Palmtree, to: "/ausencias" },
  { label: t("nav.myShifts"), icon: CalendarClock, to: "/turnos" },
  { label: t("nav.corrections"), icon: ClipboardCheck, to: "/incidencias" },
  { label: t("nav.myKiosk"), icon: KeyRound, to: "/ajustes-kiosco" },
  { label: t("nav.mySettings"), icon: Settings, to: "/ajustes" },
  ...(isRlt ? [{ label: t("nav.representation"), icon: Scale, to: "/representacion" }] : []),
];
