"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PrescriptionUploader from "@/components/PrescriptionUploader";
import type { PrescriptionUploadResponse } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();

  const handleUploadComplete = (response: PrescriptionUploadResponse) => {
    router.push(
      `/processing?runId=${response.pipeline_run_id}&prescriptionId=${response.prescription_id}`
    );
  };

  return (
    <div className="flex flex-col items-center pt-8 pb-16">
      {/* Hero */}
      <div className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-teal-50 px-4 py-1.5 border border-teal-200">
          <span className="h-2 w-2 rounded-full bg-teal-500" />
          <span className="text-sm font-medium text-teal-700">
            Prescription Savings Platform
          </span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight">
          <span className="text-slate-800">
            Medicine Savings
          </span>
          <br />
          <span className="text-teal-700">
            Intelligence
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg text-slate-500 leading-relaxed">
          Upload your prescription and discover how much you can save with
          equivalent generic medicines. Verified compositions, real prices,
          transparent sources.
        </p>
      </div>

      {/* Uploader */}
      <PrescriptionUploader onUploadComplete={handleUploadComplete} />

      {/* How it works */}
      <div className="mt-20 w-full max-w-4xl">
        <h2 className="mb-8 text-center text-xl font-semibold text-slate-700">
          How It Works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              step: "01",
              title: "Upload",
              desc: "Upload your prescription image or PDF",
              icon: (
                <svg className="h-6 w-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              ),
            },
            {
              step: "02",
              title: "Analyze",
              desc: "Medicines are extracted & compositions verified",
              icon: (
                <svg className="h-6 w-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              ),
            },
            {
              step: "03",
              title: "Compare",
              desc: "Multi-source price discovery & statistical validation",
              icon: (
                <svg className="h-6 w-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              ),
            },
            {
              step: "04",
              title: "Save",
              desc: "See exactly how much you can save monthly",
              icon: (
                <svg className="h-6 w-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
              ),
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-xl bg-white p-5 border border-slate-200 hover:border-teal-300 hover:shadow-sm transition-all group"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 group-hover:bg-teal-100 transition-colors">
                {item.icon}
              </div>
              <div className="text-xs font-bold text-teal-600/70 mb-1">
                STEP {item.step}
              </div>
              <h3 className="font-semibold text-slate-800">{item.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Key features */}
      <div className="mt-16 w-full max-w-3xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          {[
            { label: "Verified Compositions", detail: "From 1mg product pages" },
            { label: "Statistical Consensus", detail: "IQR outlier removal" },
            { label: "Full Transparency", detail: "Every price has a source" },
          ].map((feature) => (
            <div key={feature.label} className="rounded-lg bg-white p-4 border border-slate-200">
              <p className="font-medium text-slate-700 text-sm">{feature.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{feature.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
