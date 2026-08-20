"use client";

import { useEffect, useState, useRef } from "react";
import { subscribeToPipeline, getPipelineStatus } from "@/lib/api";
import type { PipelineEvent } from "@/lib/types";
import LLMCallTracker, { type LLMCallItem } from "./LLMCallTracker";
import StatisticalClusteringView, { type ClusteringData } from "./StatisticalClusteringView";

interface Stage {
  id: string;
  label: string;
  phase?: string;
  status: "pending" | "running" | "completed" | "failed";
  message?: string;
  details?: Record<string, unknown>;
  medicines?: { id: string; name: string; status: string; message?: string }[];
  startedAt?: number;
  completedAt?: number;
}

interface Props {
  runId: string;
  prescriptionId: string;
  onComplete: () => void;
}

const STAGE_CONFIG = [
  { id: "ocr",         label: "Extracting text from prescription",   phase: "" },
  { id: "refine",      label: "Refining & cleaning text",            phase: "" },
  { id: "parse",       label: "Identifying medicines",               phase: "" },
  { id: "db_lookup",   label: "Checking price database",             phase: "Phase 1" },
  { id: "composition", label: "Discovering composition",             phase: "Phase 2-3" },
  { id: "discovery",   label: "Multi-shot price discovery",          phase: "Phase 3" },
  { id: "consensus",   label: "Statistical consensus & validation",  phase: "Phase 4" },
  { id: "savings",     label: "Savings calculation & DB writeback",  phase: "Phase 5" },
];

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(0);
  return `${mins}m ${secs}s`;
}

