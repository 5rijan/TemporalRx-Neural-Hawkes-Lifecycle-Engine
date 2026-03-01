const S: Record<number, { label: string; cls: string }> = {
    0: { label: "Signed Up",    cls: "text-zinc-500   bg-zinc-500/10   ring-zinc-500/20"   },
    1: { label: "Activated",    cls: "text-sky-400    bg-sky-400/10    ring-sky-400/20"    },
    2: { label: "Value Moment", cls: "text-amber-400  bg-amber-400/10  ring-amber-400/20"  },
    3: { label: "Habit Formed", cls: "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20" },
  };
  
  export function StagePill({ stage }: { stage: number }) {
    const c = S[stage] ?? S[0];
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono ring-1 ${c.cls}`}>
        {c.label}
      </span>
    );
  }