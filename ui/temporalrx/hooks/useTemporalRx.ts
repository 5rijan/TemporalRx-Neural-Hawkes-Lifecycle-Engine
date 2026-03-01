"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { DoctorSummary, DoctorProfile, HistoryEvent, Prediction, SimulateStep } from "@/types";

export function useDoctors() {
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.doctors(200)
      .then((d) => setDoctors(d.doctors))
      .finally(() => setLoading(false));
  }, []);

  return { doctors, loading };
}

export function useDoctorModal(docId: string | null) {
  const [profile, setProfile]   = useState<DoctorProfile | null>(null);
  const [history, setHistory]   = useState<HistoryEvent[]>([]);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading]   = useState(false);
  const [predLoading, setPredLoading] = useState(false);

  useEffect(() => {
    if (!docId) return;
    setLoading(true);
    setProfile(null);
    setHistory([]);
    setPrediction(null);

    Promise.all([api.profile(docId), api.history(docId, 40)])
      .then(([prof, hist]) => {
        setProfile(prof);
        setHistory(hist.events ?? []);
      })
      .finally(() => setLoading(false));
  }, [docId]);

  const runPrediction = useCallback(async () => {
    if (!docId) return;
    setPredLoading(true);
    try {
      const pred = await api.predict(docId);
      setPrediction(pred);
    } finally {
      setPredLoading(false);
    }
  }, [docId]);

  const pushEvent = useCallback(async (eventType: string, hoursDelta = 1) => {
    if (!docId) return;
    setPredLoading(true);
    try {
      const pred = await api.pushEvent(docId, {
        event_type: eventType,
        time_since_last_event_hours: hoursDelta,
        hour_of_day: new Date().getHours(),
        day_of_week: new Date().getDay(),
      });
      setPrediction(pred);
      // Refresh history
      const hist = await api.history(docId, 40);
      setHistory(hist.events ?? []);
    } finally {
      setPredLoading(false);
    }
  }, [docId]);

  return { profile, history, prediction, loading, predLoading, runPrediction, pushEvent, setPrediction };
}

export function useSimulate(docId: string | null) {
  const [steps, setSteps]       = useState<SimulateStep[]>([]);
  const [current, setCurrent]   = useState(0);
  const [running, setRunning]   = useState(false);
  const [playing, setPlaying]   = useState(false);

  const run = useCallback(async (n = 6) => {
    if (!docId) return;
    setRunning(true);
    setSteps([]);
    setCurrent(0);
    try {
      const data = await api.simulate(docId, n);
      setSteps(data.stream ?? []);
    } finally {
      setRunning(false);
    }
  }, [docId]);

  // Auto-play through steps
  useEffect(() => {
    if (!playing || steps.length === 0) return;
    if (current >= steps.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setCurrent((c) => c + 1), 1800);
    return () => clearTimeout(t);
  }, [playing, current, steps.length]);

  const play  = () => { setCurrent(0); setPlaying(true); };
  const pause = () => setPlaying(false);
  const next  = () => setCurrent((c) => Math.min(c + 1, steps.length - 1));
  const prev  = () => setCurrent((c) => Math.max(c - 1, 0));
  const reset = () => { setCurrent(0); setPlaying(false); setSteps([]); };

  return { steps, current, running, playing, run, play, pause, next, prev, reset };
}