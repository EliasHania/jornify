// src/components/layout/Topbar.tsx
import ThemeToggle from "../ui/ThemeToggle";
import NotificationBell from "../NotificationBell";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { useT } from "@/i18n";
import LanguageMenu from "../LanguageMenu";

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate();
  const { t } = useT();
  const { firstName, lastName, role, isAdmin, isRlt, companyName, loading } = useProfile();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  };

  const displayName = [firstName, lastName].filter(Boolean).join(" ") || "—";
  const roleLabel = t(role === "owner" ? "roles.owner" : role === "admin" ? "roles.admin" : isRlt ? "roles.rlt" : "roles.employee");
  const title = isAdmin ? t("shell.adminTitle", { company: companyName ?? t("shell.theCompany") }) : t("shell.hello", { name: firstName ?? "" });
  const subtitle = isAdmin ? t("shell.adminSub") : t("shell.workerSub");

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-950/70 backdrop-blur-xl flex items-center justify-between gap-3 px-4 md:px-8">
      <div className="flex items-center gap-3 min-w-0">
        <button type="button" onClick={onMenu} aria-label={t("shell.openMenu")}
          className="md:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base md:text-xl font-semibold tracking-tight text-slate-800 dark:text-white truncate">
            {loading ? t("common.loading") : title}
          </h1>
          <p className="hidden sm:block text-xs md:text-sm text-slate-500 dark:text-slate-400 truncate">{loading ? "" : subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {!loading && (
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{displayName}</span>
            <span className="text-[11px] text-slate-400">{roleLabel}</span>
          </div>
        )}
        <LanguageMenu compact />
        <NotificationBell />
        <ThemeToggle />
        <button
          type="button"
          onClick={handleLogout}
          className="flex cursor-pointer items-center gap-2 text-xs md:text-sm px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">{t("shell.logout")}</span>
        </button>
      </div>
    </header>
  );
}
