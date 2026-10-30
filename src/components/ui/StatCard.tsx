import { ReactNode } from "react";
import clsx from "clsx";

type StatCardProps = {
  title: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
  className?: string;
};

export default function StatCard({
  title,
  value,
  sub,
  icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={clsx(
        "rounded-2xl p-4 md:p-5",
        // LIGHT
        "bg-white border border-slate-200 shadow-sm",
        // DARK: tarjeta sólida y elegante, sin neón exagerado
        "dark:bg-card dark:border-white/10 dark:shadow-md dark:hover:shadow-glow",
        "transition-all duration-300",
        "flex flex-col justify-between relative overflow-hidden",
        className
      )}
    >
      {/* Glow decorativo muy sutil */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-20 w-20 rounded-full bg-accent/5 blur-xl" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          {title}
        </div>
        {icon && <div className="text-accent">{icon}</div>}
      </div>

      {/* Value principal */}
      <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        {value}
      </div>

      {/* Subtexto */}
      {sub && (
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
          {sub}
        </div>
      )}
    </div>
  );
}
