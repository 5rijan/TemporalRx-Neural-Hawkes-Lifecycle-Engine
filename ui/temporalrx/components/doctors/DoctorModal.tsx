"use client";

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ArchetypeBadge } from "@/components/shared/ArchetypeBadge";
import { StagePill } from "@/components/shared/StagePill";
import { IntensityCurve } from "@/components/doctors/IntensityCurve";
import { InterventionPanel } from "@/components/doctors/InterventionPanel";
import { SimulatorPanel } from "@/components/doctors/SimulatorPanel";
import { useDoctorModal } from "@/hooks/useTemporalRx";
import { cn } from "@/lib/utils";
import type { Archetype, HistoryEvent } from "@/types";

import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis,
    PolarRadiusAxis, ResponsiveContainer,
  } from "recharts";

const CAT_DOT: Record<string, string> = {
  A_positive: "bg-emerald-500", B_friction: "bg-red-500",
  C_social:   "bg-amber-500",   D_lifecycle:"bg-sky-500",
  E_milestone:"bg-violet-500",
};

interface Props {
  docId: string | null;
  open: boolean;
  onClose: () => void;
}

export function DoctorModal({ docId, open, onClose }: Props) {
  const { profile, history, prediction, loading, predLoading, runPrediction, pushEvent, setPrediction } = useDoctorModal(docId);
  const [prevIntensities, setPrevIntensities] = useState<number[] | undefined>();
  const [tab, setTab] = useState("intelligence");

  // Auto-run prediction when doctor loads
  useEffect(() => {
    if (docId && !loading && !prediction) runPrediction();
  }, [docId, loading]);

  const handlePushEvent = async (eventType: string) => {
    const prev = prediction?.curve.intensities;
    await pushEvent(eventType, 1);
    setPrevIntensities(prev);
  };

  const cs = profile?.current_state;
  const p  = profile?.profile;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
<DialogContent className="max-w-[80vw] w-[80vw] sm:max-w-[80vw] max-h-[90vh] h-[90vh] p-0 gap-0 overflow-hidden bg-background border-border">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-start justify-between shrink-0">
          <div>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-3 w-52" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-1.5">
                  <h2 className="text-base font-mono font-medium text-foreground">{p?.doc_id}</h2>
                  {cs && <StagePill stage={cs.onboarding_stage} />}
                  {cs?.converted && <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded ring-1 ring-emerald-400/20">converted</span>}
                  {cs?.churned   && <span className="text-[10px] font-mono text-destructive bg-destructive/10 px-2 py-0.5 rounded ring-1 ring-destructive/20">churned</span>}
                </div>
                <div className="flex items-center gap-2">
                  {p && <ArchetypeBadge archetype={p.archetype as Archetype} />}
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {p?.job_title} · {p?.specialty} · {p?.practice_type}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Quick stats */}
          {!loading && cs && (
            <div className="flex gap-4 text-right">
              {[
                { label: "Events",       val: cs.total_events.toLocaleString() },
                { label: "Active Days",  val: cs.active_days },
                { label: "Transcriptions", val: cs.transcriptions_completed },
              ].map(({ label, val }) => (
                <div key={label}>
                  <div className="text-[10px] font-mono text-muted-foreground">{label}</div>
                  <div className="text-sm font-mono text-foreground">{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-6 h-10 shrink-0">
            {[
              { value: "intelligence", label: "Intelligence" },
              { value: "history",      label: "Event History" },
              { value: "simulator",    label: "Simulator" },
              { value: "profile",      label: "Profile" },
            ].map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="font-mono text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground text-muted-foreground px-4 h-full"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Intelligence tab ── */}
          <TabsContent value="intelligence" className="flex-1 overflow-hidden m-0">
            <div className="flex h-full overflow-hidden">

              {/* Left: curve + intervention */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 border-r border-border">
                {predLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-56 w-full" />
                  </div>
                ) : prediction ? (
                  <>
                    <IntensityCurve prediction={prediction} previousIntensities={prevIntensities} />
                    <div className="border-t border-border pt-5">
                      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">
                        Intervention Control
                      </p>
                      <InterventionPanel
                        prediction={prediction}
                        onScheduleNow={() => {}}
                        onReschedule={() => {}}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-xs font-mono">
                    Run prediction to see intensity curve
                  </div>
                )}
              </div>

              {/* Right: push event */}
              <div className="w-56 shrink-0 p-4 space-y-4">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                  Push Event
                </p>
                <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                  Simulate a new event arriving from this doctor. Watch the curve update in real time.
                </p>
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {[
                    { type: "app_opened",             label: "App Opened",           cat: "A_positive" },
                    { type: "transcription_completed", label: "Transcription Done",   cat: "A_positive" },
                    { type: "ai_note_accepted",        label: "Note Accepted",        cat: "A_positive" },
                    { type: "feature_discovered",      label: "Feature Discovered",   cat: "A_positive" },
                    { type: "transcription_error",     label: "Transcription Error",  cat: "B_friction"  },
                    { type: "app_crashed",             label: "App Crashed",          cat: "B_friction"  },
                    { type: "help_page_opened",        label: "Help Opened",          cat: "B_friction"  },
                    { type: "colleague_invited",       label: "Colleague Invited",    cat: "C_social"    },
                    { type: "email_opened",            label: "Email Opened",         cat: "D_lifecycle" },
                    { type: "email_ignored",           label: "Email Ignored",        cat: "D_lifecycle" },
                    { type: "in_app_nudge_clicked",    label: "Nudge Clicked",        cat: "D_lifecycle" },
                    { type: "value_moment_reached",    label: "Value Moment",         cat: "E_milestone" },
                  ].map(({ type, label, cat }) => (
                    <button
                      key={type}
                      onClick={() => handlePushEvent(type)}
                      disabled={predLoading}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-40 border border-transparent hover:border-border"
                    >
                      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", CAT_DOT[cat])} />
                      {label}
                    </button>
                  ))}
                </div>
                {predLoading && (
                  <div className="text-[10px] font-mono text-primary animate-pulse">Updating...</div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── Event History tab ── */}
          <TabsContent value="history" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="p-5">
                {/* Legend */}
                <div className="flex flex-wrap gap-4 mb-4 pb-4 border-b border-border">
                  {Object.entries({ A_positive:"Product", B_friction:"Friction", C_social:"Social", D_lifecycle:"Lifecycle", E_milestone:"Milestone" })
                    .map(([k, v]) => (
                      <div key={k} className="flex items-center gap-1.5">
                        <div className={cn("w-1.5 h-1.5 rounded-full", CAT_DOT[k])} />
                        <span className="text-[10px] font-mono text-muted-foreground">{v}</span>
                      </div>
                    ))}
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                    {history.length} events shown
                  </span>
                </div>

                {/* Table */}
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["","Event","Category","Valence","Time","Day","Hour","Ignored Streak"].map((h) => (
                        <th key={h} className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider text-left px-2 py-2">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i} className="border-b border-border/40">
                            {Array.from({ length: 8 }).map((_, j) => (
                              <td key={j} className="px-2 py-2"><Skeleton className="h-3 w-full" /></td>
                            ))}
                          </tr>
                        ))
                      : history.map((ev: HistoryEvent, i: number) => (
                          <EventRow key={`${ev.event_id}-${i}`} event={ev} />
                        ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ── Simulator tab ── */}
          <TabsContent value="simulator" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="p-5">
                <div className="mb-4">
                  <h3 className="text-xs font-mono text-foreground mb-1">Live Event Stream Simulator</h3>
                  <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                    Replays the last N events from this doctor&apos;s history one at a time through the model.
                    Watch conversion probability and send windows update with each event.
                  </p>
                </div>
                {docId && <SimulatorPanel docId={docId} />}
              </div>
            </ScrollArea>
          </TabsContent>

        {/* ── Profile tab ── */}
        <TabsContent value="profile" className="flex-1 overflow-hidden m-0">
        <ScrollArea className="h-full">
            <div className="p-6 space-y-8">
            {loading ? (
                <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                ))}
                </div>
            ) : profile ? (
                <>
                {/* ── Identity block ── */}
                <div className="flex items-start gap-6">
                    {/* Avatar monogram */}
                    <div className="w-14 h-14 rounded-md bg-muted border border-border flex items-center justify-center shrink-0">
                    <span className="text-lg font-mono text-muted-foreground">
                        {p!.doc_id.replace("doc_", "").slice(0, 2)}
                    </span>
                    </div>
                    <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-mono text-foreground">{p!.doc_id}</h3>
                        <ArchetypeBadge archetype={p!.archetype as Archetype} />
                        {cs!.converted && (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded ring-1 ring-emerald-400/20">
                            ✓ Converted
                        </span>
                        )}
                        {cs!.churned && (
                        <span className="text-[10px] font-mono text-destructive bg-destructive/10 px-2 py-0.5 rounded ring-1 ring-destructive/20">
                            ✗ Churned
                        </span>
                        )}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground">
                        {p!.job_title} · {p!.specialty} · {p!.practice_type}
                    </p>
                    <p className="text-[11px] font-mono text-muted-foreground/60">
                        Observed for {profile.journey_summary.days_observed.toFixed(0)} days
                        {profile.journey_summary.signup_date
                        ? ` · Signed up ${profile.journey_summary.signup_date}`
                        : ""}
                    </p>
                    </div>
                </div>

                {/* ── Journey stats — horizontal strip ── */}
                <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3">
                    Journey Overview
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                    {[
                        { label: "Total Events",     value: cs!.total_events.toLocaleString(),           sub: "interactions logged"    },
                        { label: "Active Days",      value: cs!.active_days,                             sub: "days with activity"     },
                        { label: "Transcriptions",   value: cs!.transcriptions_completed,                sub: "completed"              },
                        { label: "Features Found",   value: cs!.features_discovered,                     sub: "discovered"             },
                        { label: "Errors",           value: cs!.cumulative_errors,                       sub: "friction events"        },
                        { label: "Days Inactive",    value: cs!.days_since_last_activity.toFixed(1),     sub: "since last activity"    },
                    ].map(({ label, value, sub }) => (
                        <div
                        key={label}
                        className="bg-muted/30 border border-border rounded-md px-4 py-3 space-y-0.5"
                        >
                        <div className="text-[10px] font-mono text-muted-foreground">{label}</div>
                        <div className="text-xl font-mono text-foreground leading-none">{value}</div>
                        <div className="text-[10px] font-mono text-muted-foreground/50">{sub}</div>
                        </div>
                    ))}
                    </div>
                </div>

                {/* ── Onboarding stage progress ── */}
                <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3">
                    Onboarding Stage
                    </p>
                    <div className="flex items-center gap-0">
                    {[
                        { stage: 0, label: "Signed Up"    },
                        { stage: 1, label: "Activated"    },
                        { stage: 2, label: "Value Moment" },
                        { stage: 3, label: "Habit Formed" },
                    ].map(({ stage, label }, i) => {
                        const done    = cs!.onboarding_stage > stage;
                        const current = cs!.onboarding_stage === stage;
                        return (
                        <div key={stage} className="flex items-center flex-1">
                            <div className="flex flex-col items-center flex-1">
                            <div
                                className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-mono transition-all",
                                done    ? "bg-primary border-primary text-primary-foreground"  :
                                current ? "bg-background border-primary text-primary"          :
                                            "bg-background border-border text-muted-foreground"
                                )}
                            >
                                {done ? "✓" : stage + 1}
                            </div>
                            <span className={cn(
                                "text-[10px] font-mono mt-1.5 text-center",
                                current ? "text-primary" : done ? "text-muted-foreground" : "text-muted-foreground/40"
                            )}>
                                {label}
                            </span>
                            </div>
                            {i < 3 && (
                            <div className={cn(
                                "h-px flex-1 mb-4 transition-all",
                                done ? "bg-primary" : "bg-border"
                            )} />
                            )}
                        </div>
                        );
                    })}
                    </div>
                </div>

                {/* ── Signal health + radar-style bars + trait fingerprint ── */}
                <div className="flex flex-col sm:flex-row gap-16">
                    <div className="flex-1 min-w-0 grid grid-cols-2 gap-16">
                    <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">
                        Engagement Signals
                    </p>
                    <div className="space-y-2.5">
                        {[
                        {
                            label: "Engagement Energy",
                            value: cs!.engagement_energy,
                            display: `${(cs!.engagement_energy * 100).toFixed(0)}%`,
                            danger:  cs!.engagement_energy < 0.3,
                            warning: cs!.engagement_energy < 0.6,
                            desc: cs!.engagement_energy < 0.3 ? "Critical — at churn risk"
                                : cs!.engagement_energy < 0.6 ? "Below average"
                                : "Healthy engagement",
                        },
                        {
                            label: "Trust Score",
                            value: cs!.trust_score,
                            display: `${(cs!.trust_score * 100).toFixed(0)}%`,
                            warning: cs!.trust_score < 0.4,
                            desc: `${cs!.transcriptions_completed} transcriptions completed`,
                        },
                        {
                            label: "Email Fatigue",
                            value: Math.min(1, cs!.emails_ignored_streak / 5),
                            display: `${cs!.emails_ignored_streak} ignored`,
                            danger:  cs!.emails_ignored_streak >= 3,
                            warning: cs!.emails_ignored_streak >= 1,
                            desc: cs!.emails_ignored_streak >= 3
                            ? "Switch to in-app channel"
                            : cs!.emails_ignored_streak >= 1
                            ? "Monitor closely"
                            : "No fatigue detected",
                        },
                        ].map(({ label, value, display, danger, warning, desc }) => (
                        <div key={label} className="space-y-1">
                            <div className="flex justify-between items-baseline">
                            <span className="text-[11px] font-mono text-foreground">{label}</span>
                            <span className={cn(
                                "text-[11px] font-mono tabular-nums",
                                danger ? "text-destructive" : warning ? "text-amber-400" : "text-emerald-400"
                            )}>
                                {display}
                            </span>
                            </div>
                            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                            <div
                                className={cn(
                                "h-full rounded-full transition-all duration-700",
                                danger  ? "bg-destructive" :
                                warning ? "bg-amber-500"   : "bg-emerald-500"
                                )}
                                style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
                            />
                            </div>
                            <p className="text-[9px] font-mono text-muted-foreground/60 leading-tight">{desc}</p>
                        </div>
                        ))}
                    </div>
                    </div>

                    <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">
                        Archetype Traits
                    </p>
                    <div className="space-y-2.5">
                        {[
                        {
                            label: "Base Engagement",
                            value: p!.base_engagement,
                            desc:  p!.base_engagement > 0.6 ? "Naturally active user" : "Needs more nudging",
                        },
                        {
                            label: "Skepticism",
                            value: p!.skepticism ?? 0.5,
                            warning: (p!.skepticism ?? 0) > 0.6,
                            desc: (p!.skepticism ?? 0) > 0.6
                            ? "Resistant to AI suggestions"
                            : "Open to AI assistance",
                        },
                        {
                            label: "Error Tolerance",
                            value: p!.error_tolerance ?? 0.5,
                            desc: (p!.error_tolerance ?? 0) < 0.3
                            ? "Very low — single error may churn"
                            : "Moderate resilience",
                        },
                        {
                            label: "Fatigue Sensitivity",
                            value: p!.fatigue_sensitivity ?? 0.5,
                            danger:  (p!.fatigue_sensitivity ?? 0) > 0.7,
                            warning: (p!.fatigue_sensitivity ?? 0) > 0.5,
                            desc: (p!.fatigue_sensitivity ?? 0) > 0.7
                            ? "High — space out interventions"
                            : "Average sensitivity",
                        },
                        ].map(({ label, value, danger, warning, desc }) => (
                        <div key={label} className="space-y-1">
                            <div className="flex justify-between items-baseline">
                            <span className="text-[11px] font-mono text-foreground">{label}</span>
                            <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                                {(value * 100).toFixed(0)}%
                            </span>
                            </div>
                            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                            <div
                                className={cn(
                                "h-full rounded-full transition-all duration-700",
                                danger  ? "bg-destructive" :
                                warning ? "bg-amber-500"   : "bg-primary/70"
                                )}
                                style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
                            />
                            </div>
                            <p className="text-[9px] font-mono text-muted-foreground/60 leading-tight">{desc}</p>
                        </div>
                        ))}
                    </div>
                    </div>
                    </div>
                    <div className="w-[300px] shrink-0">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3">
                    Trait Fingerprint
                    </p>
                    <ProfileRadar profile={p!} state={cs!} />
                    </div>
                </div>
                </>
            ) : null}
            </div>
        </ScrollArea>
        </TabsContent>

        </Tabs>
      </DialogContent>
    </Dialog>
  );
}


function ProfileRadar({
    profile,
    state,
  }: {
    profile: any;
    state: any;
  }) {
    const data = [
      { trait: "Engagement",   value: Math.round((profile.base_engagement ?? 0.5) * 100)    },
      { trait: "Trust",        value: Math.round((state.trust_score ?? 0) * 100)             },
      { trait: "Tolerance",    value: Math.round((profile.error_tolerance ?? 0.5) * 100)     },
      { trait: "Openness",     value: Math.round((1 - (profile.skepticism ?? 0.5)) * 100)    },
      { trait: "Resilience",   value: Math.round((1 - (profile.fatigue_sensitivity ?? 0.5)) * 100) },
      { trait: "Activity",     value: Math.min(100, Math.round((state.active_days / 30) * 100))    },
    ];
  
    return (
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid
            stroke="var(--border)"
            strokeOpacity={0.6}
          />
          <PolarAngleAxis
            dataKey="trait"
            tick={{
              fontSize: 11,
              fontFamily: "var(--font-geist-mono)",
              fill: "var(--muted-foreground)",
            }}
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 100]}
            tick={{
              fontSize: 9,
              fontFamily: "var(--font-geist-mono)",
              fill: "var(--muted-foreground)",
            }}
            tickCount={4}
            axisLine={false}
          />
          <Radar
            dataKey="value"
            stroke="var(--primary)"
            fill="var(--primary)"
            fillOpacity={0.12}
            strokeWidth={1.5}
            dot={{ r: 3, fill: "var(--primary)", strokeWidth: 0 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    );
  }

function EventRow({ event }: { event: HistoryEvent }) {
  const dot  = CAT_DOT[event.event_category] ?? "bg-zinc-500";
  const isMilestone = event.event_category === "E_milestone";
  const ts   = new Date(event.timestamp);

  return (
    <tr className={cn(
      "border-b border-border/30 transition-colors",
      isMilestone ? "bg-violet-500/5" : "hover:bg-muted/20"
    )}>
      <td className="px-2 py-2">
        <div className={cn("w-1.5 h-1.5 rounded-full", dot)} />
      </td>
      <td className="px-2 py-2">
        <span className={cn("text-xs font-mono", isMilestone ? "text-violet-300" : "text-foreground")}>
          {event.event_type.replace(/_/g, " ")}
        </span>
      </td>
      <td className="px-2 py-2">
        <span className="text-[10px] font-mono text-muted-foreground">{event.event_category}</span>
      </td>
      <td className="px-2 py-2">
        <span className={cn("text-xs font-mono",
          event.event_valence > 0 ? "text-emerald-400" :
          event.event_valence < 0 ? "text-destructive" : "text-muted-foreground"
        )}>
          {event.event_valence > 0 ? "+" : ""}{event.event_valence.toFixed(1)}
        </span>
      </td>
      <td className="px-2 py-2">
        <span className="text-[10px] font-mono text-muted-foreground">
          {ts.toLocaleDateString("en-AU", { month: "short", day: "numeric" })}
        </span>
      </td>
      <td className="px-2 py-2">
        <span className="text-[10px] font-mono text-muted-foreground">
          Day {event.time_since_signup_days.toFixed(0)}
        </span>
      </td>
      <td className="px-2 py-2">
        <span className="text-[10px] font-mono text-muted-foreground">{event.hour_of_day}:00</span>
      </td>
      <td className="px-2 py-2">
        {event.emails_ignored_streak > 0 && (
          <span className="text-[10px] font-mono text-destructive">
            {event.emails_ignored_streak}
          </span>
        )}
      </td>
    </tr>
  );
}