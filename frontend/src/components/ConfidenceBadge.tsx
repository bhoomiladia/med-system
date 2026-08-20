"use client";

import type { FinalPrice } from "@/lib/types";
import { formatINR, formatPercent } from "@/lib/api";

interface Props {
  confidence: number;
  size?: "sm" | "md" | "lg";
}

export default function ConfidenceBadge({ confidence, size = "sm" }: Props) {
  const pct = Math.round(confidence * 100);
  let color: string;
  let dotColor: string;
  let label: string;

  if (pct >= 80) {
    color = "bg-emerald-50 text-emerald-700 ring-emerald-200";
    dotColor = "bg-emerald-500";
    label = "High";
  } else if (pct >= 60) {
    color = "bg-amber-50 text-amber-700 ring-amber-200";
    dotColor = "bg-amber-500";
    label = "Medium";
  } else {
    color = "bg-red-50 text-red-700 ring-red-200";
    dotColor = "bg-red-500";
    label = "Low";
  }

  const sizeClass = size === "lg" ? "px-3 py-1.5 text-sm" : size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ring-1 font-medium ${color} ${sizeClass}`}
      title={`Confidence: ${pct}% — Based on source count, price agreement, and data quality`}
    >
      <span className={`inline-flex h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {pct}%
    </span>
  );
}
