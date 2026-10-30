import clsx from "clsx";
import { ReactNode } from "react";

type BadgeProps = {
  children: ReactNode;
  className?: string;
};

export default function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "px-2.5 py-1 rounded-full text-[11px] uppercase tracking-wide font-medium",

        // Fondo y borde LIGHT (bien visibles)
        "bg-slate-100 border border-slate-300 text-slate-700",

        // Fondo y borde DARK (tu estilo futurista)
        "dark:bg-white/10 dark:border-white/10 dark:text-slate-200",

        "backdrop-blur-sm",
        className
      )}
    >
      {children}
    </span>
  );
}
