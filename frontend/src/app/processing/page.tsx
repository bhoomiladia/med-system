"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import ProcessingPipeline from "@/components/ProcessingPipeline";

function ProcessingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const runId = searchParams.get("runId");
  const prescriptionId = searchParams.get("prescriptionId");

  if (!runId || !prescriptionId) {
    return (
      <div className="flex flex-col items-center pt-20">
        <p className="text-slate-500">Missing pipeline information.</p>
        <a href="/" className="mt-4 text-teal-600 hover:text-teal-700 font-medium">
          ← Upload a prescription
        </a>
      </div>
    );
  }

  const handleComplete = () => {
    router.push(`/results?prescriptionId=${prescriptionId}`);
  };

  return (
    <div className="flex flex-col items-center pt-12">
      <ProcessingPipeline
        runId={runId}
        prescriptionId={prescriptionId}
        onComplete={handleComplete}
      />
    </div>
  );
}

export default function ProcessingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center pt-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
        </div>
      }
    >
      <ProcessingContent />
    </Suspense>
  );
}
