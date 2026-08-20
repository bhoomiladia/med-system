"use client";

import React, { useEffect, useState } from "react";
import { generateAccuracyBenchmarkHtml } from "@/lib/exportHtml";

interface GlobalMetrics {
  branded: {
    rmse: number;
    mae: number;
    r2_score: number;
  };
  generic: {
    rmse: number;
    mae: number;
    r2_score: number;
  };
  overall_accuracy_percent: number;
  mean_consensus_confidence: number;
  total_candidates_analyzed: number;
  total_medicines_analyzed: number;
}

interface LiveScrapedItem {
  medicine: string;
  source: string;
  type: string;
  name: string;
  price: number;
  pack_size: number;
  unit_price: number;
}

interface MedicineMetric {
  medicine: string;
  display_name: string;
  scraped_1mg_unit_price: number;
  pipeline_branded_unit_price: number;
  scraped_davaindia_unit_price: number;
  pipeline_generic_unit_price: number;
  branded_accuracy: number;
  generic_accuracy: number;
  cv_percent: number;
  outlier_rate: number;
  total_candidates: number;
}

interface ClusteringBenchmark {
  algorithm: string;
  category: string;
  k: number;
  silhouette: number;
  davies_bouldin: number;
  calinski_harabasz: number;
  verdict: string;
}

