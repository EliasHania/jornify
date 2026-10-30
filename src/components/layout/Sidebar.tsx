// src/components/layout/Sidebar.tsx
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { X } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { adminNav, employeeNav } from "./nav";
import { privacyUrl, termsUrl } from "@/lib/config";
import { useT } from "@/i18n";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    "w-full flex items-center gap-3 px-3 py-2 rounded-xl font-medium transition border text-sm",
    isActive
      ? "bg-slate-200 dark:bg-white/10 text-accent border-slate-300 dark:border-accent/40 shadow-sm"
      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border-transparent"
  );

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useT();
  const { role, isAdmin, isRlt, workerCode, companyName, firstName, lastName, loading } = useProfile();
  const navItems = isAdmin ? adminNav() : employeeNav(isRlt);
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || "—";
  const roleLabel = t(role === "owner" ? "roles.owner" : role === "admin" ? "roles.admin" : isRlt ? "roles.rlt" : "roles.employee");

  return (
    <>
      <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 flex items-center gap-3">
        <img src="/jornify-logo.webp" alt="Jornify" className="h-9 w-9 rounded-xl object-cover" />
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200 truncate">
            {loading ? t("common.loading") : companyName ?? "Jornify"}
          </div>
          <div className="text-xs text-slate-500">{loading ? "—" : roleLabel}</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 text-sm overflow-y-auto">
        {navItems.map(({ label, icon: Icon, to }) => (
          <NavLink key={to} to={to} end={to === "/"} className={navLinkClass} onClick={onNavigate}>
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-slate-200 dark:border-white/5 space-y-1">
        <div className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{loading ? "—" : displayName}</div>
        {!isAdmin && workerCode && (
          <div className="text-[11px] text-slate-400">{t("shell.yourCode")}: <span className="font-mono">{workerCode}</span></div>
        )}
        <div className="text-[11px] text-slate-400 flex gap-2">
          <a href={privacyUrl()} target="_blank" rel="noreferrer" className="hover:underline">{t("shell.privacy")}</a>
          <a href={termsUrl()} target="_blank" rel="noreferrer" className="hover:underline">{t("shell.terms")}</a>
          <span>· Jornify</span>
        </div>
      </div>
    </>
  );
}

export default function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { t } = useT();
  return (
    <>
      <aside className="hidden md:flex w-72 shrink-0 flex-col border-r border-slate-200 dark:border-white/5 bg-white/80 dark:bg-black/20 backdrop-blur-xl sticky top-0 h-screen">
        <SidebarBody />
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] flex flex-col bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-white/10 shadow-2xl">
            <button type="button" onClick={onClose} aria-label={t("shell.closeMenu")}
              className="absolute right-3 top-5 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
            <SidebarBody onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
