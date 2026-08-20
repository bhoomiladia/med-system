/**
 * TypeScript type definitions mirroring the backend Pydantic schemas.
 */

export interface Ingredient {
  name: string;
  strength: number;
  unit: string;
}

export interface Medicine {
  id: string;
  name: string;
  normalized_name: string | null;
  dosage: string | null;
  frequency: string | null;
  quantity: number | null;
  daily_quantity: number | null;
  monthly_quantity: number | null;
  status: string;
  created_at: string;
}

export interface Composition {
  id: string;
  medicine_id: string;
  raw_text: string | null;
  normalized_composition: {
    ingredients: Array<{
      name: string;
      strength_mg: number;
      original_name: string;
      original_strength: number;
      original_unit: string;
    }>;
    canonical_key: string;
    is_combination: boolean;
  } | null;
  source: string;
  source_url: string | null;
  confidence: number;
  created_at: string;
}

export interface PriceCandidate {
  id: string;
  type: "branded" | "generic";
  candidate_name: string;
  composition: string | null;
  price: number;
  currency: string;
  pack_quantity: number;
  unit_price: number | null;
  source: string;
  source_url: string | null;
  confidence: number;
  is_outlier: boolean;
  retrieved_at: string;
  raw_evidence: string | null;
}

export interface FinalPrice {
  id: string;
  medicine_id: string;
  branded_unit_price: number | null;
  generic_unit_price: number | null;
  branded_pack_price: number | null;
  generic_pack_price: number | null;
  branded_pack_size: number | null;
  generic_pack_size: number | null;
  generic_name: string | null;
  branded_monthly_cost: number | null;
  generic_monthly_cost: number | null;
  monthly_savings: number | null;
  savings_percentage: number | null;
  confidence: number;
  monthly_quantity: number | null;
}

export interface MedicineSavingsDetail {
  medicine: Medicine;
  composition: Composition | null;
  final_price: FinalPrice | null;
  branded_candidates: PriceCandidate[];
  generic_candidates: PriceCandidate[];
}

export interface PrescriptionSavingsResult {
  prescription_id: string;
  total_branded_monthly: number;
  total_generic_monthly: number;
  total_monthly_savings: number;
  total_yearly_savings: number;
  overall_savings_percentage: number;
  medicines_analyzed: number;
  medicines_with_savings: number;
  medicines_unresolved: number;
  average_confidence: number;
  details: MedicineSavingsDetail[];
}

export interface PrescriptionUploadResponse {
  prescription_id: string;
  pipeline_run_id: string;
  status: string;
  message: string;
}

export interface PipelineStatus {
  run_id: string;
  prescription_id: string;
  status: string;
  current_stage: string;
  progress: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

export interface PipelineEvent {
  event: string;
  stage?: string;
  medicine_id?: string;
  medicine_name?: string;
  provider?: string;
  model?: string;
  label?: string;
  shot?: number;
  status?: string;
  message: string;
  progress?: number;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface PrescriptionHistoryItem {
  id: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  ocr_text: string | null;
  ocr_confidence: number | null;
  status: string;
  created_at: string;
  medicine_count: number;
}
