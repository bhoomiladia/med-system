"use client";

import { useState } from "react";

export interface LLMCallItem {
  id: string;
  provider: string;
  model: string;
  label: string;
  shot: number;
  status: "running" | "completed" | "failed";
  medicineName?: string;
  message?: string;
  timestamp: number;
}

interface Props {
  calls: LLMCallItem[];
  totalExpected?: number;
}

export default function LLMCallTracker({ calls, totalExpected = 20 }: Props) {
  const [filter, setFilter] = useState<string>("all");

  const completedCount = calls.filter((c) => c.status === "completed").length;
  const runningCount = calls.filter((c) => c.status === "running").length;
  const failedCount = calls.filter((c) => c.status === "failed").length;

  const providers = Array.from(new Set(calls.map((c) => c.provider)));

  const filteredCalls = filter === "all" ? calls : calls.filter((c) => c.provider === filter);

  // Group by model for summary matrix
  const modelStats: Record<string, { label: string; provider: string; total: number; completed: number; running: number }> = {};
  for (const c of calls) {
    const key = `${c.provider}:${c.model}`;
    if (!modelStats[key]) {
      modelStats[key] = { label: c.label || c.model, provider: c.provider, total: 0, completed: 0, running: 0 };
    }
    modelStats[key].total += 1;
    if (c.status === "completed") modelStats[key].completed += 1;
    if (c.status === "running") modelStats[key].running += 1;
  }

  const progressPercent = Math.min(100, Math.round((completedCount / Math.max(1, totalExpected)) * 100));

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
      {/* Header & Overall Counter */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 border border-blue-200">
            <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              Price Intelligence Queries
            </h4>
            <p className="text-[11px] text-slate-500">
              Querying multiple models in parallel with temperature variations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className="text-xs font-mono font-bold text-blue-700">
              {completedCount}
            </span>
            <span className="text-xs font-mono text-slate-400"> / {totalExpected} calls</span>
          </div>
          {runningCount > 0 && (
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 font-mono">
          <span>Inference Progress</span>
          <span>{progressPercent}% Completed</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Model Matrix Badges */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(modelStats).map(([key, stat]) => (
          <div
            key={key}
            className={`rounded-lg p-2 border transition-all ${
              stat.running > 0
                ? "bg-blue-50 border-blue-200"
                : stat.completed > 0
                ? "bg-emerald-50 border-emerald-200"
                : "bg-slate-50 border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-slate-700 truncate" title={stat.label}>
                {stat.label.replace("LM Studio ", "").replace("Groq ", "")}
              </span>
              {stat.running > 0 ? (
                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              ) : (
                <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span className="capitalize">{stat.provider}</span>
              <span className="font-bold text-slate-700">
                {stat.completed}/{stat.total}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Live Stream Call Log */}
      <div className="mt-3 max-h-40 overflow-y-auto space-y-1 pr-1">
        {calls.slice(-8).reverse().map((c) => (
          <div
            key={c.id}
            className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] border transition-all ${
              c.status === "running"
                ? "bg-blue-50 border-blue-200 text-blue-800"
                : c.status === "completed"
                ? "bg-slate-50 border-slate-200 text-slate-600"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {c.status === "running" ? (
                <div className="h-2.5 w-2.5 animate-spin rounded-full border border-blue-500 border-t-transparent flex-shrink-0" />
              ) : c.status === "completed" ? (
                <svg className="w-3 h-3 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              ) : (
                <svg className="w-3 h-3 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              )}
              <span className="font-semibold text-slate-700 truncate max-w-[130px]">{c.label}</span>
              <span className="text-slate-400 text-[10px]">shot #{c.shot}</span>
              {c.medicineName && (
                <span className="text-blue-500 truncate text-[10px]">({c.medicineName})</span>
              )}
            </div>

            <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">
              {c.status === "running" ? "generating..." : c.status === "completed" ? "done" : "failed"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
