"use client";

import React, { useEffect, useState } from "react";
import { formatINR, getPrescriptionAccuracy, evaluatePrescriptionAccuracy } from "@/lib/api";
import { generateAccuracyBenchmarkHtml } from "@/lib/exportHtml";

interface MethodMetric {
  value: number | null;
  absolute_error: number | null;
  accuracy_pct: number | null;
}

interface MedicineAccuracyEval {
  medicine_id: string;
  name: string;
  normalized_name: string | null;
  dosage: string | null;
  total_candidates: number;
  branded_candidate_count: number;
  generic_candidate_count: number;
  ground_truth: {
    branded_unit_price: number;
    generic_unit_price: number;
    branded_source: string;
    generic_source: string;
  };
  methods_branded: Record<string, MethodMetric>;
  methods_generic: Record<string, MethodMetric>;
  best_branded_method: string;
  best_generic_method: string;
}

interface LeaderboardItem {
  method_key: string;
  method_name: string;
  average_accuracy_pct: number;
  mae: number;
  rmse: number;
}

interface Props {
  prescriptionId: string;
}

const METHOD_LABELS: Record<string, { label: string; desc: string; icon: string }> = {
  median: { label: "Median Consensus", desc: "Robust against non-normal distributions", icon: "Md" },
  mean: { label: "Arithmetic Mean", desc: "Direct average of all verified quotes", icon: "Mn" },
  iqr_trimmed_mean: { label: "IQR-Trimmed Consensus", desc: "Outlier-filtered statistical median/mean", icon: "IQ" },
  kmeans: { label: "K-Means Clustering Center", desc: "Centroid of primary price cluster", icon: "KM" },
  dbscan: { label: "DBSCAN Density Core", desc: "Density-based core cluster consensus", icon: "DB" },
  hierarchical: { label: "Hierarchical / Agglomerative", desc: "Ward linkage hierarchical cluster center", icon: "HC" },
};

