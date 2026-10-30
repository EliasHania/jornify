// src/App.tsx
import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./lib/supabaseClient";
import { ProfileProvider } from "./hooks/useProfile";
import { LoginPage } from "./pages/Login";
import DashboardShell from "./components/layout/DashboardShell";
import { Loading } from "./components/ui/kit";
import { RESET_PASSWORD_PATH } from "./lib/config";
import { useT } from "./i18n";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Reports = lazy(() => import("./pages/Reports"));
const Employees = lazy(() => import("./pages/Employees"));
const Inspection = lazy(() => import("./pages/Inspection"));
const InspectionPublic = lazy(() => import("./pages/InspectionPublic"));
const Incidencias = lazy(() => import("./pages/Incidencias"));
const Centros = lazy(() => import("./pages/Centros"));
const Ajustes = lazy(() => import("./pages/Ajustes"));
const Representacion = lazy(() => import("./pages/Representacion"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Ausencias = lazy(() => import("./pages/Ausencias"));
const Turnos = lazy(() => import("./pages/Turnos"));
const Mes = lazy(() => import("./pages/Mes"));
const Kioscos = lazy(() => import("./pages/Kioscos"));
const Kiosco = lazy(() => import("./pages/Kiosco"));
const MiKiosco = lazy(() => import("./pages/MiKiosco"));

function PublicRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/inspeccion/:token" element={<InspectionPublic />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function PrivateRouter() {
  return (
    <BrowserRouter>
      <ProfileProvider>
        <DashboardShell>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/informes" element={<Reports />} />
              <Route path="/empleados" element={<Employees />} />
              <Route path="/inspeccion" element={<Inspection />} />
              <Route path="/incidencias" element={<Incidencias />} />
              <Route path="/centros" element={<Centros />} />
              <Route path="/ajustes" element={<Ajustes />} />
              <Route path="/representacion" element={<Representacion />} />
              <Route path="/ausencias" element={<Ausencias />} />
              <Route path="/turnos" element={<Turnos />} />
              <Route path="/mes" element={<Mes />} />
              <Route path="/kioscos" element={<Kioscos />} />
              <Route path="/ajustes-kiosco" element={<MiKiosco />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </DashboardShell>
      </ProfileProvider>
    </BrowserRouter>
  );
}

export default function App() {
  const { t } = useT();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // El kiosco (tablet) funciona sin sesión, con su propio token
  if (window.location.pathname === "/kiosco" || window.location.pathname.startsWith("/kiosco/")) {
    return <Suspense fallback={<div className="min-h-screen bg-slate-950" />}><Kiosco /></Suspense>;
  }
  // El acceso de la Inspección es público: no necesita sesión
  if (window.location.pathname.startsWith("/inspeccion/")) return <PublicRouter />;
  // Enlace del correo de recuperación: abre una sesión temporal solo para cambiar la contraseña
  if (window.location.pathname.startsWith(RESET_PASSWORD_PATH)) {
    return <Suspense fallback={<Loading />}><ResetPassword /></Suspense>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">{t("shell.loadingSession")}</p>
      </div>
    );
  }
  if (!session) return <LoginPage />;
  return <PrivateRouter />;
}
