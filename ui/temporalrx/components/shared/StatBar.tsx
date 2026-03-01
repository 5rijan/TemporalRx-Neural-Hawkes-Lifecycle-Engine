import { cn } from "@/lib/utils";

interface StatBarProps {
  label: string;
  value: number; // 0-1
  variant?: "default" | "danger" | "success" | "warning";
  showPercent?: boolean;
}

const variantStyles = {
  default: "bg-zinc-900",
  danger:  "bg-red-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
};

export function StatBar({
  label,
  value,
  variant = "default",
  showPercent = true,
}: StatBarProps) {
  const pct = Math.round(value * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
          {label}
        </span>
        {showPercent && (
          <span className="text-xs font-mono text-zinc-300">{pct}%</span>
        )}
      </div>
      <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", variantStyles[variant])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}