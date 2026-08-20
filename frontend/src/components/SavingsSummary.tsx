"use client";

import { formatINR, formatPercent } from "@/lib/api";
import type { PrescriptionSavingsResult } from "@/lib/types";

interface Props {
  result: PrescriptionSavingsResult;
}

export default function SavingsSummary({ result }: Props) {
  return (
    <div className="w-full">
      {/* Main savings hero */}
      <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-8 shadow-sm">
        {/* Accent bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-teal-600 rounded-l-2xl" />

        <div className="relative z-10 pl-4">
          <p className="text-sm font-medium uppercase tracking-wider text-teal-700">
            Estimated Monthly Savings
          </p>
          <p className="mt-2 text-5xl font-bold text-slate-800">
            {formatINR(result.total_monthly_savings)}
            <span className="ml-2 text-xl font-normal text-slate-500">
              /month
            </span>
          </p>
          <p className="mt-1 text-lg text-slate-400">
            {formatINR(result.total_yearly_savings)}/year potential savings
          </p>

          <div className="mt-6 flex items-center gap-2">
            <div className="flex h-10 items-center rounded-full bg-teal-50 px-4 border border-teal-200">
              <span className="text-lg font-bold text-teal-700">
                {formatPercent(result.overall_savings_percentage)}
              </span>
            </div>
            <span className="text-sm text-slate-500">potential savings</span>
          </div>
        </div>
      </div>

      {/* Cost comparison */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-white p-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Current Branded Cost
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-800">
            {formatINR(result.total_branded_monthly)}
          </p>
          <p className="text-sm text-slate-400">/month</p>
        </div>

        <div className="rounded-xl bg-white p-5 border border-teal-200 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-teal-600">
            Generic Equivalent Cost
          </p>
          <p className="mt-2 text-2xl font-bold text-teal-700">
            {formatINR(result.total_generic_monthly)}
          </p>
          <p className="text-sm text-teal-500/70">/month</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-white p-3 text-center border border-slate-200">
          <p className="text-2xl font-bold text-slate-800">
            {result.medicines_analyzed}
          </p>
          <p className="text-xs text-slate-500">Medicines</p>
        </div>
        <div className="rounded-lg bg-white p-3 text-center border border-slate-200">
          <p className="text-2xl font-bold text-emerald-600">
            {result.medicines_with_savings}
          </p>
          <p className="text-xs text-slate-500">With Savings</p>
        </div>
        <div className="rounded-lg bg-white p-3 text-center border border-slate-200">
          <p className="text-2xl font-bold text-amber-600">
            {result.medicines_unresolved}
          </p>
          <p className="text-xs text-slate-500">Unresolved</p>
        </div>
      </div>
    </div>
  );
}
