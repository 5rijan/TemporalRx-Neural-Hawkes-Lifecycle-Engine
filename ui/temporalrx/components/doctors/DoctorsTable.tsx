"use client";

import { useState, useMemo } from "react";
import { Search, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { ArchetypeBadge } from "@/components/shared/ArchetypeBadge";
import { StagePill } from "@/components/shared/StagePill";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Archetype, DoctorSummary } from "@/types";

type SortKey = "doc_id" | "event_count" | "churn_risk" | "current_stage";
type SortDir = "asc" | "desc";

const ARCHETYPES: (Archetype | "all")[] = ["all","early_adopter","skeptical_senior","busy_registrar","passive_tryer","champion"];

interface Props {
  doctors: DoctorSummary[];
  loading: boolean;
  onSelect: (id: string) => void;
}

export function DoctorsTable({ doctors, loading, onSelect }: Props) {
  const [search, setSearch]     = useState("");
  const [archetype, setArchetype] = useState<Archetype | "all">("all");
  const [sortKey, setSortKey]   = useState<SortKey>("event_count");
  const [sortDir, setSortDir]   = useState<SortDir>("desc");
  const [status, setStatus]     = useState<"all" | "converted" | "churned" | "active">("all");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let d = [...doctors];
    if (search) d = d.filter((x) =>
      x.doc_id.includes(search) ||
      x.job_title.toLowerCase().includes(search.toLowerCase()) ||
      x.specialty.toLowerCase().includes(search.toLowerCase())
    );
    if (archetype !== "all") d = d.filter((x) => x.archetype === archetype);
    if (status === "converted") d = d.filter((x) => x.converted);
    if (status === "churned")   d = d.filter((x) => x.churned);
    if (status === "active")    d = d.filter((x) => !x.churned && !x.converted);
    d.sort((a, b) => {
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return d;
  }, [doctors, search, archetype, status, sortKey, sortDir]);

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ChevronsUpDown className="w-3 h-3 opacity-30" /> :
    sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;

  const col = "text-[11px] font-mono text-muted-foreground uppercase tracking-wider px-3 py-2 text-left select-none";
  const thBtn = (k: SortKey) => (
    <button onClick={() => handleSort(k)} className={`${col} flex items-center gap-1 hover:text-foreground transition-colors`}>
      {k === "event_count" ? "Events" : k === "churn_risk" ? "Churn Risk" : k === "current_stage" ? "Stage" : "ID"}
      <SortIcon k={k} />
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID, specialty, role..."
              className="w-full bg-muted/40 border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring font-mono transition-all"
            />
          </div>
          {/* Status filter */}
          <div className="flex gap-1">
            {(["all","active","converted","churned"] as const).map((s) => (
              <button key={s} onClick={() => setStatus(s)}
                className={cn("px-3 py-1.5 rounded-md text-[11px] font-mono transition-all",
                  status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Archetype filter */}
        <div className="flex gap-1.5 flex-wrap">
          {ARCHETYPES.map((a) => (
            <button key={a} onClick={() => setArchetype(a)}
              className={cn("px-2.5 py-1 rounded text-[10px] font-mono transition-all border",
                archetype === a ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
              )}>
              {a === "all" ? "All archetypes" : a.replace(/_/g, " ")}
            </button>
          ))}
          <span className="ml-auto text-[10px] font-mono text-muted-foreground self-center">
            {filtered.length} doctors
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-background border-b border-border z-10">
            <tr>
              {thBtn("doc_id")}
              <th className={col}>Role & Specialty</th>
              <th className={col}>Archetype</th>
              <th className={col}>Stage</th>
              {thBtn("event_count")}
              {thBtn("churn_risk")}
              <th className={col}>Status</th>
              <th className={col}></th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <Skeleton className="h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : filtered.map((doc) => (
                  <tr
                    key={doc.doc_id}
                    onClick={() => onSelect(doc.doc_id)}
                    className="border-b border-border/40 hover:bg-muted/30 cursor-pointer transition-colors group"
                  >
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-mono text-foreground">{doc.doc_id}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs font-mono text-foreground">{doc.job_title}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">{doc.specialty}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <ArchetypeBadge archetype={doc.archetype} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StagePill stage={doc.current_stage ?? 0} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-mono text-muted-foreground">{doc.event_count?.toLocaleString()}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <ChurnBar value={doc.churn_risk ?? 0} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        {doc.converted && <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded ring-1 ring-emerald-400/20">converted</span>}
                        {doc.churned   && <span className="text-[10px] font-mono text-destructive bg-destructive/10 px-1.5 py-0.5 rounded ring-1 ring-destructive/20">churned</span>}
                        {!doc.converted && !doc.churned && <span className="text-[10px] font-mono text-muted-foreground">active</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                        View →
                      </span>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChurnBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value > 0.7 ? "bg-destructive" : value > 0.4 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground">{pct}%</span>
    </div>
  );
}