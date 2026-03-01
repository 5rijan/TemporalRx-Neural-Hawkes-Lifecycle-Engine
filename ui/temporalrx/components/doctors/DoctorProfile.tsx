"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArchetypeBadge } from "@/components/shared/ArchetypeBadge";
import { StagePill } from "@/components/shared/StagePill";
import { MiniBar } from "@/components/shared/MiniBar";
import type { Archetype, DoctorProfile as T } from "@/types";

interface Props { profile: T | null; loading: boolean }

export function DoctorProfile({ profile, loading }: Props) {
  if (!profile && !loading) return <Empty />;

  const cs = profile?.current_state;
  const p  = profile?.profile;
  const js = profile?.journey_summary;

  return (
    <div className="p-4 space-y-5">
      {/* Identity */}
      <div className="space-y-2">
        {loading ? (
          <>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-5 w-24 mt-1" />
          </>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-mono font-medium text-foreground">
                  {p!.doc_id}
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {p!.job_title} · {p!.specialty}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {p!.practice_type} · {p!.plan_type}
                </p>
              </div>
              <StagePill stage={cs!.onboarding_stage} />
            </div>
            <ArchetypeBadge archetype={p!.archetype as Archetype} />
          </>
        )}
      </div>

      <Separator />

      {/* Stats grid */}
      <div>
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">
          Journey
        </p>
        <div className="grid grid-cols-2 gap-2">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)
            : [
                { label: "Days",         value: js!.days_observed.toFixed(0) },
                { label: "Events",       value: cs!.total_events },
                { label: "Active Days",  value: cs!.active_days },
                { label: "Transcr.",     value: cs!.transcriptions_completed },
                { label: "Features",     value: cs!.features_discovered },
                { label: "Errors",       value: cs!.cumulative_errors },
              ].map(({ label, value }) => (
                <div key={label} className="bg-muted/50 rounded-md px-3 py-2 border border-border">
                  <div className="text-[10px] font-mono text-muted-foreground">{label}</div>
                  <div className="text-sm font-mono text-foreground mt-0.5">{value}</div>
                </div>
              ))}
        </div>
      </div>

      <Separator />

      {/* Signal health */}
      <div>
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3">
          Signal Health
        </p>
        <div className="space-y-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6" />)
            : [
                {
                  label: "Engagement",
                  value: cs!.engagement_energy,
                  display: `${(cs!.engagement_energy * 100).toFixed(0)}%`,
                  danger: cs!.engagement_energy < 0.3,
                  warning: cs!.engagement_energy < 0.6,
                },
                {
                  label: "Trust",
                  value: cs!.trust_score,
                  display: `${(cs!.trust_score * 100).toFixed(0)}%`,
                  warning: cs!.trust_score < 0.4,
                },
                {
                  label: "Email Fatigue",
                  value: Math.min(1, cs!.emails_ignored_streak / 5),
                  display: `${cs!.emails_ignored_streak} streak`,
                  danger: cs!.emails_ignored_streak >= 3,
                  warning: cs!.emails_ignored_streak >= 1,
                },
              ].map(({ label, value, display, danger, warning }) => (
                <div key={label} className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-mono text-muted-foreground">{label}</span>
                    <span className={`text-[11px] font-mono ${danger ? "text-destructive" : warning ? "text-amber-400" : "text-foreground"}`}>
                      {display}
                    </span>
                  </div>
                  <MiniBar value={value} danger={danger} warning={warning} />
                </div>
              ))}
        </div>
      </div>

      <Separator />

      {/* Archetype traits */}
      <div>
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3">
          Traits
        </p>
        <div className="space-y-3">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6" />)
            : [
                { label: "Base Engagement",     value: p!.base_engagement },
                { label: "Skepticism",           value: p!.skepticism ?? 0.5,           warning: (p!.skepticism ?? 0) > 0.6 },
                { label: "Error Tolerance",      value: p!.error_tolerance ?? 0.5 },
                { label: "Fatigue Sensitivity",  value: p!.fatigue_sensitivity ?? 0.5,  danger: (p!.fatigue_sensitivity ?? 0) > 0.7 },
              ].map(({ label, value, danger, warning }) => (
                <div key={label} className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[11px] font-mono text-muted-foreground">{label}</span>
                    <span className="text-[11px] font-mono text-foreground">{(value * 100).toFixed(0)}%</span>
                  </div>
                  <MiniBar value={value} danger={danger} warning={warning} />
                </div>
              ))}
        </div>
      </div>

      {/* Status flags */}
      {!loading && (cs!.converted || cs!.churned) && (
        <>
          <Separator />
          <div className="flex gap-2">
            {cs!.converted && (
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 ring-1 ring-emerald-400/20 px-2 py-1 rounded">
                ✓ Converted
              </span>
            )}
            {cs!.churned && (
              <span className="text-[10px] font-mono text-destructive bg-destructive/10 ring-1 ring-destructive/20 px-2 py-1 rounded">
                ✗ Churned
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex items-center justify-center h-full text-center p-8">
      <div>
        <div className="text-muted-foreground text-xs font-mono mb-1">No doctor selected</div>
        <div className="text-muted-foreground/50 text-[11px] font-mono">Pick one from the list</div>
      </div>
    </div>
  );
}