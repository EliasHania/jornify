import { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-bg">
      <Sidebar mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 p-4 md:p-8 max-w-[1400px] w-full">{children}</main>
      </div>
    </div>
  );
}
