export function MiniBar({ value, danger, warning }: { value: number; danger?: boolean; warning?: boolean }) {
    const color = danger ? "bg-destructive" : warning ? "bg-amber-500" : "bg-primary";
    return (
      <div className="h-0.5 w-full bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      </div>
    );
  }