import type { Archetype } from "@/types";

const C: Record<Archetype, { label: string; cls: string }> = {
  early_adopter:    { label: "Early Adopter",    cls: "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20" },
  skeptical_senior: { label: "Skeptical Senior", cls: "text-amber-400   bg-amber-400/10   ring-amber-400/20"   },
  busy_registrar:   { label: "Busy Registrar",   cls: "text-sky-400     bg-sky-400/10     ring-sky-400/20"     },
  passive_tryer:    { label: "Passive Tryer",    cls: "text-zinc-400    bg-zinc-400/10    ring-zinc-400/20"    },
  champion:         { label: "Champion",          cls: "text-violet-400  bg-violet-400/10  ring-violet-400/20"  },
};

export function ArchetypeBadge({ archetype }: { archetype: Archetype }) {
  const c = C[archetype] ?? C.passive_tryer;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono tracking-wider ring-1 ${c.cls}`}>
      {c.label}
    </span>
  );
}