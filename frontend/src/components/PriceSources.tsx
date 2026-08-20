"use client";

import { formatINR } from "@/lib/api";
import type { PriceCandidate } from "@/lib/types";

interface Props {
  branded: PriceCandidate[];
  generic: PriceCandidate[];
}

export default function PriceSources({ branded, generic }: Props) {
  // Find min unit prices
  const validGenerics = generic.filter((c) => !c.is_outlier && c.price > 0);
  const minGenericUnitPrice = validGenerics.length > 0
    ? Math.min(...validGenerics.map((c) => c.unit_price || c.price / (c.pack_quantity || 1)))
    : null;

  return (
    <div className="px-5 pb-4 space-y-4">
      {branded.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Branded Price Sources ({branded.length})
          </p>
          <div className="space-y-1.5">
            {branded.map((c) => (
              <SourceRow key={c.id} candidate={c} isLowest={false} />
            ))}
          </div>
        </div>
      )}

      {generic.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-teal-600">
            Generic Price Sources ({generic.length})
          </p>
          <div className="space-y-1.5">
            {generic.map((c) => {
              const unitPrice = c.unit_price || c.price / (c.pack_quantity || 1);
              const isLowest = !c.is_outlier && minGenericUnitPrice !== null && Math.abs(unitPrice - minGenericUnitPrice) < 0.01;
              return <SourceRow key={c.id} candidate={c} isLowest={isLowest} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SourceRow({ candidate, isLowest }: { candidate: PriceCandidate; isLowest?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs border transition-all ${
        candidate.is_outlier
          ? "bg-red-50 border-red-200 opacity-60"
          : isLowest
          ? "bg-emerald-50 border-emerald-200 font-medium"
          : "bg-slate-50 border-slate-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`font-medium ${candidate.is_outlier ? "text-red-500 line-through" : isLowest ? "text-emerald-700" : "text-slate-700"}`}>
          {candidate.candidate_name}
        </span>
        <span className="text-slate-300">•</span>
        <span className="text-slate-500">{candidate.source}</span>
        {isLowest && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
            LOWEST PRICE
          </span>
        )}
        {candidate.is_outlier && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-600 border border-red-200">
            outlier
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className={isLowest ? "text-emerald-700 font-bold" : "text-slate-700"}>
          {formatINR(candidate.price)}
        </span>
        <span className="text-slate-400">/ {candidate.pack_quantity}</span>
        {candidate.unit_price && (
          <span className="text-slate-400 text-[10px]">
            ({formatINR(candidate.unit_price)}/unit)
          </span>
        )}
        {candidate.source_url && (
          <a
            href={candidate.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-600 hover:text-teal-700 font-bold"
            title="Open Pharmacy Source Link"
          >
            ↗
          </a>
        )}
      </div>
    </div>
  );
}
