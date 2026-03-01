"use client";

import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ReferenceDot,
} from "recharts";
import type { Prediction } from "@/types";

interface Props {
  prediction: Prediction;
  previousIntensities?: number[];
}

export function IntensityCurve({ prediction, previousIntensities }: Props) {
  const { time_points, intensities } = prediction.curve;

  const data = time_points.map((t, i) => ({
    t: parseFloat(t.toFixed(1)),
    current: parseFloat(intensities[i].toFixed(4)),
    previous: previousIntensities ? parseFloat((previousIntensities[i] ?? 0).toFixed(4)) : undefined,
  }));

  const primaryT  = prediction.primary_window.hours_from_now;
  const secondaryT = prediction.secondary_window.hours_from_now;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-md px-3 py-2 text-xs font-mono shadow-lg">
        <div className="text-muted-foreground mb-1">t + {label}h</div>
        <div className="text-foreground">λ = {payload[0]?.value?.toFixed(4)}</div>
        {payload[1] && <div className="text-muted-foreground">prev = {payload[1]?.value?.toFixed(4)}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">
          Engagement Intensity λ(t) — Next 48h
        </p>
        <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-0.5 bg-primary inline-block" /> current
          </span>
          {previousIntensities && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-0.5 bg-muted-foreground inline-block" /> previous
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-0.5 bg-emerald-500 inline-block" /> primary window
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-0.5 bg-amber-500 inline-block" /> secondary
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--primary)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />

          <XAxis
            dataKey="t"
            tick={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(v) => `${v}h`}
            interval={11}
            />
            <YAxis
            tick={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => v.toFixed(2)}
            />
          <Tooltip content={<CustomTooltip />} />

          {/* Night shading — 10pm to 6am */}
          {[0, 24].map((offset) => (
            <ReferenceArea
              key={offset}
              x1={offset + 22} x2={offset + 30}
              fill="var(--muted)" fillOpacity={0.3}
            />
          ))}

          {/* Primary window */}
          <ReferenceLine
            x={primaryT}
            stroke="hsl(142 71% 45%)"
            strokeDasharray="4 2"
            strokeWidth={1.5}
          />
          <ReferenceDot
            x={primaryT}
            y={prediction.primary_window.intensity}
            r={4}
            fill="hsl(142 71% 45%)"
            stroke="var(--background)"
            strokeWidth={1.5}
          />

          {/* Secondary window */}
          <ReferenceLine
            x={secondaryT}
            stroke="hsl(45 93% 58%)"
            strokeDasharray="4 2"
            strokeWidth={1}
          />

          {/* Previous curve (ghost) */}
          {previousIntensities && (
            <Area
              type="monotone"
              dataKey="previous"
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              strokeOpacity={0.4}
              fill="none"
              dot={false}
              activeDot={false}
            />
          )}

          {/* Current curve */}
          <Area
            type="monotone"
            dataKey="current"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#curveGrad)"
            dot={false}
            activeDot={{ r: 3, fill: "var(--primary)" }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Window labels */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-md px-3 py-2">
          <div className="text-[10px] font-mono text-emerald-400/70 mb-0.5">Primary Window</div>
          <div className="text-sm font-mono text-emerald-400">{prediction.primary_window.send_at}</div>
          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
            in {prediction.primary_window.hours_from_now}h · confidence {Math.round(prediction.primary_window.confidence * 100)}%
          </div>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-md px-3 py-2">
          <div className="text-[10px] font-mono text-amber-400/70 mb-0.5">Secondary Window</div>
          <div className="text-sm font-mono text-amber-400">{prediction.secondary_window.send_at}</div>
          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
            in {prediction.secondary_window.hours_from_now}h · confidence {Math.round(prediction.secondary_window.confidence * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}

// Recharts doesn't export ReferenceArea from the same place
import { ReferenceArea } from "recharts";