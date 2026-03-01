"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ArchetypeBadge } from "@/components/shared/ArchetypeBadge";
import { StagePill } from "@/components/shared/StagePill";
import { cn } from "@/lib/utils";
import type { Archetype, DoctorSummary } from "@/types";

const ARCHETYPES: { value: Archetype | "all"; label: string }[] = [
  { value: "all",             label: "All"     },
  { value: "early_adopter",   label: "Early"   },
  { value: "skeptical_senior",label: "Senior"  },
  { value: "busy_registrar",  label: "Busy"    },
  { value: "passive_tryer",   label: "Passive" },
  { value: "champion",        label: "Champ"   },
];

interface Props {
  doctors: DoctorSummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function DoctorList({ doctors, loading, selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState<Archetype | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() =>
    doctors.filter((d) => {
      if (filter !== "all" && d.archetype !== filter) return false;
      if (!search) return true;
      return (
        d.doc_id.includes(search) ||
        d.job_title.toLowerCase().includes(search.toLowerCase()) ||
        d.specialty.toLowerCase().includes(search.toLowerCase())
      );
    }),
    [doctors, filter, search]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search doctors..."
            className="w-full bg-muted/50 border border-border rounded-md pl-7 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring transition-all font-mono"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-1 flex-wrap">
          {ARCHETYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-mono transition-all",
                filter === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="text-[10px] font-mono text-muted-foreground">
          {filtered.length} of {doctors.length} doctors
        </p>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-3 space-y-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-2 w-36" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))
            : filtered.map((doc) => (
                <DoctorRow
                  key={doc.doc_id}
                  doctor={doc}
                  selected={selectedId === doc.doc_id}
                  onClick={() => onSelect(doc.doc_id)}
                />
              ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function DoctorRow({
  doctor,
  selected,
  onClick,
}: {
  doctor: DoctorSummary;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-md transition-all border",
        selected
          ? "bg-accent border-border"
          : "border-transparent hover:bg-muted/50 hover:border-border"
      )}
    >
      {/* Top row */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-mono text-foreground truncate">
          {doctor.doc_id}
        </span>
        <div className="flex gap-1 shrink-0">
          {doctor.churned && (
            <span className="text-[9px] font-mono text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
              churned
            </span>
          )}
          {doctor.converted && (
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
              converted
            </span>
          )}
        </div>
      </div>

      {/* Subtitle */}
      <p className="text-[11px] text-muted-foreground mb-2 truncate">
        {doctor.job_title} · {doctor.specialty}
      </p>

      {/* Badges */}
      <div className="flex items-center gap-1.5">
        <ArchetypeBadge archetype={doctor.archetype} />
        <StagePill stage={doctor.current_stage ?? 0} />
      </div>
    </button>
  );
}