export default function PrescriptionAccuracyEvaluator({ prescriptionId }: Props) {
  const [data, setData] = useState<{
    medicines: MedicineAccuracyEval[];
    method_leaderboard: LeaderboardItem[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [customGt, setCustomGt] = useState<Record<string, { branded: string; generic: string }>>({});
  const [activeMedicineTab, setActiveMedicineTab] = useState<string>("");
  const [priceTypeView, setPriceTypeView] = useState<"branded" | "generic">("branded");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load initial prescription accuracy data
  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await getPrescriptionAccuracy(prescriptionId);
      setData(res);
      if (res.medicines && res.medicines.length > 0) {
        setActiveMedicineTab(res.medicines[0].medicine_id);
        // Initialize custom Ground Truth input states
        const initialGt: Record<string, { branded: string; generic: string }> = {};
        res.medicines.forEach((m: MedicineAccuracyEval) => {
          initialGt[m.medicine_id] = {
            branded: String(m.ground_truth.branded_unit_price),
            generic: String(m.ground_truth.generic_unit_price),
          };
        });
        setCustomGt(initialGt);
      }
    } catch (err: any) {
      console.error("Failed to load prescription accuracy evaluation", err);
      setErrorMessage("Could not connect to the backend server. Please make sure the backend (port 8000) is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (prescriptionId) {
      loadData();
    }
  }, [prescriptionId]);

  // Handle custom ground truth update
  const handleGroundTruthChange = (medId: string, type: "branded" | "generic", value: string) => {
    setCustomGt((prev) => ({
      ...prev,
      [medId]: {
        ...prev[medId],
        [type]: value,
      },
    }));
  };

  // Submit custom ground truth ("Put Set Data") and re-evaluate
  const handleReEvaluate = async () => {
    try {
      setEvaluating(true);
      setSavedSuccess(false);
      setErrorMessage(null);

      const payload: Record<string, { branded: number; generic: number }> = {};
      Object.keys(customGt).forEach((medId) => {
        payload[medId] = {
          branded: parseFloat(customGt[medId]?.branded || "0") || 0,
          generic: parseFloat(customGt[medId]?.generic || "0") || 0,
        };
      });

      const updated = await evaluatePrescriptionAccuracy(prescriptionId, payload);
      setData(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err: any) {
      console.error("Re-evaluation failed:", err);
      setErrorMessage("Failed to save and re-evaluate data. Please ensure the backend server is reachable.");
    } finally {
      setEvaluating(false);
    }
  };

  // Reset to auto-scraped live defaults
  const handleResetDefaults = () => {
    loadData();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent mb-3" />
        <p className="text-sm font-medium text-slate-600">
          Calculating Prescription-Wise Statistical Methods & Accuracy Benchmarks...
        </p>
      </div>
    );
  }

  if (errorMessage && (!data || !data.medicines || data.medicines.length === 0)) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center shadow-sm">
        <div className="mb-2"><svg className="h-8 w-8 text-red-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg></div>
        <p className="text-red-700 font-semibold text-base">Backend Connection Issue</p>
        <p className="text-slate-500 text-xs mt-1 mb-4">{errorMessage}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  if (!data || !data.medicines || data.medicines.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
        <p className="text-slate-500 text-sm">No medicine price data available for accuracy evaluation.</p>
      </div>
    );
  }

  const activeMed = data.medicines.find((m) => m.medicine_id === activeMedicineTab) || data.medicines[0];
  const activeGt = customGt[activeMed.medicine_id] || {
    branded: String(activeMed.ground_truth.branded_unit_price),
    generic: String(activeMed.ground_truth.generic_unit_price),
  };

  const currentMethods = priceTypeView === "branded" ? activeMed.methods_branded : activeMed.methods_generic;
  const currentGtPrice = priceTypeView === "branded" ? parseFloat(activeGt.branded) : parseFloat(activeGt.generic);
  const bestMethodKey = priceTypeView === "branded" ? activeMed.best_branded_method : activeMed.best_generic_method;

  return (
    <div className="space-y-8">
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold">Connection Issue:</span>
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => {
              setErrorMessage(null);
              loadData();
            }}
            className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded font-semibold transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-md relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Prescription-Specific Accuracy Engine</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Multi-Method Statistical Evaluation vs Ground Truth ("Set Data")
          </h2>
          <p className="text-slate-300 text-sm mt-2 leading-relaxed">
            Evaluates final prices generated for this prescription across 6 distinct statistical & machine learning methods
            (<strong>Median</strong>, <strong>Arithmetic Mean</strong>, <strong>IQR-Trimmed Mean</strong>, <strong>K-Means</strong>, <strong>DBSCAN</strong>, and <strong>Hierarchical Clustering</strong>) 
            directly against your verified Ground Truth set data.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 relative z-10 no-print">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold backdrop-blur-sm border border-white/20 transition-all cursor-pointer"
            title="Print or Save as PDF"
          >
            <svg className="w-4 h-4 text-teal-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Print Report</span>
          </button>

          <button
            onClick={() => {
              if (!data) return;
              const htmlContent = generateAccuracyBenchmarkHtml(data);
              const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `prescription_accuracy_report_${prescriptionId?.slice(0, 8)}.html`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-100 rounded-xl text-xs font-semibold backdrop-blur-sm border border-emerald-400/40 transition-all cursor-pointer"
            title="Download Standalone HTML Benchmark Report"
          >
            <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span>Download HTML</span>
          </button>

          <button
            onClick={() => {
              if (!data) return;
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `prescription_accuracy_eval_${prescriptionId?.slice(0, 8)}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-teal-500/30 hover:bg-teal-500/40 text-teal-100 rounded-xl text-xs font-semibold backdrop-blur-sm border border-teal-400/40 transition-all cursor-pointer"
            title="Download full evaluation accuracy data as JSON"
          >
            <svg className="w-4 h-4 text-teal-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Download JSON</span>
          </button>
        </div>
      </div>

      {/* Top Method Leaderboard across this prescription */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              Method Accuracy Ranking for this Prescription
            </h3>
            <p className="text-xs text-slate-500">
              Aggregated across all {data.medicines.length} prescribed medicines in this prescription.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg">
            Top Performer: {data.method_leaderboard[0]?.method_name}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.method_leaderboard.map((item, idx) => {
            const isTop = idx === 0;
            return (
              <div
                key={item.method_key}
                className={`p-4 rounded-xl border transition-all ${
                  isTop
                    ? "bg-teal-50/70 border-teal-300 shadow-sm"
                    : "bg-slate-50/50 border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="font-bold">{idx === 0 ? "#1" : idx === 1 ? "#2" : idx === 2 ? "#3" : `#${idx + 1}`}</span>
                    <span className="truncate">{item.method_name}</span>
                  </span>
                  <span
                    className={`font-mono text-sm font-extrabold ${
                      item.average_accuracy_pct >= 90
                        ? "text-emerald-600"
                        : item.average_accuracy_pct >= 75
                        ? "text-teal-700"
                        : "text-amber-600"
                    }`}
                  >
                    {item.average_accuracy_pct.toFixed(1)}%
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>MAE: ₹{item.mae.toFixed(2)}</span>
                  <span>RMSE: ₹{item.rmse.toFixed(2)}</span>
                </div>

                {/* Progress bar */}
                <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      isTop ? "bg-teal-600" : "bg-slate-400"
                    }`}
                    style={{ width: `${Math.min(100, item.average_accuracy_pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Medicine Selector Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            <span className="text-xs font-bold uppercase text-slate-400 mr-1">Select Medicine:</span>
            {data.medicines.map((m) => (
              <button
                key={m.medicine_id}
                onClick={() => setActiveMedicineTab(m.medicine_id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeMedicineTab === m.medicine_id
                    ? "bg-teal-700 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setPriceTypeView("branded")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                priceTypeView === "branded"
                  ? "bg-teal-600 text-white"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Branded Quotes
            </button>
            <button
              onClick={() => setPriceTypeView("generic")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                priceTypeView === "generic"
                  ? "bg-teal-600 text-white"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Generic Quotes
            </button>
          </div>
        </div>

        {/* Active Medicine Ground Truth Input Panel */}
        <div className="p-6 border-b border-slate-100 bg-teal-50/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-800">{activeMed.name}</h3>
                <span className="text-xs font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {activeMed.dosage || "Standard Dose"}
                </span>
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">
                  {priceTypeView === "branded" ? activeMed.branded_candidate_count : activeMed.generic_candidate_count} quotes gathered
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Enter your verified reference Ground Truth unit price below ("Set Data") to instantly evaluate statistical accuracy.
              </p>
            </div>

            {/* Ground Truth Inputs */}
            <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-teal-200 shadow-sm">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700">
                  Branded Set Ground Truth:
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={activeGt.branded}
                    onChange={(e) => handleGroundTruthChange(activeMed.medicine_id, "branded", e.target.value)}
                    className="w-24 pl-6 pr-2 py-1 text-xs font-mono font-bold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50"
                  />
                  <span className="text-[10px] text-slate-400 ml-1">/unit</span>
                </div>
              </div>

              <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700">
                  Generic Set Ground Truth:
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={activeGt.generic}
                    onChange={(e) => handleGroundTruthChange(activeMed.medicine_id, "generic", e.target.value)}
                    className="w-24 pl-6 pr-2 py-1 text-xs font-mono font-bold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50"
                  />
                  <span className="text-[10px] text-slate-400 ml-1">/unit</span>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={handleReEvaluate}
                  disabled={evaluating}
                  className="px-3 py-1.5 bg-teal-700 hover:bg-teal-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {evaluating ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Recomputing...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                      <span>Update & Compare</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleResetDefaults}
                  title="Reset to live scraped 1mg & DavaIndia values"
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-medium transition-colors"
                >
                  Reset Defaults
                </button>
              </div>
            </div>
          </div>

          {savedSuccess && (
            <div className="mt-3 p-2 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-medium flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              <span>Ground truth updated! Accuracies and method errors have been recalculated.</span>
            </div>
          )}
        </div>

        {/* Detailed Method Comparison Table */}
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800">
              Statistical & ML Method Outputs vs Set Ground Truth ({priceTypeView === "branded" ? "Branded" : "Generic"})
            </h4>
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span>Ground Truth Reference:</span>
              <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border">
                ₹{currentGtPrice.toFixed(2)}/unit
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Method Name</th>
                  <th className="px-4 py-3">Algorithm Description</th>
                  <th className="px-4 py-3 text-right">Computed Final Value</th>
                  <th className="px-4 py-3 text-right">Set Ground Truth</th>
                  <th className="px-4 py-3 text-right">Absolute Error</th>
                  <th className="px-4 py-3 text-right">Accuracy (%)</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {Object.keys(METHOD_LABELS).map((methodKey) => {
                  const info = METHOD_LABELS[methodKey];
                  const res = currentMethods[methodKey];
                  const isBest = methodKey === bestMethodKey;
                  const computedVal = res?.value ?? null;
                  const absErr = res?.absolute_error ?? null;
                  const accPct = res?.accuracy_pct ?? null;

                  return (
                    <tr
                      key={methodKey}
                      className={isBest ? "bg-teal-50/60 font-semibold hover:bg-teal-50" : "hover:bg-slate-50"}
                    >
                      <td className="px-4 py-3.5 flex items-center gap-2">
                        <span>{info.icon}</span>
                        <span className="font-bold text-slate-900">{info.label}</span>
                        {isBest && (
                          <span className="text-[10px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded">
                            BEST FIT
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">{info.desc}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-teal-800">
                        {computedVal !== null ? `₹${computedVal.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-slate-700">
                        ₹{currentGtPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-slate-600">
                        {absErr !== null ? `₹${absErr.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {accPct !== null ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold ${
                              accPct >= 90
                                ? "bg-emerald-100 text-emerald-800"
                                : accPct >= 75
                                ? "bg-teal-100 text-teal-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {accPct.toFixed(1)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {accPct !== null && accPct >= 85 ? (
                          <span className="text-xs text-emerald-600 font-semibold">High Agreement</span>
                        ) : accPct !== null && accPct >= 70 ? (
                          <span className="text-xs text-teal-600 font-semibold">Moderate</span>
                        ) : (
                          <span className="text-xs text-amber-600 font-semibold">Deviation</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Visual Deviation Bars */}
        <div className="p-6 bg-slate-50/50 border-t border-slate-200">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            Visual Method Agreement & Deviation vs Ground Truth (₹{currentGtPrice.toFixed(2)})
          </h4>
          <div className="space-y-2">
            {Object.keys(METHOD_LABELS).map((methodKey) => {
              const res = currentMethods[methodKey];
              const acc = res?.accuracy_pct || 0;
              const val = res?.value;

              return (
                <div key={methodKey} className="flex items-center gap-3 text-xs">
                  <span className="w-44 font-semibold text-slate-700 truncate">
                    {METHOD_LABELS[methodKey].label}
                  </span>
                  <div className="flex-1 bg-slate-200 h-3 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        acc >= 90 ? "bg-emerald-500" : acc >= 75 ? "bg-teal-500" : "bg-amber-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(5, acc))}%` }}
                    />
                  </div>
                  <span className="w-24 text-right font-mono font-bold text-slate-700">
                    {val !== null ? `₹${val?.toFixed(2)}` : "—"} ({acc.toFixed(1)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
