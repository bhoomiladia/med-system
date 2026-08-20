/**
 * API client for communicating with the FastAPI backend.
 */

import type {
  PrescriptionUploadResponse,
  PrescriptionSavingsResult,
  PipelineStatus,
  PipelineEvent,
  Medicine,
  PriceCandidate,
} from "./types";

const API_BASE = typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, error.detail || res.statusText);
  }

  return res.json();
}

/**
 * Upload a prescription file and start the processing pipeline.
 */
export async function uploadPrescription(
  file: File
): Promise<PrescriptionUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const url = `${API_BASE}/api/prescriptions/upload`;
  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, error.detail || res.statusText);
  }

  return res.json();
}

/**
 * Get prescription history.
 */
export async function getPrescriptions(
  limit: number = 50,
  offset: number = 0
): Promise<import("./types").PrescriptionHistoryItem[]> {
  return request<import("./types").PrescriptionHistoryItem[]>(
    `/api/prescriptions?limit=${limit}&offset=${offset}`
  );
}

/**
 * Get current pipeline status (polling fallback).
 */
export async function getPipelineStatus(
  runId: string
): Promise<PipelineStatus> {
  return request<PipelineStatus>(`/api/pipeline/${runId}/status`);
}

/**
 * Get single prescription details.
 */
export async function getPrescription(
  prescriptionId: string
): Promise<import("./types").PrescriptionHistoryItem> {
  return request<import("./types").PrescriptionHistoryItem>(
    `/api/prescriptions/${prescriptionId}`
  );
}

/**
 * Get the full savings results for a prescription.
 */
export async function getResults(
  prescriptionId: string
): Promise<PrescriptionSavingsResult> {
  return request<PrescriptionSavingsResult>(
    `/api/results/${prescriptionId}`
  );
}

/**
 * Get all medicines for a prescription.
 */
export async function getMedicines(
  prescriptionId: string
): Promise<Medicine[]> {
  return request<Medicine[]>(
    `/api/medicines/prescription/${prescriptionId}`
  );
}

/**
 * Get all raw price candidate sources across medicines.
 */
export async function getAllPriceCandidates(
  limit: number = 200
): Promise<PriceCandidate[]> {
  return request<PriceCandidate[]>(
    `/api/prices/candidates/all?limit=${limit}`
  );
}

/**
 * Subscribe to pipeline events via Server-Sent Events.
 */
export function subscribeToPipeline(
  runId: string,
  onEvent: (event: PipelineEvent) => void,
  onError?: (error: Event) => void,
  onComplete?: () => void
): EventSource {
  const url = `${API_BASE}/api/pipeline/${runId}/events`;
  const eventSource = new EventSource(url);

  // Listen for specific event types
  const eventTypes = [
    "stage_start",
    "stage_complete",
    "medicine_progress",
    "llm_call",
    "clustering_analysis",
    "error",
    "complete",
    "heartbeat",
  ];

  for (const type of eventTypes) {
    eventSource.addEventListener(type, (e: MessageEvent) => {
      try {
        if (!e.data || e.data === "undefined") return;
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data) {
          onEvent(data);
        }

        if (type === "complete") {
          eventSource.close();
          onComplete?.();
        }
      } catch (err) {
        console.error("Failed to parse SSE event:", e.data, err);
      }
    });
  }

  // Generic message listener fallback
  eventSource.onmessage = (e: MessageEvent) => {
    try {
      if (!e.data || e.data === "undefined") return;
      const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      if (data) {
        onEvent(data);
        if (data.event === "complete") {
          eventSource.close();
          onComplete?.();
        }
      }
    } catch {
      // Ignore heartbeat or non-JSON messages
    }
  };

  // Listen for close event
  eventSource.addEventListener("close", () => {
    eventSource.close();
    onComplete?.();
  });

  eventSource.onerror = (e) => {
    console.error("SSE connection error:", e);
    onError?.(e);
  };

  return eventSource;
}

/**
 * Format currency in INR.
 */
export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/**
 * Format percentage.
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

/**
 * Get prescription-wise accuracy and statistical method comparisons.
 */
export async function getPrescriptionAccuracy(
  prescriptionId: string
): Promise<any> {
  return request<any>(`/api/evaluation/prescription/${prescriptionId}`);
}

/**
 * Re-evaluate prescription accuracy using custom user-supplied ground truth ("Set Data").
 */
export async function evaluatePrescriptionAccuracy(
  prescriptionId: string,
  groundTruthMap: Record<string, { branded: number; generic: number }>
): Promise<any> {
  return request<any>(`/api/evaluation/prescription/${prescriptionId}/evaluate`, {
    method: "POST",
    body: JSON.stringify(groundTruthMap),
  });
}
