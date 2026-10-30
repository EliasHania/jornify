import { useTheme } from "../../hooks/useTheme";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      className="
        relative flex items-center w-[60px] h-[30px] rounded-full px-1
        cursor-pointer transition-all backdrop-blur-sm

        /* LIGHT */
        bg-white/70 border border-slate-300 hover:bg-slate-100

        /* DARK */
        dark:bg-white/10 dark:border-white/10 dark:hover:bg-white/5
      "
    >
      {/* Slider */}
      <div
        className={
          "absolute inset-y-0 my-auto w-[26px] h-[26px] rounded-full bg-accent/40 shadow-glow transition-transform duration-300 " +
          (theme === "dark" ? "translate-x-7" : "translate-x-0")
        }
      />

      {/* Icons */}
      <Sun className="absolute left-2 w-4 h-4 text-yellow-300 pointer-events-none" />
      <Moon className="absolute right-2 w-4 h-4 text-blue-300 pointer-events-none" />
    </button>
  );
}
