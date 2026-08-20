"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { getResults, getPrescription } from "@/lib/api";
import type { PrescriptionSavingsResult } from "@/lib/types";
import SavingsSummary from "@/components/SavingsSummary";
import MedicineCard from "@/components/MedicineCard";
import PrescriptionAccuracyEvaluator from "@/components/PrescriptionAccuracyEvaluator";
import { generatePrescriptionSavingsHtml } from "@/lib/exportHtml";

function ResultsContent() {
  const searchParams = useSearchParams();
  const prescriptionId = searchParams.get("prescriptionId") || searchParams.get("id");

  const [prescription, setPrescription] = useState<any>(null);
  const [result, setResult] = useState<PrescriptionSavingsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"savings" | "accuracy">("savings");

  useEffect(() => {
    if (!prescriptionId) return;

    const fetchResults = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Also fetch prescription metadata to check status
        try {
          const prescData = await getPrescription(prescriptionId);
          setPrescription(prescData);
        } catch {
          // Non-blocking
        }

        const data = await getResults(prescriptionId);
        setResult(data);
      } catch (err: any) {
        setError(err.message || "Failed to load results");
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [prescriptionId]);

  if (!prescriptionId) {
    return (
      <div className="flex flex-col items-center pt-20">
        <p className="text-slate-500">No prescription specified.</p>
        <a href="/" className="mt-4 text-teal-600 hover:text-teal-700 font-medium">
          ← Upload a prescription
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center pt-20 gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
        <p className="text-slate-500">Loading results...</p>
      </div>
    );
  }

  if (error || !result) {
    const isProcessing = prescription?.status === "processing" || prescription?.status === "uploaded";
    const runId = prescription?.latest_run_id;

    return (
      <div className="flex flex-col items-center pt-20 gap-4 max-w-lg mx-auto text-center">
        {isProcessing ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 w-full">
            <div className="mb-3"><svg className="h-8 w-8 text-amber-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
            <h2 className="text-lg font-semibold text-amber-800">Prescription Still Processing</h2>
            <p className="text-sm text-slate-600 mt-2 mb-6 leading-relaxed">
              This prescription is currently being analyzed by the pipeline.
            </p>
            {runId ? (
              <a
                href={`/processing?runId=${runId}&prescriptionId=${prescriptionId}`}
                className="inline-block px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-all"
              >
                View Live Progress →
              </a>
            ) : (
              <a
                href="/history"
                className="inline-block px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium transition-all"
              >
                Back to History
              </a>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 w-full">
            <div className="mb-3"><svg className="h-8 w-8 text-red-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg></div>
            <p className="text-red-700 font-semibold text-lg">No Results Available</p>
            <p className="text-sm text-slate-500 mt-2 mb-6 leading-relaxed">
              {error || "This prescription has not completed analysis or contains no recognized medicines."}
            </p>
            <div className="flex items-center justify-center gap-4">
              <a href="/history" className="text-sm px-4 py-2 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors">
                ← View History
              </a>
              <a href="/" className="text-sm px-4 py-2 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 transition-colors">
                Upload New
              </a>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-12 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            Prescription Analysis & Intelligence
          </h1>
          <p className="mt-1 text-slate-500 text-sm">
            Analysis of {result.medicines_analyzed} medicines • Verified composition & statistical pricing
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 no-print">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 transition-all shadow-sm cursor-pointer"
            title="Print or Save as PDF"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Print Report</span>
          </button>

          <button
            onClick={() => {
              if (!result) return;
              const htmlContent = generatePrescriptionSavingsHtml(result);
              const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `prescription_report_${prescriptionId?.slice(0, 8)}.html`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-all shadow-sm cursor-pointer"
            title="Download Standalone HTML Report"
          >
            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span>Download HTML</span>
          </button>

          <button
            onClick={() => {
              if (!result) return;
              const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `prescription_analysis_${prescriptionId?.slice(0, 8)}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-teal-800 border border-teal-200 hover:bg-teal-100 transition-all shadow-sm cursor-pointer"
            title="Download full analysis data JSON"
          >
            <svg className="w-4 h-4 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Download JSON</span>
          </button>

          <a
            href="/"
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs sm:text-sm text-white hover:bg-slate-800 transition-colors shadow-sm font-medium"
          >
            + New Analysis
          </a>
        </div>
      </div>

      {/* Main Tabs: Savings vs Prescription Accuracy System */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveView("savings")}
          className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeView === "savings"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>Savings & Medicine Breakdown</span>
        </button>

        <button
          onClick={() => setActiveView("accuracy")}
          className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeView === "accuracy"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
          <span>Statistical Methods Accuracy & Set Ground Truth</span>
          <span className="text-[10px] bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded-full border border-teal-200">
            Prescription-Wise
          </span>
        </button>
      </div>

      {activeView === "savings" ? (
        <>
          {/* Savings Summary */}
          <SavingsSummary result={result} />

          {/* Medicine Cards */}
          <div className="mt-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-700">
                Medicine-by-Medicine Breakdown
              </h2>
              <button
                onClick={() => setActiveView("accuracy")}
                className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-200"
              >
                Inspect Statistical Methods & Ground Truth Accuracy →
              </button>
            </div>

            <div className="grid gap-4">
              {result.details.map((detail) => (
                <MedicineCard key={detail.medicine.id} detail={detail} />
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mt-10 rounded-xl bg-amber-50 border border-amber-200 p-5">
            <p className="text-sm font-medium text-amber-700 mb-2">
              Important Notice
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              These savings estimates are based on publicly available pricing data and may vary
              by pharmacy, location, and availability. Prices shown are approximate MRP values.
              Actual purchase prices may differ. Generic substitution should always be confirmed
              with your prescribing doctor or a qualified pharmacist.
            </p>
          </div>
        </>
      ) : (
        /* Prescription Accuracy & Statistical Methods View */
        <PrescriptionAccuracyEvaluator prescriptionId={prescriptionId} />
      )}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center pt-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
