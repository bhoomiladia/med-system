"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPrescriptions } from "@/lib/api";
import type { PrescriptionHistoryItem } from "@/lib/types";

export default function HistoryPage() {
  const [prescriptions, setPrescriptions] = useState<PrescriptionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHistory() {
      try {
        setLoading(true);
        const data = await getPrescriptions();
        setPrescriptions(data);
      } catch (err: any) {
        setError(err.message || "Failed to load prescription history");
      } finally {
        setLoading(false);
      }
    }
    loadHistory();
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800">
            Prescription History
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            View all uploaded prescriptions and their analyzed savings reports
          </p>
        </div>
        <Link
          href="/"
          className="px-4 py-2 text-sm font-medium rounded-xl bg-teal-700 hover:bg-teal-600 text-white transition-all shadow-sm"
        >
          + Upload New
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            <span>Loading prescription history...</span>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center text-red-600">
          <p className="font-semibold">Unable to load history</p>
          <p className="text-sm mt-1 text-slate-500">{error}</p>
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="mb-4"><svg className="h-10 w-10 text-slate-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V19.5a2.25 2.25 0 002.25 2.25h.75" /></svg></div>
          <h2 className="text-lg font-semibold text-slate-700">No prescriptions analyzed yet</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            Upload your first prescription to calculate potential generic savings.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-white font-medium text-sm transition-all"
          >
            Upload Prescription
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {prescriptions.map((p) => {
            const date = new Date(p.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={p.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <div>
                      <h3 className="font-semibold text-slate-700 text-base">
                        {p.original_filename}
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        <span>{date}</span>
                        <span>•</span>
                        <span>{(p.file_size / 1024).toFixed(1)} KB</span>
                        <span>•</span>
                        <span>{p.medicine_count} medicine{p.medicine_count !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      p.status === "completed"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : p.status === "processing"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-slate-100 text-slate-500 border border-slate-200"
                    }`}
                  >
                    {p.status.toUpperCase()}
                  </span>

                  <Link
                    href={`/results?id=${p.id}`}
                    className="px-4 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors border border-slate-200"
                  >
                    View Report →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
