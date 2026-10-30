import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";
import { useT } from "./i18n";

// Al cambiar de idioma se vuelve a montar todo el panel, así no queda ningún texto en el idioma anterior
function Root() {
  const { lang } = useT();
  return (
    <AuthProvider key={lang}>
      <App />
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
