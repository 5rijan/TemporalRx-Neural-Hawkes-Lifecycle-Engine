"use client";

import { useState } from "react";
import { DoctorsTable } from "@/components/doctors/DoctorsTable";
import { DoctorModal } from "@/components/doctors/DoctorModal";
import { useDoctors } from "@/hooks/useTemporalRx";

export default function Home() {
  const { doctors, loading } = useDoctors();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">

      {/* Top nav */}
      <header className="h-12 border-b border-border flex items-center px-6 shrink-0 justify-between">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-mono text-foreground tracking-tight">TemporalRx</span>
          <span className="text-[11px] font-mono text-muted-foreground">
            Neural Hawkes Lifecycle Engine
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground">
          <span>{doctors.length} doctors loaded</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-emerald-400">API connected</span>
        </div>
      </header>

      {/* Main table */}
      <main className="flex-1 overflow-hidden">
        <DoctorsTable
          doctors={doctors}
          loading={loading}
          onSelect={setSelectedId}
        />
      </main>

      {/* Modal */}
      <DoctorModal
        docId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