export default function ProcessingPipeline({
  runId,
  prescriptionId,
  onComplete,
}: Props) {
  const [stages, setStages] = useState<Stage[]>(
    STAGE_CONFIG.map((s) => ({
      ...s,
      status: "pending",
      medicines: [],
    }))
  );
  const [llmCalls, setLlmCalls] = useState<LLMCallItem[]>([]);
  const [clusteringData, setClusteringData] = useState<ClusteringData | null>(null);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pipelineStartTime] = useState<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Tick every 100ms for timer updates
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 100);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    try {
      const es = subscribeToPipeline(
        runId,
        (event: PipelineEvent) => handleEvent(event),
        () => {
          startPolling();
        },
        () => {
          setCompleted(true);
          setTimeout(onComplete, 2500);
        }
      );
      eventSourceRef.current = es;
    } catch {
      startPolling();
    }

    return () => {
      eventSourceRef.current?.close();
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const startPolling = () => {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(async () => {
      try {
        const status = await getPipelineStatus(runId);
        if (status.status === "completed") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setCompleted(true);
          setTimeout(onComplete, 2500);
        } else if (status.status === "failed") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setError(status.error || "Pipeline failed");
        }
        setStages((prev) =>
          prev.map((s) => {
            const stageIdx = STAGE_CONFIG.findIndex(
              (sc) => sc.id === status.current_stage
            );
            const thisIdx = STAGE_CONFIG.findIndex((sc) => sc.id === s.id);
            if (thisIdx < stageIdx)
              return { ...s, status: "completed" as const };
            if (thisIdx === stageIdx)
              return { ...s, status: "running" as const, startedAt: s.startedAt || Date.now() };
            return s;
          })
        );
      } catch {
        // Ignore polling errors
      }
    }, 3000);
  };

  const handleEvent = (event: PipelineEvent) => {
    if (event.event === "error") {
      setError(event.message);
      return;
    }

    if (event.event === "llm_call") {
      const callItem: LLMCallItem = {
        id: `${event.provider}-${event.model}-${event.shot}-${Date.now()}`,
        provider: (event as any).provider || "llm",
        model: (event as any).model || "model",
        label: (event as any).label || (event as any).model || "LLM Call",
        shot: (event as any).shot || 1,
        status: (event as any).status || "running",
        medicineName: event.medicine_name,
        message: event.message,
        timestamp: Date.now(),
      };

      setLlmCalls((prev) => {
        const existingIdx = prev.findIndex(
          (c) => c.provider === callItem.provider && c.model === callItem.model && c.shot === callItem.shot
        );
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = { ...updated[existingIdx], status: callItem.status, message: callItem.message };
          return updated;
        }
        return [...prev, callItem];
      });
      return;
    }

    if (event.event === "clustering_analysis") {
      setClusteringData({
        medicine_name: event.medicine_name,
        ...(event.details as any),
      });
    }

    if (event.event === "complete") {
      setStages((prev) =>
        prev.map((s) => ({
          ...s,
          status: "completed" as const,
          completedAt: s.completedAt || Date.now(),
        }))
      );
      setCompleted(true);
      setTimeout(onComplete, 2500);
      return;
    }

    setStages((prev) =>
      prev.map((s) => {
        if (event.event === "stage_start" && s.id === event.stage) {
          return { ...s, status: "running" as const, message: event.message, startedAt: Date.now() };
        }
        if (event.event === "stage_complete" && s.id === event.stage) {
          return {
            ...s,
            status: "completed" as const,
            message: event.message,
            details: event.details,
            completedAt: Date.now(),
          };
        }
        if (
          event.event === "medicine_progress" &&
          (s.id === event.stage ||
            s.id === "composition" ||
            s.id === "discovery" ||
            s.id === "consensus" ||
            s.id === "savings" ||
            s.id === "db_lookup")
        ) {
          // Only update if this stage matches the event stage
          if (s.id !== event.stage) return s;

          const medicines = [...(s.medicines || [])];
          const existing = medicines.findIndex(
            (m) => m.id === event.medicine_id
          );
          const med = {
            id: event.medicine_id || "",
            name: event.medicine_name || "",
            status: event.stage || "",
            message: event.message,
          };

          if (existing >= 0) {
            medicines[existing] = med;
          } else {
            medicines.push(med);
          }

          return {
            ...s,
            status: "running" as const,
            startedAt: s.startedAt || Date.now(),
            medicines,
          };
        }
        return s;
      })
    );
  };

  const completedStages = stages.filter((s) => s.status === "completed").length;
  const totalStages = stages.length;
  const progressPercent = Math.round((completedStages / totalStages) * 100);
  const totalElapsed = now - pipelineStartTime;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-slate-800">
          {completed ? "Analysis Complete" : "Analyzing Your Prescription"}
        </h2>
        <p className="mt-1 text-slate-500">
          {completed
            ? "Redirecting to results..."
            : "Processing through the intelligence pipeline"}
        </p>
      </div>

      {/* Total progress bar + timer */}
      <div className="mb-6 rounded-xl bg-white border border-slate-200 p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium text-slate-700">
            Overall Progress
          </span>
          <div className="flex items-center gap-3">
            <span className="text-slate-500">
              {completedStages}/{totalStages} steps
            </span>
            <span className="font-mono text-sm font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
              {formatElapsed(totalElapsed)}
            </span>
          </div>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              completed ? "bg-emerald-500" : "bg-teal-600 progress-stripe"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Stage cards */}
      <div className="space-y-2">
        {stages.map((stage, idx) => {
          const isRunning = stage.status === "running";
          const isCompleted = stage.status === "completed";
          const isFailed = stage.status === "failed";
          const isPending = stage.status === "pending";

          const stageElapsed = stage.startedAt
            ? (stage.completedAt || now) - stage.startedAt
            : 0;

          return (
            <div
              key={stage.id}
              className={`rounded-xl border transition-all duration-300 ${
                isRunning
                  ? "bg-white border-teal-300 shadow-sm ring-1 ring-teal-200"
                  : isCompleted
                  ? "bg-white border-slate-200"
                  : isFailed
                  ? "bg-red-50 border-red-200"
                  : "bg-slate-50/50 border-slate-100"
              }`}
            >
              {/* Stage header row */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Status icon */}
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 animate-step-complete">
                      <svg className="h-4 w-4 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ) : isRunning ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                    </div>
                  ) : isFailed ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                      <svg className="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                      <div className="h-2 w-2 rounded-full bg-slate-300" />
                    </div>
                  )}
                </div>

                {/* Label and info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={`font-medium text-sm ${
                        isCompleted
                          ? "text-emerald-700"
                          : isRunning
                          ? "text-teal-800"
                          : isPending
                          ? "text-slate-400"
                          : "text-red-600"
                      }`}
                    >
                      {stage.label}
                    </p>
                    {stage.phase && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                          isCompleted
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                            : isRunning
                            ? "bg-teal-50 text-teal-600 border border-teal-200"
                            : "bg-slate-100 text-slate-400 border border-slate-200"
                        }`}
                      >
                        {stage.phase}
                      </span>
                    )}
                  </div>

                  {/* Stage message */}
                  {Boolean(stage.message) && !isPending && (
                    <p className="mt-0.5 text-xs text-slate-500 leading-relaxed truncate">
                      {String(stage.message)}
                    </p>
                  )}
                </div>

                {/* Timer */}
                {(isRunning || isCompleted) && stage.startedAt && (
                  <div className="flex-shrink-0">
                    <span
                      className={`font-mono text-xs px-2 py-1 rounded-md ${
                        isRunning
                          ? "bg-teal-50 text-teal-700 border border-teal-200"
                          : "bg-slate-50 text-slate-500 border border-slate-200"
                      }`}
                    >
                      {isCompleted && stage.completedAt
                        ? `Done in ${formatElapsed(stage.completedAt - stage.startedAt)}`
                        : formatElapsed(stageElapsed)
                      }
                    </span>
                  </div>
                )}
              </div>

              {/* Expanded content for active/completed stages with extra detail */}
              {/* Refined text preview */}
              {stage.id === "refine" &&
                stage.status === "completed" &&
                stage.details?.refined_preview ? (
                  <div className="mx-4 mb-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <p className="text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider">Cleaned Text</p>
                    <p className="text-xs text-slate-600 font-mono whitespace-pre-wrap leading-relaxed">
                      {String(stage.details.refined_preview)}
                    </p>
                  </div>
                ) : null}

              {/* Parsed medicines list */}
              {stage.id === "parse" &&
                stage.status === "completed" &&
                stage.details?.medicines ? (
                  <div className="mx-4 mb-3 flex flex-wrap gap-1.5">
                    {(stage.details.medicines as Array<{ name: string; dosage?: string }>).map(
                      (med, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs text-indigo-700"
                        >
                          {med.name}
                          {med.dosage && (
                            <span className="text-indigo-400">{med.dosage}</span>
                          )}
                        </span>
                      )
                    )}
                  </div>
                ) : null}

              {/* DB lookup cache badges */}
              {stage.id === "db_lookup" &&
                stage.status === "completed" &&
                stage.details ? (
                  <div className="mx-4 mb-3 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs text-emerald-700">
                      {String(stage.details.hits ?? 0)} cache hits
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs text-amber-700">
                      {String(stage.details.misses ?? 0)} need discovery
                    </span>
                  </div>
                ) : null}

              {/* Real-time LLM Multi-Shot Tracker */}
              {stage.id === "discovery" && llmCalls.length > 0 && (
                <div className="mx-4 mb-3">
                  <LLMCallTracker calls={llmCalls} totalExpected={llmCalls.length > 20 ? llmCalls.length : 20} />
                </div>
              )}

              {/* Real-time Statistical Clustering & IQR Consensus Visualizer */}
              {stage.id === "consensus" && clusteringData && (
                <div className="mx-4 mb-3">
                  <StatisticalClusteringView data={clusteringData} />
                </div>
              )}

              {/* Consensus stats fallback list */}
              {stage.id === "consensus" && !clusteringData && stage.medicines && stage.medicines.length > 0 && (
                <div className="mx-4 mb-3 space-y-1">
                  {stage.medicines.map((med) => (
                    <div
                      key={med.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="text-slate-300">├─</span>
                      <span className="text-slate-600 truncate">{med.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Medicine sub-items for per-medicine stages */}
              {stage.medicines &&
                stage.medicines.length > 0 &&
                stage.id !== "consensus" &&
                stage.id !== "discovery" && (
                  <div className="mx-4 mb-3 space-y-1">
                    {stage.medicines.map((med) => (
                      <div
                        key={med.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="text-slate-300">├─</span>
                        {med.status === "complete" ? (
                          <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        ) : med.status === "error" ? (
                          <svg className="w-3 h-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        ) : (
                          <span className="animate-pulse text-teal-500">●</span>
                        )}
                        <span className="text-slate-600 truncate max-w-md">
                          {med.message || med.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-6 rounded-xl bg-red-50 border border-red-200 p-4 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
