"use client";

import { useState } from "react";
import { formatINR, formatPercent } from "@/lib/api";
import type { MedicineSavingsDetail } from "@/lib/types";
import ConfidenceBadge from "./ConfidenceBadge";
import PriceSources from "./PriceSources";

interface Props {
  detail: MedicineSavingsDetail;
}

export default function MedicineCard({ detail }: Props) {
  const [showSources, setShowSources] = useState(false);
  const { medicine, composition, final_price, branded_candidates, generic_candidates } = detail;

  const compositionText = composition?.raw_text || "Composition unavailable";
  const isResolved = final_price && final_price.branded_monthly_cost && final_price.generic_monthly_cost;

  // Calculate savings bar width
  const savingsWidth = final_price?.savings_percentage
    ? Math.min(100, final_price.savings_percentage)
    : 0;

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-slate-300">
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">{medicine.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{compositionText}</p>
            {medicine.frequency && (
              <p className="mt-0.5 text-xs text-slate-400">
                {medicine.frequency}
                {medicine.daily_quantity && ` • ${medicine.daily_quantity} unit${medicine.daily_quantity > 1 ? "s" : ""}/day`}
              </p>
            )}
          </div>
          {final_price && (
            <ConfidenceBadge confidence={final_price.confidence} size="md" />
          )}
        </div>

        {isResolved ? (
          <>
            {/* Price comparison */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs font-medium text-slate-400">Branded</p>
                <p className="text-lg font-bold text-slate-700">
                  {formatINR(final_price.branded_unit_price)}
                </p>
                <p className="text-xs text-slate-400">/unit</p>
              </div>
              <div>
                <p className="text-xs font-medium text-teal-600">Generic</p>
                <p className="text-lg font-bold text-teal-700">
                  {formatINR(final_price.generic_unit_price)}
                </p>
                <p className="text-xs text-teal-500/70">/unit</p>
              </div>
              <div>
                <p className="text-xs font-medium text-amber-600">Savings</p>
                <p className="text-lg font-bold text-amber-600">
                  {formatPercent(final_price.savings_percentage)}
                </p>
                <p className="text-xs text-amber-500/70">
                  {formatINR(final_price.monthly_savings)}/mo
                </p>
              </div>
            </div>

            {/* Savings bar */}
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-teal-500 transition-all duration-1000"
                  style={{ width: `${savingsWidth}%` }}
                />
              </div>
            </div>

            {/* Monthly costs */}
            <div className="mt-3 flex justify-between text-xs text-slate-400">
              <span>
                Monthly: {formatINR(final_price.branded_monthly_cost)} → {formatINR(final_price.generic_monthly_cost)}
              </span>
              {final_price.generic_name && (
                <span className="text-teal-600">
                  {final_price.generic_name}
                </span>
              )}
            </div>

            {/* Lowest price source banner */}
            {(() => {
              // Find lowest valid generic candidate
              const validGenerics = generic_candidates.filter((c) => !c.is_outlier && c.price > 0);
              const lowestGeneric = validGenerics.length > 0
                ? validGenerics.reduce((min, cur) => ((cur.unit_price || cur.price) < (min.unit_price || min.price) ? cur : min))
                : generic_candidates[0] || null;

              if (!lowestGeneric) return null;

              return (
                <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-slate-500">Lowest Price Source:</span>
                    <span className="font-semibold text-emerald-700">
                      {lowestGeneric.source || "Generic Pharmacy"}
                    </span>
                    <span className="text-slate-400">
                      ({formatINR(lowestGeneric.unit_price || lowestGeneric.price)}/unit)
                    </span>
                  </div>
                  {lowestGeneric.source_url ? (
                    <a
                      href={lowestGeneric.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-600 hover:text-teal-700 font-medium underline flex items-center gap-1"
                    >
                      Buy / View ↗
                    </a>
                  ) : (
                    <span className="text-slate-400 text-[10px]">Verified Store</span>
                  )}
                </div>
              );
            })()}

            {/* Pack info */}
            {(final_price.branded_pack_price || final_price.generic_pack_price) && (
              <div className="mt-2 flex gap-3 text-xs text-slate-400">
                {final_price.branded_pack_price && (
                  <span>
                    Branded pack: {formatINR(final_price.branded_pack_price)}
                    {final_price.branded_pack_size && ` / ${final_price.branded_pack_size}`}
                  </span>
                )}
                {final_price.generic_pack_price && (
                  <span>
                    Generic pack: {formatINR(final_price.generic_pack_price)}
                    {final_price.generic_pack_size && ` / ${final_price.generic_pack_size}`}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="mt-5 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-sm text-amber-700">
              Price comparison unavailable for this medicine
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {!composition ? "Composition could not be verified" : "Insufficient price data"}
            </p>
          </div>
        )}
      </div>

      {/* Source toggle */}
      {(branded_candidates.length > 0 || generic_candidates.length > 0) && (
        <div className="border-t border-slate-100">
          <button
            onClick={() => setShowSources(!showSources)}
            className="flex w-full items-center justify-between px-5 py-3 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <span>
              View Sources ({branded_candidates.length + generic_candidates.length})
            </span>
            <svg
              className={`h-4 w-4 transition-transform ${showSources ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showSources && (
            <PriceSources
              branded={branded_candidates}
              generic={generic_candidates}
            />
          )}
        </div>
      )}
    </div>
  );
}
