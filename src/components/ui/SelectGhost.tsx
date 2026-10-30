// src/components/ui/SelectGhost.tsx
interface Option {
  label: string;
  value: string;
}

interface SelectGhostProps {
  label: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  options?: Option[];
}

export default function SelectGhost({
  label,
  placeholder,
  value,
  onChange,
  options = [],
}: SelectGhostProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </label>

      <select
        className="
          w-full rounded-xl px-4 py-2 bg-white dark:bg-slate-900 
          border border-slate-200 dark:border-slate-700
          text-sm text-slate-700 dark:text-slate-200 
          focus:outline-none focus:ring-2 focus:ring-accent/50
        "
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
