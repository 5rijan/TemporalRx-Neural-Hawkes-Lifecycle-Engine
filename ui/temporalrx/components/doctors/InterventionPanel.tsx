"use client";

import { useState } from "react";
import { Send, Clock, RotateCcw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Prediction } from "@/types";

const EMAIL_CATS = ["activation","expansion","social","recovery","commitment"] as const;
const CHANNELS   = ["email","in_app_nudge"] as const;

interface Props {
  prediction: Prediction;
  onScheduleNow: () => void;
  onReschedule:  (window: "primary" | "secondary") => void;
}

export function InterventionPanel({ prediction, onScheduleNow, onReschedule }: Props) {
  const [selectedCat, setSelectedCat] = useState(prediction.intervention.email_category);
  const [selectedChannel, setSelectedChannel] = useState(prediction.intervention.channel);
  const [scheduledMsg, setScheduledMsg] = useState<string | null>(null);

  const handleSendNow = () => {
    setScheduledMsg(`✓ Sent via ${selectedChannel} at ${new Date().toLocaleTimeString()}`);
    onScheduleNow();
  };

  const handleReschedule = (w: "primary" | "secondary") => {
    const win = w === "primary" ? prediction.primary_window : prediction.secondary_window;
    setScheduledMsg(`✓ Scheduled for ${win.send_at} via ${selectedChannel}`);
    onReschedule(w);
  };

  const { intervention: iv, conversion } = prediction;

  return (
    <div className="space-y-4">
      {/* Conversion probability */}
      <div className="flex items-center justify-between bg-muted/40 rounded-md px-4 py-3 border border-border">
        <div>
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">
            Conversion Probability
          </div>
          <div className="text-2xl font-mono text-foreground">
            {conversion.percentage.toFixed(1)}%
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono text-muted-foreground mb-0.5">Model confidence</div>
          <div className="text-sm font-mono text-foreground">
            {Math.round(iv.email_confidence * 100)}%
          </div>
        </div>
      </div>

      {/* Trigger now alert */}
      {iv.trigger_now && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="text-xs font-mono text-emerald-400">
            Doctor is in optimal engagement window right now
          </span>
        </div>
      )}

      {/* Category selection */}
      <div>
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">
          Email Category
          <span className="ml-2 text-primary">← model recommended</span>
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {EMAIL_CATS.map((cat) => {
            const prob = iv.category_probs?.[cat] ?? 0;
            const isModel = cat === iv.email_category;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCat(cat)}
                className={cn(
                  "relative flex flex-col items-center px-2 py-2.5 rounded-md border text-center transition-all",
                  selectedCat === cat
                    ? "bg-primary/10 border-primary text-primary"
                    : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                )}
              >
                {isModel && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
                )}
                <span className="text-[10px] font-mono capitalize leading-tight">{cat}</span>
                <span className="text-[9px] font-mono mt-1 opacity-60">{Math.round(prob * 100)}%</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Message preview */}
      <div className="bg-muted/30 border border-border rounded-md px-3 py-2.5">
        <div className="text-[10px] font-mono text-muted-foreground mb-1">Message Preview</div>
        <p className="text-xs font-mono text-foreground leading-relaxed">
          &ldquo;{iv.message}&rdquo;
        </p>
      </div>

      {/* Channel */}
      <div>
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Channel</p>
        <div className="flex gap-2">
          {CHANNELS.map((ch) => (
            <button
              key={ch}
              onClick={() => setSelectedChannel(ch)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-mono border transition-all",
                selectedChannel === ch
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {ch.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSendNow}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-xs font-mono hover:bg-primary/90 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Send Now
        </button>
        <button
          onClick={() => handleReschedule("primary")}
          className="flex items-center gap-2 px-3 py-2 bg-muted border border-border text-foreground rounded-md text-xs font-mono hover:bg-muted/80 transition-colors"
        >
          <Clock className="w-3.5 h-3.5" />
          Primary Window
        </button>
        <button
          onClick={() => handleReschedule("secondary")}
          className="flex items-center gap-2 px-3 py-2 border border-border text-muted-foreground rounded-md text-xs font-mono hover:text-foreground hover:border-muted-foreground transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Secondary
        </button>
      </div>

      {/* Confirmation */}
      {scheduledMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
          <span className="text-xs font-mono text-emerald-400">{scheduledMsg}</span>
        </div>
      )}
    </div>
  );
}