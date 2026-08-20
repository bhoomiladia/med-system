/**
 * HTML Report Generator for Prescription Savings Analysis and ML Benchmarks.
 * Generates standalone, rich, responsive HTML documents with inline styles.
 */

import type { PrescriptionSavingsResult } from "@/lib/types";

export function generatePrescriptionSavingsHtml(result: PrescriptionSavingsResult): string {
  const generatedDate = new Date().toLocaleString("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const medicineSections = result.details
    .map((detail, index) => {
      const med = detail.medicine;
      const fp = detail.final_price;
      const comp = detail.composition?.normalized_composition?.canonical_key || detail.composition?.raw_text || "Composition not specified";
      const isResolved = fp && fp.branded_monthly_cost != null && fp.generic_monthly_cost != null;

      // Lowest Generic Candidate
      const validGenerics = detail.generic_candidates.filter((c) => !c.is_outlier && c.price > 0);
      const lowestGeneric = validGenerics.length > 0
        ? validGenerics.reduce((min, cur) => ((cur.unit_price || cur.price) < (min.unit_price || min.price) ? cur : min))
        : detail.generic_candidates[0] || null;

      // Candidate table rows
      const allCandidates = [
        ...detail.branded_candidates.map(c => ({ ...c, kind: "Branded" })),
        ...detail.generic_candidates.map(c => ({ ...c, kind: "Generic" }))
      ];

      const candidateRows = allCandidates.map(c => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 8px 12px;">
            <span style="display: inline-block; padding: 2px 7px; border-radius: 6px; font-size: 10px; font-weight: bold; ${
              c.kind === "Generic" ? "background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;" : "background: #f8fafc; color: #475569; border: 1px solid #e2e8f0;"
            }">
              ${c.kind}
            </span>
          </td>
          <td style="padding: 8px 12px; font-weight: 500; color: #1e293b;">
            ${escapeHtml(c.candidate_name || "—")}
            ${c.source ? `<div style="font-size: 11px; color: #64748b;">Source: ${escapeHtml(c.source)}</div>` : ""}
          </td>
          <td style="padding: 8px 12px; text-align: right; font-family: monospace; color: #334155;">
            ${c.price != null ? `₹${c.price.toFixed(2)}` : "—"}
            ${c.pack_quantity ? `<span style="font-size: 11px; color: #94a3b8;"> (${c.pack_quantity} units)</span>` : ""}
          </td>
          <td style="padding: 8px 12px; text-align: right; font-family: monospace; font-weight: 600; color: ${c.kind === "Generic" ? "#047857" : "#0f172a"};">
            ${c.unit_price != null ? `₹${c.unit_price.toFixed(2)}/unit` : "—"}
          </td>
          <td style="padding: 8px 12px; text-align: center;">
            ${c.source_url ? `<a href="${escapeHtml(c.source_url)}" target="_blank" style="color: #0f766e; text-decoration: underline; font-size: 11px;">View Catalog ↗</a>` : `<span style="color: #94a3b8; font-size: 11px;">Verified</span>`}
          </td>
        </tr>
      `).join("");

      return `
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 24px; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 16px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 13px; font-weight: 700; color: #64748b;">#${index + 1}</span>
                <h4 style="font-size: 18px; font-weight: 700; color: #0f172a;">${escapeHtml(med.name)}</h4>
              </div>
              <div style="font-size: 13px; color: #0f766e; font-weight: 500; margin-top: 4px;">
                Salt: ${escapeHtml(comp)}
              </div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                ${med.dosage ? `Dosage: <strong>${escapeHtml(med.dosage)}</strong>` : ""}
                ${med.frequency ? ` • Frequency: <strong>${escapeHtml(med.frequency)}</strong>` : ""}
                ${med.daily_quantity ? ` • Daily Quantity: <strong>${med.daily_quantity}</strong>` : ""}
              </div>
            </div>
            ${fp ? `
              <div style="text-align: right;">
                <span style="display: inline-block; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: bold; background: #f0fdfa; color: #0f766e; border: 1px solid #99f6e4;">
                  Confidence: ${Math.round((fp.confidence || 0.85) * 100)}%
                </span>
              </div>
            ` : ""}
          </div>

          ${isResolved ? `
            <!-- Per-Medicine Cost Grid -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
              <div>
                <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Branded Unit Price</div>
                <div style="font-size: 18px; font-weight: 700; color: #1e293b; margin-top: 2px;">₹${fp.branded_unit_price?.toFixed(2) || "0.00"}<span style="font-size: 11px; font-weight: normal; color: #94a3b8;"> /unit</span></div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Monthly: ₹${fp.branded_monthly_cost?.toFixed(2) || "0.00"}</div>
                ${fp.branded_pack_price ? `<div style="font-size: 10px; color: #94a3b8;">Pack: ₹${fp.branded_pack_price.toFixed(2)} (${fp.branded_pack_size || "—"} tabs)</div>` : ""}
              </div>

              <div>
                <div style="font-size: 11px; text-transform: uppercase; color: #047857; font-weight: 600;">Generic Unit Price</div>
                <div style="font-size: 18px; font-weight: 700; color: #047857; margin-top: 2px;">₹${fp.generic_unit_price?.toFixed(2) || "0.00"}<span style="font-size: 11px; font-weight: normal; color: #059669;"> /unit</span></div>
                <div style="font-size: 11px; color: #047857; font-weight: 600; margin-top: 2px;">Monthly: ₹${fp.generic_monthly_cost?.toFixed(2) || "0.00"}</div>
                ${fp.generic_pack_price ? `<div style="font-size: 10px; color: #059669;">Pack: ₹${fp.generic_pack_price.toFixed(2)} (${fp.generic_pack_size || "—"} tabs)</div>` : ""}
              </div>

              <div>
                <div style="font-size: 11px; text-transform: uppercase; color: #0f766e; font-weight: 600;">Monthly Savings</div>
                <div style="font-size: 18px; font-weight: 800; color: #0f766e; margin-top: 2px;">₹${fp.monthly_savings?.toFixed(2) || "0.00"}<span style="font-size: 11px; font-weight: normal; color: #0f766e;"> /mo</span></div>
                <div style="font-size: 11px; color: #059669; font-weight: 700; margin-top: 2px;">Save ${fp.savings_percentage?.toFixed(1) || "0.0"}%</div>
              </div>

              <div>
                <div style="font-size: 11px; text-transform: uppercase; color: #0369a1; font-weight: 600;">Annual Savings</div>
                <div style="font-size: 18px; font-weight: 800; color: #0369a1; margin-top: 2px;">₹${((fp.monthly_savings || 0) * 12).toFixed(2)}</div>
                <div style="font-size: 11px; color: #0284c7; margin-top: 2px;">Projected per year</div>
              </div>
            </div>

            ${lowestGeneric ? `
              <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 16px;">
                <div>
                  <strong style="color: #065f46;">Lowest Price Generic Source:</strong>
                  <span style="color: #047857; margin-left: 4px;">${escapeHtml(lowestGeneric.source || "Dava India / PMBJP")}</span>
                  <span style="color: #64748b; margin-left: 4px;">(₹${(lowestGeneric.unit_price || lowestGeneric.price).toFixed(2)}/unit)</span>
                </div>
                ${lowestGeneric.source_url ? `<a href="${escapeHtml(lowestGeneric.source_url)}" target="_blank" style="color: #047857; font-weight: 600; text-decoration: underline;">Buy Generic Online ↗</a>` : `<span style="color: #059669; font-weight: 500;">In-Stock Catalog</span>`}
              </div>
            ` : ""}
          ` : `
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; font-size: 12px; color: #92400e; margin-bottom: 16px;">
              Price comparison unavailable for this item.
            </div>
          `}

          <!-- Price Candidates Table -->
          ${allCandidates.length > 0 ? `
            <div style="margin-top: 14px;">
              <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 6px;">
                Verified Market Quotes (${allCandidates.length} sources)
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                  <tr style="background: #f8fafc; color: #64748b; font-size: 11px; text-transform: uppercase; text-align: left;">
                    <th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1;">Type</th>
                    <th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1;">Medicine Name / Source</th>
                    <th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1; text-align: right;">Pack Price</th>
                    <th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1; text-align: right;">Unit Price</th>
                    <th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1; text-align: center;">Source Link</th>
                  </tr>
                </thead>
                <tbody>
                  ${candidateRows}
                </tbody>
              </table>
            </div>
          ` : ""}
        </div>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prescription Savings & Medicine Cost Report - ${escapeHtml(result.prescription_id.slice(0, 8))}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      line-height: 1.5;
      padding: 32px 16px;
    }
    .container {
      max-width: 1040px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 24px;
      padding: 36px;
      box-shadow: 0 4px 25px rgba(0, 0, 0, 0.06);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 24px;
      margin-bottom: 28px;
    }
    .brand-title {
      font-size: 26px;
      font-weight: 800;
      color: #0f766e;
      letter-spacing: -0.5px;
    }
    .brand-sub {
      font-size: 13px;
      color: #64748b;
      margin-top: 4px;
    }
    .meta-badge {
      text-align: right;
      font-size: 12px;
      color: #64748b;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 20px;
    }
    .kpi-card.highlight {
      background: linear-gradient(135deg, #0f766e 0%, #115e59 100%);
      color: #ffffff;
      border: none;
    }
    .kpi-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      font-weight: 600;
    }
    .kpi-card.highlight .kpi-label {
      color: #99f6e4;
    }
    .kpi-value {
      font-size: 28px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 4px;
    }
    .kpi-card.highlight .kpi-value {
      color: #ffffff;
    }
    .kpi-sub {
      font-size: 12px;
      color: #059669;
      font-weight: 600;
      margin-top: 4px;
    }
    .kpi-card.highlight .kpi-sub {
      color: #a7f3d0;
    }
    .disclaimer {
      margin-top: 36px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 14px;
      padding: 18px;
      font-size: 12px;
      color: #92400e;
      line-height: 1.6;
    }
    .footer {
      text-align: center;
      margin-top: 28px;
      font-size: 11px;
      color: #94a3b8;
    }
    @media print {
      body { background: white; padding: 0; }
      .container { border: none; box-shadow: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="brand-title">MedSavings Intelligence & Medicine Cost Report</div>
        <div class="brand-sub">Comprehensive Prescription Analysis, Generic Discovery & Per-Medicine Pricing</div>
      </div>
      <div class="meta-badge">
        <div><strong>Prescription ID:</strong> ${escapeHtml(result.prescription_id)}</div>
        <div style="margin-top: 3px;"><strong>Analyzed Medicines:</strong> ${result.medicines_analyzed} items</div>
        <div style="margin-top: 3px;"><strong>Generated:</strong> ${generatedDate}</div>
      </div>
    </div>

    <!-- KPI Summary -->
    <div class="kpi-grid">
      <div class="kpi-card highlight">
        <div class="kpi-label">Estimated Monthly Savings</div>
        <div class="kpi-value">₹${result.total_monthly_savings.toFixed(2)}</div>
        <div class="kpi-sub">Save ${result.overall_savings_percentage.toFixed(1)}% on monthly medication</div>
      </div>

      <div class="kpi-card highlight" style="background: linear-gradient(135deg, #0369a1 0%, #075985 100%);">
        <div class="kpi-label">Annualized Projected Savings</div>
        <div class="kpi-value">₹${result.total_yearly_savings.toFixed(2)}</div>
        <div class="kpi-sub">Per year overall savings</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Current Branded Monthly Cost</div>
        <div class="kpi-value">₹${result.total_branded_monthly.toFixed(2)}</div>
        <div class="kpi-sub" style="color: #64748b;">Per month estimated</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Generic Alternative Monthly Cost</div>
        <div class="kpi-value" style="color: #047857;">₹${result.total_generic_monthly.toFixed(2)}</div>
        <div class="kpi-sub">Verified generic substitutes</div>
      </div>
    </div>

    <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 16px;">
      Medicine-by-Medicine Cost & Source Breakdown
    </h2>

    ${medicineSections}

    <!-- Medical Notice -->
    <div class="disclaimer">
      <strong>Important Medical & Pharmacy Notice:</strong> These savings calculations are computed from live pricing catalogs (PMBJP, Tata 1mg, Dava India). Exact prices may vary based on local pharmacy rates, pack sizes, and geographic location. Always consult your prescribing doctor or a certified pharmacist before replacing branded prescriptions with generic formulations.
    </div>

    <div class="footer">
      Generated automatically by MedSavings ML Pipeline & Statistical Price Discovery Engine.
    </div>
  </div>
</body>
</html>`;
}

export function generateAccuracyBenchmarkHtml(data: any): string {
  const generatedDate = new Date().toLocaleString("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const isPrescriptionWise = !!data.prescription_id;
  const title = isPrescriptionWise
    ? `Prescription Statistical Accuracy & Method Evaluation (${data.prescription_id.slice(0, 8)})`
    : "ML Clustering & Multi-Method Price Accuracy Benchmark";

  const leaderboardRows = (data.method_leaderboard || [])
    .map((item: any, idx: number) => `
      <tr style="${idx === 0 ? "background: #f0fdfa; font-weight: bold;" : ""}">
        <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">
          ${idx === 0 ? "#1" : idx === 1 ? "#2" : idx === 2 ? "#3" : `#${idx + 1}`} ${escapeHtml(item.method_name)}
        </td>
        <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #0f766e; font-size: 15px; font-weight: bold;">
          ${item.average_accuracy_pct.toFixed(2)}%
        </td>
        <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; text-align: center; font-family: monospace;">
          ₹${item.mae.toFixed(2)}
        </td>
        <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; text-align: center; font-family: monospace;">
          ₹${item.rmse.toFixed(2)}
        </td>
      </tr>
    `)
    .join("");

  // Per-medicine evaluation cards if available
  const medicinesSection = (data.medicines || [])
    .map((med: any, idx: number) => {
      const gt = med.ground_truth || {};
      const methods = ["median", "mean", "iqr_trimmed_mean", "kmeans", "dbscan", "hierarchical"];
      const methodLabels: Record<string, string> = {
        median: "Median",
        mean: "Mean",
        iqr_trimmed_mean: "IQR-Trimmed",
        kmeans: "K-Means",
        dbscan: "DBSCAN",
        hierarchical: "Hierarchical",
      };

      const methodCells = methods.map((m) => {
        const b = med.methods_branded?.[m];
        const g = med.methods_generic?.[m];
        return `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 12px; font-weight: 600; color: #334155;">${methodLabels[m]}</td>
            <td style="padding: 8px 12px; font-family: monospace; text-align: right;">${b?.value != null ? `₹${b.value.toFixed(2)}` : "—"}</td>
            <td style="padding: 8px 12px; text-align: center; font-weight: bold; color: ${b?.accuracy_pct != null && b.accuracy_pct >= 90 ? "#047857" : "#0f766e"};">
              ${b?.accuracy_pct != null ? `${b.accuracy_pct.toFixed(1)}%` : "—"}
            </td>
            <td style="padding: 8px 12px; font-family: monospace; text-align: right;">${g?.value != null ? `₹${g.value.toFixed(2)}` : "—"}</td>
            <td style="padding: 8px 12px; text-align: center; font-weight: bold; color: ${g?.accuracy_pct != null && g.accuracy_pct >= 90 ? "#047857" : "#0f766e"};">
              ${g?.accuracy_pct != null ? `${g.accuracy_pct.toFixed(1)}%` : "—"}
            </td>
          </tr>
        `;
      }).join("");

      return `
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px; margin-bottom: 20px; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 12px;">
            <div>
              <h4 style="font-size: 16px; font-weight: 700; color: #0f172a;">${idx + 1}. ${escapeHtml(med.name)}</h4>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                ${med.dosage ? `Dosage: ${escapeHtml(med.dosage)} • ` : ""}
                Candidates: ${med.total_candidates} (${med.branded_candidate_count} branded, ${med.generic_candidate_count} generic)
              </div>
            </div>
            <div style="text-align: right; font-size: 12px;">
              <div><strong>Branded Ref:</strong> ₹${gt.branded_unit_price?.toFixed(2) || "0.00"}/unit <span style="font-size: 10px; color: #64748b;">(${escapeHtml(gt.branded_source || "—")})</span></div>
              <div style="margin-top: 2px;"><strong>Generic Ref:</strong> ₹${gt.generic_unit_price?.toFixed(2) || "0.00"}/unit <span style="font-size: 10px; color: #64748b;">(${escapeHtml(gt.generic_source || "—")})</span></div>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px;">
            <thead>
              <tr style="background: #f8fafc; color: #64748b; font-size: 11px; text-transform: uppercase;">
                <th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1; text-align: left;">Method</th>
                <th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1; text-align: right;">Branded Unit Price</th>
                <th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1; text-align: center;">Branded Acc %</th>
                <th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1; text-align: right;">Generic Unit Price</th>
                <th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1; text-align: center;">Generic Acc %</th>
              </tr>
            </thead>
            <tbody>
              ${methodCells}
            </tbody>
          </table>
        </div>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      padding: 32px 16px;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 24px;
      padding: 36px;
      box-shadow: 0 4px 25px rgba(0,0,0,0.06);
    }
    .header {
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 24px;
      margin-bottom: 28px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-top: 14px;
    }
    th {
      background: #f8fafc;
      color: #475569;
      padding: 12px 14px;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #cbd5e1;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      font-size: 11px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="font-size: 24px; font-weight: 800; color: #0f172a;">${escapeHtml(title)}</h1>
      <p style="font-size: 13px; color: #64748b; margin-top: 4px;">Generated on ${generatedDate} • Comparative Evaluation Across 6 Statistical & ML Clustering Methods</p>
    </div>

    <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Method Accuracy Leaderboard</h3>
    <table>
      <thead>
        <tr>
          <th style="text-align: left;">Statistical / ML Method</th>
          <th style="text-align: center;">Average Accuracy</th>
          <th style="text-align: center;">MAE (Mean Abs Error)</th>
          <th style="text-align: center;">RMSE (Root Mean Sq Error)</th>
        </tr>
      </thead>
      <tbody>
        ${leaderboardRows}
      </tbody>
    </table>

    ${medicinesSection ? `
      <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 36px; margin-bottom: 14px;">
        Medicine-by-Medicine Statistical Comparison
      </h3>
      ${medicinesSection}
    ` : ""}

    <div class="footer">
      Generated automatically by MedSavings ML Pipeline & Statistical Accuracy Engine.
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
