"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { HistoryEvent } from "@/types";

const CAT: Record<string, { dot: string; row: string }> = {
  A_positive:  { dot: "bg-emerald-500", row: ""                          },
  B_friction:  { dot: "bg-red-500",     row: "bg-red-500/5"              },
  C_social:    { dot: "bg-amber-500",   row: "bg-amber-500/5"            },
  D_lifecycle: { dot: "bg-sky-500",     row: ""                          },
  E_milestone: { dot: "bg-violet-500",  row: "bg-violet-500/5 ring-1 ring-violet-500/10" },
};

function fmtDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-AU", { month: "short", day: "numeric" });
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}

interface Props { events: HistoryEvent[]; loading: boolean }

export function EventHistory({ events, loading }: Props) {
  if (loading) return (
    <div className="p-4 space-y-1.5">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex gap-3 items-center py-1">
          <Skeleton className="w-2 h-2 rounded-full shrink-0" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-2 w-12" />
        </div>
      ))}
    </div>
  );

  if (!events.length) return (
    <div className="flex items-center justify-center h-32 text-muted-foreground text-xs font-mono">
      No events to display
    </div>
  );

  // Group by date
  const grouped: [string, HistoryEvent[]][] = [];
  const map: Record<string, HistoryEvent[]> = {};
  events.forEach((e) => {
    const d = fmtDate(e.timestamp);
    if (!map[d]) { map[d] = []; grouped.push([d, map[d]]); }
    map[d].push(e);
  });

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-5">
        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pb-3 border-b border-border">
          {Object.entries({
            A_positive: "Product", B_friction: "Friction",
            C_social: "Social", D_lifecycle: "Lifecycle", E_milestone: "Milestone",
          }).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={cn("w-1.5 h-1.5 rounded-full", CAT[key].dot)} />
              <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        {/* Timeline */}
        {grouped.map(([date, dayEvents]) => (
          <div key={date}>
            <p className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest mb-1.5">
              {date}
            </p>
            <div className="space-y-0.5">
              {dayEvents.map((ev, i) => {
                const cfg = CAT[ev.event_category] ?? CAT.A_positive;
                const isMilestone = ev.event_category === "E_milestone";
                return (
                  <div
                    key={`${ev.event_id}-${i}`}
                    className={cn(
                      "flex items-center gap-3 px-2 py-1.5 rounded-md transition-colors",
                      cfg.row,
                      !cfg.row && "hover:bg-muted/30"
                    )}
                  >
                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />

                    <span className={cn(
                      "flex-1 text-xs font-mono truncate",
                      isMilestone ? "text-violet-300" : "text-foreground"
                    )}>
                      {ev.event_type.replaceAll("_", " ")}
                    </span>

                    <div className="flex items-center gap-3 shrink-0">
                      {ev.emails_ignored_streak > 0 && (
                        <span className="text-[10px] font-mono text-destructive">
                          {ev.emails_ignored_streak}× ignored
                        </span>
                      )}
                      <span className={cn(
                        "text-[10px] font-mono w-8 text-right",
                        ev.event_valence > 0 ? "text-emerald-400" :
                        ev.event_valence < 0 ? "text-red-400" : "text-muted-foreground"
                      )}>
                        {ev.event_valence > 0 ? "+" : ""}{ev.event_valence.toFixed(1)}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/60 w-12 text-right">
                        {fmtTime(ev.timestamp)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}