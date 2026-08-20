"use client";

import { useCallback, useState } from "react";
import { uploadPrescription } from "@/lib/api";
import type { PrescriptionUploadResponse } from "@/lib/types";

interface Props {
  onUploadComplete: (response: PrescriptionUploadResponse) => void;
}

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
];
const MAX_SIZE_MB = 10;

export default function PrescriptionUploader({ onUploadComplete }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback((f: File) => {
    setError(null);

    if (!ALLOWED_TYPES.includes(f.type)) {
      setError("Unsupported file type. Use JPG, PNG, or PDF.");
      return;
    }

    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum ${MAX_SIZE_MB}MB.`);
      return;
    }

    setFile(f);

    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(10);
    setError(null);

    try {
      setProgress(40);
      const response = await uploadPrescription(file);
      setProgress(100);
      onUploadComplete(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Upload failed. Please try again."
      );
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (!uploading) {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".jpg,.jpeg,.png,.pdf";
            input.onchange = (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) handleFile(f);
            };
            input.click();
          }
        }}
        className={`
          relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center
          transition-all duration-300 ease-out
          ${
            isDragging
              ? "border-teal-500 bg-teal-50 scale-[1.02]"
              : file
              ? "border-teal-400 bg-teal-50/50"
              : "border-slate-300 bg-white hover:border-teal-400 hover:bg-teal-50/30"
          }
          ${uploading ? "pointer-events-none opacity-70" : ""}
        `}
      >
        {!file ? (
          <>
            <div className="mb-4">
              <svg
                className="mx-auto h-16 w-16 text-slate-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.032 3.75 3.75 0 013.352 5.56A3.75 3.75 0 0118 19.5H6.75z"
                />
              </svg>
            </div>
            <p className="text-lg font-medium text-slate-700">
              Drop your prescription here
            </p>
            <p className="mt-2 text-sm text-slate-400">
              or click to browse • JPG, PNG, PDF up to {MAX_SIZE_MB}MB
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {preview && (
              <img
                src={preview}
                alt="Prescription preview"
                className="max-h-48 rounded-lg shadow-md border border-slate-200"
              />
            )}
            {!preview && (
              <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-teal-100">
                <svg
                  className="h-12 w-12 text-teal-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
              </div>
            )}
            <div>
              <p className="font-medium text-slate-700">{file.name}</p>
              <p className="text-sm text-slate-400">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {uploading && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-teal-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-center text-sm text-slate-500">
            {progress < 100 ? "Uploading prescription..." : "Upload complete!"}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Upload Button */}
      {file && !uploading && (
        <button
          onClick={handleUpload}
          className="mt-6 w-full rounded-xl bg-teal-700 px-8 py-4
                     text-lg font-semibold text-white shadow-sm
                     transition-all duration-200 hover:bg-teal-600
                     active:scale-[0.98] cursor-pointer"
        >
          Analyze Prescription
        </button>
      )}
    </div>
  );
}
