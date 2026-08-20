"use client";

import { useEffect, useState } from "react";
import { getAllPriceCandidates, formatINR } from "@/lib/api";
import type { PriceCandidate } from "@/lib/types";

export default function SourcesPage() {
  const [candidates, setCandidates] = useState<PriceCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "branded" | "generic">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [hideOutliers, setHideOutliers] = useState(false);

  useEffect(() => {
    const fetchSources = async () => {
      try {
        setLoading(true);
        const data = await getAllPriceCandidates(300);
        setCandidates(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sources");
      } finally {
        setLoading(false);
      }
    };
    fetchSources();
  }, []);

  // Available sources list
  const uniqueSources = Array.from(new Set(candidates.map((c) => c.source))).filter(Boolean);

  // Filtered list
  const filteredCandidates = candidates.filter((c) => {
    if (typeFilter !== "all" && c.type !== typeFilter) return false;
    if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
    if (hideOutliers && c.is_outlier) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = c.candidate_name?.toLowerCase().includes(q);
      const matchComp = c.composition?.toLowerCase().includes(q);
      const matchSource = c.source?.toLowerCase().includes(q);
      const matchEvidence = c.raw_evidence?.toLowerCase().includes(q);
      if (!matchName && !matchComp && !matchSource && !matchEvidence) return false;
    }
    return true;
  });

  // Calculate lowest price generic item
  const validGenerics = filteredCandidates.filter((c) => c.type === "generic" && !c.is_outlier && c.price > 0);
  const minGenericUnitPrice = validGenerics.length > 0
    ? Math.min(...validGenerics.map((c) => c.unit_price || c.price / (c.pack_quantity || 1)))
    : null;

  return (
    <div className="pb-16 pt-2">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              Raw Data Sources & Pricing Catalog
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Audit and inspect all price candidates collected across models, web scrapers, and pharmacy sources.
            </p>
          </div>
          <a
            href="/"
            className="self-start sm:self-auto inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 transition-colors shadow-sm"
          >
            <span>+</span>
            <span>New Prescription</span>
          </a>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">Total Price Sources</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{candidates.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Discovered data points</p>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-medium text-teal-600">Generic Alternatives</p>
          <p className="text-2xl font-bold text-teal-700 mt-1">
            {candidates.filter((c) => c.type === "generic").length}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Low-cost equivalents</p>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-medium text-blue-600">Active Store Providers</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{uniqueSources.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Models & pharmacies</p>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-medium text-amber-600">Outliers Filtered</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {candidates.filter((c) => c.is_outlier).length}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">IQR statistical guard</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-xl bg-white border border-slate-200 p-4 mb-6 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search medicine name, composition, store source, or evidence..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                x
              </button>
            )}
          </div>

          {/* Type Filter */}
          <div className="flex items-center rounded-lg bg-slate-50 p-1 border border-slate-200">
            <button
              onClick={() => setTypeFilter("all")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                typeFilter === "all"
                  ? "bg-white text-slate-800 shadow-sm border border-slate-200"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              All ({candidates.length})
            </button>
            <button
              onClick={() => setTypeFilter("generic")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                typeFilter === "generic"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-teal-600 hover:text-teal-700"
              }`}
            >
              Generics
            </button>
            <button
              onClick={() => setTypeFilter("branded")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                typeFilter === "branded"
                  ? "bg-white text-slate-800 shadow-sm border border-slate-200"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Branded
            </button>
          </div>

          {/* Source Dropdown */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:border-teal-500 focus:outline-none"
          >
            <option value="all">All Store / Model Sources</option>
            {uniqueSources.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>

          {/* Outlier checkbox */}
          <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer self-center px-1">
            <input
              type="checkbox"
              checked={hideOutliers}
              onChange={(e) => setHideOutliers(e.target.checked)}
              className="rounded bg-white border-slate-300 text-teal-600 focus:ring-0"
            />
            <span>Hide Outliers</span>
          </label>
        </div>
      </div>

      {/* Content State */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
          <p className="text-sm text-slate-500">Loading raw data sources...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center max-w-lg mx-auto">
          <p className="text-red-600 font-medium">Failed to retrieve data sources</p>
          <p className="text-xs text-slate-500 mt-1">{error}</p>
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="rounded-xl bg-white border border-slate-200 p-12 text-center shadow-sm">
          <p className="text-slate-500 text-sm">No price candidates matched your filter criteria.</p>
          <button
            onClick={() => {
              setSearchQuery("");
              setTypeFilter("all");
              setSourceFilter("all");
              setHideOutliers(false);
            }}
            className="mt-3 text-xs text-teal-600 hover:text-teal-700 underline cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        /* Candidates Table */
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 uppercase tracking-wider text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">Medicine / Equivalent</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-4">Price & Pack</th>
                  <th className="py-3 px-4">Unit Price</th>
                  <th className="py-3 px-4">Price Source & Store</th>
                  <th className="py-3 px-3">Confidence</th>
                  <th className="py-3 px-4">Direct Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {filteredCandidates.map((c) => {
                  const unitPrice = c.unit_price || c.price / (c.pack_quantity || 1);
                  const isLowestGeneric =
                    c.type === "generic" &&
                    !c.is_outlier &&
                    minGenericUnitPrice !== null &&
                    Math.abs(unitPrice - minGenericUnitPrice) < 0.01;

                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        c.is_outlier
                          ? "bg-red-50/50 opacity-60"
                          : isLowestGeneric
                          ? "bg-emerald-50/50"
                          : ""
                      }`}
                    >
                      {/* Name & Composition */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-semibold ${
                              c.is_outlier
                                ? "text-red-500 line-through"
                                : isLowestGeneric
                                ? "text-emerald-700 font-bold"
                                : "text-slate-700"
                            }`}
                          >
                            {c.candidate_name}
                          </span>
                          {isLowestGeneric && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200 whitespace-nowrap">
                              LOWEST PRICE
                            </span>
                          )}
                          {c.is_outlier && (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 border border-red-200">
                              OUTLIER
                            </span>
                          )}
                        </div>
                        {c.composition && (
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-sm">
                            {c.composition}
                          </p>
                        )}
                        {c.raw_evidence && (
                          <p className="text-[10px] text-slate-400 italic mt-0.5 truncate max-w-sm">
                            &quot;{c.raw_evidence}&quot;
                          </p>
                        )}
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                            c.type === "generic"
                              ? "bg-teal-50 text-teal-700 border border-teal-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {c.type}
                        </span>
                      </td>

                      {/* Total Price & Pack */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-700 text-sm">
                          {formatINR(c.price)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {c.pack_quantity} {c.pack_quantity === 1 ? "unit" : "units/pack"}
                        </div>
                      </td>

                      {/* Unit Price */}
                      <td className="py-3.5 px-4">
                        <div
                          className={`font-semibold ${
                            isLowestGeneric
                              ? "text-emerald-700 font-bold text-sm"
                              : "text-slate-700"
                          }`}
                        >
                          {formatINR(unitPrice)}
                        </div>
                        <span className="text-[10px] text-slate-400">per tablet/unit</span>
                      </td>

                      {/* Source & Store */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-600 flex items-center gap-1.5">
                          <span>{c.source || "Web Search"}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(c.retrieved_at).toLocaleString("en-IN", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </div>
                      </td>

                      {/* Confidence */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-12 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded-full"
                              style={{ width: `${Math.round(c.confidence * 100)}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {Math.round(c.confidence * 100)}%
                          </span>
                        </div>
                      </td>

                      {/* Link */}
                      <td className="py-3.5 px-4">
                        {c.source_url ? (
                          <a
                            href={c.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-white px-2.5 py-1 text-xs font-medium text-teal-600 hover:bg-slate-50 hover:text-teal-700 border border-slate-200 transition-colors"
                          >
                            <span>Open</span>
                            <span>↗</span>
                          </a>
                        ) : (
                          <span className="text-slate-300 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
