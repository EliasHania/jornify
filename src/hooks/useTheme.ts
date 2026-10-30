import { useEffect, useState } from "react";

export function useTheme() {
  const getInitialTheme = () => {
    if (typeof window === "undefined") return "dark";

    // 1) Si está almacenado en localStorage → usarlo
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    if (stored) return stored;

    // 2) Si no hay stored → respetar preferencia del sistema
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  };

  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [theme]);

  const toggle = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return { theme, toggle };
}