interface ScatterPoint {
  x: number;
  y: number;
  cluster: number;
  price: number;
  unit_price: number;
  confidence: number;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<{
    global_metrics: GlobalMetrics;
    scraped_sources_live: LiveScrapedItem[];
    per_medicine_breakdown: MedicineMetric[];
    clustering_benchmarks: ClusteringBenchmark[];
    scatter_points: ScatterPoint[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"clustering" | "stats" | "scraping">("clustering");
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const res = await fetch("http://localhost:8000/api/evaluation/metrics");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load evaluation metrics", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-teal-600 border-t-transparent"></div>
        <p className="text-sm font-medium text-slate-600 animate-pulse">
          Scraping live prices from 1mg & Dava India, calculating RMSE, MAE, R² & executing Clustering models...
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-red-100 p-8 shadow-sm">
        <p className="text-red-600 font-semibold mb-2">Error connecting to evaluation engine.</p>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { global_metrics, scraped_sources_live, per_medicine_breakdown, clustering_benchmarks, scatter_points } = data;

  return (
    <div className="space-y-8 pb-12">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              ML Clustering & Price Accuracy Benchmark
            </h1>
            <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 border border-teal-200">
              Live Scraped
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time web scraping from <span className="font-semibold text-orange-600">Tata 1mg</span> &{" "}
            <span className="font-semibold text-emerald-700">Dava India / PMBJP</span> with statistical error estimation (RMSE, MAE, R²) and comparative clustering algorithms.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 no-print">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-all cursor-pointer"
            title="Print or Save ML Benchmark as PDF"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Print Benchmark</span>
          </button>

          <button
            onClick={() => {
              if (!data) return;
              const htmlContent = generateAccuracyBenchmarkHtml(data);
              const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `ml_accuracy_benchmark_${new Date().toISOString().slice(0, 10)}.html`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 hover:bg-emerald-100 shadow-sm transition-all cursor-pointer"
            title="Download Standalone HTML Benchmark Report"
          >
            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              a.download = `ml_accuracy_benchmark_${new Date().toISOString().slice(0, 10)}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-teal-50 border border-teal-200 rounded-xl text-xs font-semibold text-teal-800 hover:bg-teal-100 shadow-sm transition-all cursor-pointer"
            title="Download full benchmark JSON"
          >
            <svg className="w-4 h-4 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Export JSON</span>
          </button>

          <button
            onClick={fetchData}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            <svg className={`h-4 w-4 text-teal-400 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? "Scraping & Computing..." : "Re-scrape & Re-evaluate"}
          </button>
        </div>
      </div>

      {/* Global Stat KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Branded RMSE</p>
          <p className="text-xl font-bold text-slate-900 mt-1">₹{global_metrics.branded.rmse.toFixed(2)}</p>
          <span className="text-[11px] text-emerald-600 font-medium">1mg Ground Truth</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Branded R² Score</p>
          <p className="text-xl font-bold text-teal-700 mt-1">{global_metrics.branded.r2_score.toFixed(4)}</p>
          <span className="text-[11px] text-teal-600 font-medium">High Regression Fit</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Generic RMSE</p>
          <p className="text-xl font-bold text-slate-900 mt-1">₹{global_metrics.generic.rmse.toFixed(2)}</p>
          <span className="text-[11px] text-slate-500 font-medium">DavaIndia Ground Truth</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Overall Accuracy</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">{global_metrics.overall_accuracy_percent.toFixed(1)}%</p>
          <span className="text-[11px] text-emerald-600 font-medium">Across All DB Meds</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Mean Confidence</p>
          <p className="text-xl font-bold text-teal-800 mt-1">{global_metrics.mean_consensus_confidence.toFixed(1)}%</p>
          <span className="text-[11px] text-teal-600 font-medium">Statistical Consensus</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Candidates</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{global_metrics.total_candidates_analyzed}</p>
          <span className="text-[11px] text-slate-500 font-medium">{global_metrics.total_medicines_analyzed} Distinct Meds</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab("clustering")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "clustering"
              ? "border-teal-700 text-teal-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Clustering Algorithms Benchmark (K-Means, Agglomerative, GMM, DBSCAN)
        </button>

        <button
          onClick={() => setActiveTab("stats")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "stats"
              ? "border-teal-700 text-teal-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Per-Medicine Error & Accuracy Breakdown
        </button>

        <button
          onClick={() => setActiveTab("scraping")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "scraping"
              ? "border-teal-700 text-teal-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Live Scraped 1mg & DavaIndia Raw Data ({scraped_sources_live.length})
        </button>
      </div>

      {/* TAB 1: CLUSTERING PERFORMANCE (Which Performed Kaisa) */}
      {activeTab === "clustering" && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-teal-900 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-md relative overflow-hidden">
            <div className="relative z-10 max-w-3xl">
              <span className="text-teal-300 text-xs font-bold uppercase tracking-wider">Clustering Performance & Ranking</span>
              <h2 className="text-2xl font-bold mt-1 text-white">
                Which Clustering Algorithm Performed Best?
              </h2>
              <p className="text-slate-300 text-sm mt-2 leading-relaxed">
                We trained and evaluated multiple unsupervised clustering models on multi-dimensional price and confidence vectors:{" "}
                <code className="bg-white/10 px-1.5 py-0.5 rounded text-teal-200 font-mono text-xs">[Pack Price, Unit Price, Pack Size, Confidence]</code>.
                Below is the ranked leaderboard evaluated via <strong>Silhouette Score</strong> (Cluster Separation), <strong>Davies-Bouldin Index</strong> (Cluster Compactness), and <strong>Calinski-Harabasz Index</strong> (Variance Ratio).
              </p>
            </div>
          </div>

          {/* Model Comparison Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base">Model Leaderboard & Metric Benchmarking</h3>
              <span className="text-xs text-slate-400 font-medium">Sorted by Silhouette Score</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3.5">Rank & Algorithm</th>
                    <th className="px-6 py-3.5">Paradigm</th>
                    <th className="px-6 py-3.5 text-center">Clusters (k)</th>
                    <th className="px-6 py-3.5 text-right">Silhouette Score ↑</th>
                    <th className="px-6 py-3.5 text-right">Davies-Bouldin Index ↓</th>
                    <th className="px-6 py-3.5 text-right">Calinski-Harabasz ↑</th>
                    <th className="px-6 py-3.5">Performance Analysis ("Kaisa Raha")</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {clustering_benchmarks.map((model, idx) => (
                    <tr key={model.algorithm} className={idx === 0 ? "bg-teal-50/50 hover:bg-teal-50" : "hover:bg-slate-50/80"}>
                      <td className="px-6 py-4 flex items-center gap-2">
                        <span className="text-base font-bold">{idx === 0 ? "#1" : idx === 1 ? "#2" : idx === 2 ? "#3" : `#${idx + 1}`}</span>
                        <span className="font-bold text-slate-900">{model.algorithm}</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">{model.category}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-block px-2.5 py-0.5 bg-slate-100 rounded-full text-xs font-semibold text-slate-700">
                          {model.k}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-bold ${model.silhouette > 0.9 ? "text-emerald-700 font-mono text-base" : "text-slate-800 font-mono"}`}>
                          {model.silhouette.toFixed(4)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-700">
                        {model.davies_bouldin.toFixed(4)}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-700">
                        {model.calinski_harabasz.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600 leading-snug">
                        {model.verdict}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2D PCA Cluster Scatter Visualization */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Interactive 2D Feature Projection (PCA Reduced)</h3>
                <p className="text-xs text-slate-500">Visualizing high-dimensional price candidate clusters across the database.</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-medium">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-emerald-500"></span> Cluster 0: Routine Generics (&lt;₹10/unit)</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-indigo-500"></span> Cluster 1: Branded Retail</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-amber-500"></span> Cluster 2: Biologics / Outliers</span>
              </div>
            </div>

            <div className="h-64 w-full bg-slate-950 rounded-2xl relative p-4 flex items-center justify-center overflow-hidden border border-slate-800">
              {/* Grid Lines */}
              <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 opacity-20 pointer-events-none">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={i} className="border-b border-r border-slate-500"></div>
                ))}
              </div>

              {/* Render Scatter Points */}
              <div className="relative w-full h-full">
                {scatter_points.map((pt, i) => {
                  // Normalize coordinates to percentage 10% - 90%
                  const left = Math.min(92, Math.max(8, 50 + pt.x * 20));
                  const top = Math.min(90, Math.max(10, 50 - pt.y * 22));
                  const color =
                    pt.cluster === 0
                      ? "bg-emerald-400 shadow-emerald-500/50"
                      : pt.cluster === 1
                      ? "bg-indigo-400 shadow-indigo-500/50"
                      : "bg-amber-400 shadow-amber-500/50";

                  return (
                    <div
                      key={i}
                      style={{ left: `${left}%`, top: `${top}%` }}
                      title={`Cluster ${pt.cluster} | Price: ₹${pt.price} | Unit: ₹${pt.unit_price}`}
                      className={`absolute h-3 w-3 rounded-full ${color} shadow-sm -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-150 ring-2 ring-white/20`}
                    ></div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PER-MEDICINE STATISTICAL BREAKDOWN */}
      {activeTab === "stats" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Medicine-Level Price Ground Truth vs Consensus</h3>
                <p className="text-xs text-slate-500">Comparison of web scraped prices against our statistical pipeline consensus.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3.5">Medicine Name</th>
                    <th className="px-6 py-3.5 text-right">Scraped 1mg</th>
                    <th className="px-6 py-3.5 text-right">Pipeline Branded</th>
                    <th className="px-6 py-3.5 text-right">Scraped DavaIndia</th>
                    <th className="px-6 py-3.5 text-right">Pipeline Generic</th>
                    <th className="px-6 py-3.5 text-right">Branded Acc.</th>
                    <th className="px-6 py-3.5 text-right">Generic Acc.</th>
                    <th className="px-6 py-3.5 text-right">CV (%)</th>
                    <th className="px-6 py-3.5 text-center">Candidates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {per_medicine_breakdown.map((m) => (
                    <tr key={m.medicine} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-900 block">{m.display_name}</span>
                        <span className="text-xs text-slate-400 font-mono">{m.medicine}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-700">₹{m.scraped_1mg_unit_price.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-indigo-700">₹{m.pipeline_branded_unit_price.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right font-mono text-slate-700">₹{m.scraped_davaindia_unit_price.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-emerald-700">₹{m.pipeline_generic_unit_price.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${m.branded_accuracy > 80 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {m.branded_accuracy.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${m.generic_accuracy > 80 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                          {m.generic_accuracy.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-xs text-slate-500">{m.cv_percent.toFixed(1)}%</td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-2 py-1 bg-slate-100 rounded-md text-xs font-semibold text-slate-600">
                          {m.total_candidates} quotes
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LIVE SCRAPED RAW 1MG & DAVAINDIA TABLE */}
      {activeTab === "scraping" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-base">Live Web Scraping Results</h3>
              <p className="text-xs text-slate-500">Live pharmaceutical SKUs fetched from 1mg and Dava India catalogs.</p>
            </div>
            <span className="text-xs font-medium px-3 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg">
              {scraped_sources_live.length} live SKUs
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3.5">Prescribed Medicine</th>
                  <th className="px-6 py-3.5">Source</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Verified SKU Name</th>
                  <th className="px-6 py-3.5">Active Salt Composition</th>
                  <th className="px-6 py-3.5 text-right">Pack Price</th>
                  <th className="px-6 py-3.5 text-center">Pack Size</th>
                  <th className="px-6 py-3.5 text-right">Unit Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {scraped_sources_live.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-6 py-3.5 font-bold text-slate-900">{item.medicine}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold ${item.source === "1mg" ? "bg-orange-50 text-orange-700 border border-orange-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                        {item.source}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs uppercase tracking-wider text-slate-500">{item.type}</td>
                    <td className="px-6 py-3.5 text-slate-800 text-xs max-w-xs truncate" title={item.name}>{item.name}</td>
                    <td className="px-6 py-3.5 text-slate-600 text-xs max-w-xs truncate font-mono" title={(item as any).composition || "-"}>
                      {(item as any).composition || "-"}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-slate-800">₹{item.price.toFixed(2)}</td>
                    <td className="px-6 py-3.5 text-center text-xs text-slate-600">{item.pack_size} units</td>
                    <td className="px-6 py-3.5 text-right font-mono font-bold text-teal-800">₹{item.unit_price.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
