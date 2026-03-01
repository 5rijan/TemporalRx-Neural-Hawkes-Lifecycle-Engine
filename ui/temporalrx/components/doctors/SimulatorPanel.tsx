"use client";

import { useState } from "react";
import { Play, Pause, SkipForward, SkipBack, RefreshCw } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import { useSimulate } from "@/hooks/useTemporalRx";
import type { SimulateStep } from "@/types";

const ALL_EVENTS = [
  "app_opened","transcription_completed","ai_note_accepted","feature_discovered",
  "transcription_error","app_crashed","help_page_opened",
  "colleague_invited","email_opened","email_ignored","in_app_nudge_clicked",
  "value_moment_reached","habit_formed",
];

const CAT_COLOR: Record<string, string> = {
  A_positive: "hsl(142 71% 45%)",
  B_friction: "hsl(0 84% 60%)",
  C_social:   "hsl(45 93% 47%)",
  D_lifecycle:"hsl(221 83% 53%)",
  E_milestone:"hsl(271 76% 53%)",
};

interface Props { docId: string }

export function SimulatorPanel({ docId }: Props) {
  const { steps, current, running, playing, run, play, pause, next, prev, reset } = useSimulate(docId);
  const [nEvents, setNEvents] = useState(6);
  const [addEvent, setAddEvent] = useState("app_opened");

  const step: SimulateStep | undefined = steps[current];

  // Conversion trend across steps
  const convTrend = steps.map((s, i) => ({
    step: i + 1,
    event: s.triggering_event?.replace(/_/g, " ") ?? "",
    conv: parseFloat((s.conversion.percentage).toFixed(1)),
    conf: parseFloat((s.primary_window.confidence * 100).toFixed(1)),
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-md px-3 py-2 text-xs font-mono shadow-lg">
        <div className="text-muted-foreground mb-1">{payload[0]?.payload?.event}</div>
        <div className="text-foreground">Conv: {payload[0]?.value}%</div>
        {payload[1] && <div className="text-amber-400">Conf: {payload[1]?.value}%</div>}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-muted-foreground">Events:</span>
          {[4, 6, 8, 10].map((n) => (
            <button key={n} onClick={() => setNEvents(n)}
              className={cn("w-7 h-7 rounded font-mono text-xs transition-all",
                nEvents === n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}>
              {n}
            </button>
          ))}
        </div>

        <button
          onClick={() => run(nEvents)}
          disabled={running}
          className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-mono hover:bg-primary/90 transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3 h-3", running && "animate-spin")} />
          {running ? "Running..." : "Run Simulation"}
        </button>

        {steps.length > 0 && (
          <>
            <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
              <button onClick={prev} disabled={current === 0}
                className="p-1.5 hover:bg-muted rounded transition-colors disabled:opacity-30">
                <SkipBack className="w-3 h-3" />
              </button>
              <button onClick={playing ? pause : play}
                className="px-2 py-1.5 hover:bg-muted rounded transition-colors flex items-center gap-1 text-xs font-mono">
                {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {playing ? "Pause" : "Play"}
              </button>
              <button onClick={next} disabled={current >= steps.length - 1}
                className="p-1.5 hover:bg-muted rounded transition-colors disabled:opacity-30">
                <SkipForward className="w-3 h-3" />
              </button>
            </div>

            <div className="flex gap-1 ml-auto">
              {steps.map((_, i) => (
                <button key={i} onClick={() => { pause(); setTimeout(() => {}, 0); }}
                  className={cn("w-5 h-1.5 rounded-full transition-all",
                    i <= current ? "bg-primary" : "bg-border"
                  )} />
              ))}
            </div>
          </>
        )}
      </div>

      {steps.length === 0 && !running && (
        <div className="flex items-center justify-center h-32 border border-dashed border-border rounded-md">
          <div className="text-center">
            <p className="text-xs font-mono text-muted-foreground">No simulation data</p>
            <p className="text-[11px] font-mono text-muted-foreground/50 mt-0.5">Click &quot;Run Simulation&quot; to start</p>
          </div>
        </div>
      )}

      {steps.length > 0 && step && (
        <>
          {/* Current step highlight */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/40 border border-border rounded-md px-3 py-2.5">
              <div className="text-[10px] font-mono text-muted-foreground mb-1">Event {current + 1}/{steps.length}</div>
              <div className="text-sm font-mono text-foreground">{step.triggering_event?.replace(/_/g, " ")}</div>
            </div>
            <div className="bg-muted/40 border border-border rounded-md px-3 py-2.5">
              <div className="text-[10px] font-mono text-muted-foreground mb-1">Conversion</div>
              <div className={cn("text-2xl font-mono",
                step.conversion.percentage > 50 ? "text-emerald-400" :
                step.conversion.percentage > 20 ? "text-amber-400" : "text-destructive"
              )}>
                {step.conversion.percentage.toFixed(1)}%
              </div>
            </div>
            <div className="bg-muted/40 border border-border rounded-md px-3 py-2.5">
              <div className="text-[10px] font-mono text-muted-foreground mb-1">Primary Send</div>
              <div className="text-xs font-mono text-foreground">{step.primary_window.send_at}</div>
              <div className="text-[10px] font-mono text-muted-foreground">
                {Math.round(step.primary_window.confidence * 100)}% confidence
              </div>
            </div>
          </div>

          {/* Conversion trend chart */}
          <div>
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest mb-3">
              Conversion Probability Over Stream
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={convTrend} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis
                    dataKey="step"
                    tick={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    tickFormatter={(v) => `#${v}`}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                  />                <Tooltip content={<CustomTooltip />} />
                {/* Highlight current step */}
                <ReferenceLine x={current + 1} stroke="var(--primary)" strokeDasharray="3 2" strokeWidth={1} />
                <Line type="monotone" dataKey="conv" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3, fill: "var(--primary)" }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="conf" stroke="hsl(45 93% 47%)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2 text-[10px] font-mono text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-primary inline-block" /> conversion prob</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-500 inline-block" /> window confidence</span>
            </div>
          </div>

          {/* Step-by-step feed */}
          <div>
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Event Feed</p>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {steps.map((s, i) => (
                <div key={i}
                  onClick={() => { pause(); }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-all border",
                    i === current
                      ? "bg-primary/10 border-primary/30"
                      : i < current
                      ? "border-border/40 opacity-60"
                      : "border-transparent opacity-40"
                  )}
                >
                  <span className="text-[10px] font-mono text-muted-foreground w-4">#{i + 1}</span>
                  <span className="text-xs font-mono text-foreground flex-1">
                    {s.triggering_event?.replace(/_/g, " ")}
                  </span>
                  <span className={cn("text-xs font-mono",
                    s.conversion.percentage > 50 ? "text-emerald-400" :
                    s.conversion.percentage > 20 ? "text-amber-400" : "text-destructive"
                  )}>
                    {s.conversion.percentage.toFixed(1)}%
                  </span>
                  {s.recommendation_changed && (
                    <span className="text-[9px] font-mono text-primary bg-primary/10 px-1 rounded">updated</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Email recommendation for current step */}
          <div className="bg-muted/30 border border-border rounded-md px-4 py-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                  Recommended Intervention
                </span>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs font-mono text-foreground capitalize bg-primary/10 px-2 py-0.5 rounded ring-1 ring-primary/20">
                    {step.intervention.email_category}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">via {step.intervention.channel.replace("_", " ")}</span>
                </div>
              </div>
              {step.intervention.trigger_now && (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 ring-1 ring-emerald-400/20 px-2 py-1 rounded animate-pulse">
                  ⚡ Trigger Now
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-2 leading-relaxed">
              &ldquo;{step.intervention.message}&rdquo;
            </p>
          </div>
        </>
      )}
    </div>
  );
}

import { ReferenceLine } from "recharts";