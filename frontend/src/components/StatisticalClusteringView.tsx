"use client";

import { useEffect, useState } from "react";

export interface ClusteringData {
  method?: string;
  medicine_name?: string;
  branded_raw_prices?: number[];
  generic_raw_prices?: number[];
  branded_median?: number;
  generic_median?: number;
  branded_q1?: number;
  branded_q3?: number;
  branded_iqr?: number;
  branded_lower_bound?: number;
  branded_upper_bound?: number;
  generic_q1?: number;
  generic_q3?: number;
  generic_iqr?: number;
  generic_lower_bound?: number;
  generic_upper_bound?: number;
  branded_outliers?: number;
  generic_outliers?: number;
  branded_valid_count?: number;
  generic_valid_count?: number;
  branded_cv?: number;
  generic_cv?: number;
  branded_confidence?: number;
  generic_confidence?: number;
}

interface Props {
  data: ClusteringData;
}

export default function StatisticalClusteringView({ data }: Props) {
  const [animStep, setAnimStep] = useState<number>(0);

  useEffect(() => {
    // Progressively trigger step animations: 1. Raw Dots -> 2. Boxplot IQR Bounds -> 3. Outlier Trimming -> 4. Median Consensus
    const t1 = setTimeout(() => setAnimStep(1), 300);
    const t2 = setTimeout(() => setAnimStep(2), 900);
    const t3 = setTimeout(() => setAnimStep(3), 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [data]);

  const brandedPrices = data.branded_raw_prices || [];
  const genericPrices = data.generic_raw_prices || [];
  const allPrices = [...brandedPrices, ...genericPrices];
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices, 1) : 100;
  const minPrice = 0;

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm overflow-hidden relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3.5 gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-200">
            <svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-800 tracking-wide">
                Statistical Price Validation
              </h4>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-mono text-indigo-600 border border-indigo-200">
                Active
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Method: <span className="text-slate-700 font-medium">Interquartile Range [Q1 - 1.5×IQR, Q3 + 1.5×IQR] + Median Consensus</span>
            </p>
          </div>
        </div>

        {data.medicine_name && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 self-start sm:self-auto">
            {data.medicine_name}
          </span>
        )}
      </div>

      {/* Statistical Method Pipeline Progression */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className={`p-2.5 rounded-xl border transition-all duration-500 ${
          animStep >= 0 ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-slate-50 border-slate-200 text-slate-400"
        }`}>
          <div className="text-[10px] font-mono text-blue-600">STEP 1</div>
          <div className="font-semibold mt-0.5">Price Aggregation</div>
          <div className="text-[10px] text-slate-500 mt-1">{brandedPrices.length + genericPrices.length} data points gathered</div>
        </div>

        <div className={`p-2.5 rounded-xl border transition-all duration-500 ${
          animStep >= 2 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-slate-50 border-slate-200 text-slate-400"
        }`}>
          <div className="text-[10px] font-mono text-amber-600">STEP 2</div>
          <div className="font-semibold mt-0.5">IQR Filtering</div>
          <div className="text-[10px] text-slate-500 mt-1">
            Trimmed {(data.branded_outliers || 0) + (data.generic_outliers || 0)} outliers
          </div>
        </div>

        <div className={`p-2.5 rounded-xl border transition-all duration-500 ${
          animStep >= 3 ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-slate-50 border-slate-200 text-slate-400"
        }`}>
          <div className="text-[10px] font-mono text-emerald-600">STEP 3</div>
          <div className="font-semibold mt-0.5">Median Consensus</div>
          <div className="text-[10px] text-slate-500 mt-1">
            Conf: {Math.round((data.branded_confidence || 0.9) * 100)}% (CV={data.branded_cv ?? 0.05})
          </div>
        </div>
      </div>

      {/* Visual Cluster Distribution Plot */}
      <div className="mt-5 space-y-4">
        {/* Branded Cluster */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              Branded Distribution
            </span>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="text-slate-400">Q1: ₹{data.branded_q1 || "—"}</span>
              <span className="text-blue-700 font-bold">Median: ₹{data.branded_median || "—"}/unit</span>
              <span className="text-slate-400">Q3: ₹{data.branded_q3 || "—"}</span>
            </div>
          </div>

          {/* Interactive Strip Visualizer */}
          <div className="relative h-10 w-full rounded-lg bg-white border border-slate-200 px-3 flex items-center overflow-hidden">
            {/* IQR Box Range */}
            {data.branded_q1 !== undefined && data.branded_q3 !== undefined && (
              <div
                className={`absolute h-6 rounded bg-blue-100 border border-blue-300 transition-all duration-1000 ${
                  animStep >= 2 ? "opacity-100 scale-100" : "opacity-0 scale-95"
                }`}
                style={{
                  left: `${Math.max(5, ((data.branded_q1 - minPrice) / maxPrice) * 90)}%`,
                  width: `${Math.max(10, (((data.branded_q3 - data.branded_q1) || 1) / maxPrice) * 90)}%`,
                }}
              />
            )}

            {/* Individual Data Points */}
            {brandedPrices.map((p, i) => {
              const posPercent = Math.min(95, Math.max(5, ((p - minPrice) / maxPrice) * 90));
              const isOutlier = data.branded_lower_bound !== undefined && (p < data.branded_lower_bound || p > (data.branded_upper_bound || 9999));
              return (
                <div
                  key={i}
                  className={`absolute h-3 w-3 rounded-full transform -translate-x-1/2 transition-all duration-700 ${
                    isOutlier && animStep >= 2
                      ? "bg-red-400 ring-2 ring-red-300 opacity-50 scale-75"
                      : "bg-blue-500 ring-2 ring-blue-300 shadow-sm"
                  }`}
                  style={{
                    left: `${posPercent}%`,
                    top: "35%",
                    transitionDelay: `${i * 40}ms`,
                  }}
                  title={`Price candidate: ₹${p}`}
                />
              );
            })}

            {/* Median Marker Line */}
            {data.branded_median !== undefined && (
              <div
                className={`absolute top-0 bottom-0 w-0.5 bg-emerald-600 z-10 transition-all duration-1000 ${
                  animStep >= 3 ? "opacity-100" : "opacity-0"
                }`}
                style={{
                  left: `${Math.min(95, Math.max(5, ((data.branded_median - minPrice) / maxPrice) * 90))}%`,
                }}
              >
                <div className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
              </div>
            )}
          </div>
        </div>

        {/* Generic Cluster */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-emerald-700 flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Generic Distribution
            </span>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="text-slate-400">Q1: ₹{data.generic_q1 || "—"}</span>
              <span className="text-emerald-700 font-bold">Median: ₹{data.generic_median || "—"}/unit</span>
              <span className="text-slate-400">Q3: ₹{data.generic_q3 || "—"}</span>
            </div>
          </div>

          <div className="relative h-10 w-full rounded-lg bg-white border border-slate-200 px-3 flex items-center overflow-hidden">
            {/* IQR Box Range */}
            {data.generic_q1 !== undefined && data.generic_q3 !== undefined && (
              <div
                className={`absolute h-6 rounded bg-emerald-100 border border-emerald-300 transition-all duration-1000 ${
                  animStep >= 2 ? "opacity-100 scale-100" : "opacity-0 scale-95"
                }`}
                style={{
                  left: `${Math.max(5, ((data.generic_q1 - minPrice) / maxPrice) * 90)}%`,
                  width: `${Math.max(10, (((data.generic_q3 - data.generic_q1) || 1) / maxPrice) * 90)}%`,
                }}
              />
            )}

            {/* Individual Data Points */}
            {genericPrices.map((p, i) => {
              const posPercent = Math.min(95, Math.max(5, ((p - minPrice) / maxPrice) * 90));
              const isOutlier = data.generic_lower_bound !== undefined && (p < data.generic_lower_bound || p > (data.generic_upper_bound || 9999));
              return (
                <div
                  key={i}
                  className={`absolute h-3 w-3 rounded-full transform -translate-x-1/2 transition-all duration-700 ${
                    isOutlier && animStep >= 2
                      ? "bg-red-400 ring-2 ring-red-300 opacity-50 scale-75"
                      : "bg-emerald-500 ring-2 ring-emerald-300 shadow-sm"
                  }`}
                  style={{
                    left: `${posPercent}%`,
                    top: "35%",
                    transitionDelay: `${i * 40}ms`,
                  }}
                  title={`Generic candidate: ₹${p}`}
                />
              );
            })}

            {/* Median Marker Line */}
            {data.generic_median !== undefined && (
              <div
                className={`absolute top-0 bottom-0 w-0.5 bg-emerald-600 z-10 transition-all duration-1000 ${
                  animStep >= 3 ? "opacity-100" : "opacity-0"
                }`}
                style={{
                  left: `${Math.min(95, Math.max(5, ((data.generic_median - minPrice) / maxPrice) * 90))}%`,
                }}
              >
                <div className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
