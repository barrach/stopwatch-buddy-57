/**
 * Hybrid HH-Equivalent Calculation for Charts
 *
 * All categories are converted to the same unit (HH-equivalent) before
 * computing percentages, eliminating distortion from mixing units.
 *
 * For NPE and "Aguardando Liberação de PT":
 *   value = qty × duracao_horas (real HH)
 * For all other categories:
 *   value = qty × HH_medio_do_dia (HH-equivalent)
 *
 * Where HH_medio = sum(all qty × duration) / sum(all qty) per day.
 *
 * Charts compute: % = value / total_HH_equivalent × 100
 */

import { canonicalDescription, normalizeTime } from "@/lib/chartConstants";

/** Descriptions that use real HH (man-hours) model */
const HH_DESCRIPTIONS = new Set([
  "Aguardando Liberação de PT",
  "Fatores Climáticos e Consequências",
  "Interferências Operacionais",
]);

export function isHourlyAvgDescription(desc: string): boolean {
  return HH_DESCRIPTIONS.has(desc);
}

/** Get the raw HH for a single record (qty × duration, default 1h) */
function rawRecordHH(r: any): number {
  const qty = r.quantidade || 0;
  const duracao = r.duracao_horas != null ? Number(r.duracao_horas) : 1.0;
  return qty * duracao;
}

/**
 * Compute the average HH per sample for each day.
 * Returns Map<date, hhMedio> where hhMedio = totalHH / totalQty for the day.
 */
export function computeDailyHHMedio(records: any[]): Map<string, number> {
  const hhByDay = new Map<string, number>();
  const qtyByDay = new Map<string, number>();

  for (const r of records) {
    const day = r.data || "";
    const qty = r.quantidade || 0;
    const hh = rawRecordHH(r);
    hhByDay.set(day, (hhByDay.get(day) || 0) + hh);
    qtyByDay.set(day, (qtyByDay.get(day) || 0) + qty);
  }

  const medioByDay = new Map<string, number>();
  for (const [day, totalHH] of hhByDay) {
    const totalQty = qtyByDay.get(day) || 1;
    medioByDay.set(day, totalQty > 0 ? totalHH / totalQty : 1.0);
  }
  return medioByDay;
}

/**
 * Get the HH-equivalent value for a record, normalized to a common unit.
 * - Special categories (PT/NPE): real HH = qty × duration
 * - Normal categories: HH-equivalent = qty × daily average HH per sample
 *
 * If no dailyHHMedio is provided, falls back to raw qty (hhMedio=1).
 */
export function getRecordHHNormalized(r: any, dailyHHMedio: Map<string, number>): number {
  const desc = canonicalDescription(r.descricao || "Sem descrição");
  const qty = r.quantidade || 0;
  if (HH_DESCRIPTIONS.has(desc)) {
    const duracao = r.duracao_horas != null ? Number(r.duracao_horas) : 1.0;
    return qty * duracao;
  }
  const hhMedio = dailyHHMedio.get(r.data || "") ?? 1.0;
  return qty * hhMedio;
}

/**
 * Legacy helper — kept for backward compatibility.
 * Equivalent to getRecordHHNormalized with hhMedio=1 for normal categories.
 */
export function getRecordHH(r: any): number {
  const desc = canonicalDescription(r.descricao || "Sem descrição");
  const qty = r.quantidade || 0;
  if (HH_DESCRIPTIONS.has(desc)) {
    const duracao = r.duracao_horas != null ? Number(r.duracao_horas) : 1.0;
    return qty * duracao;
  }
  return qty;
}

/**
 * Compute percentage for each description using HH-equivalent model:
 * - HH-model categories: value = qty × duration (real HH)
 * - Normal categories: value = qty × daily HH average (HH-equivalent)
 * - % = value / total_HH_equivalent × 100
 *
 * Returns { [description]: percentValue } summing to ~100%.
 */
export function computeHourlyAdjustedPercentages(
  groupRecords: any[],
  descriptions: string[]
): Record<string, number> {
  if (groupRecords.length === 0) {
    return Object.fromEntries(descriptions.map(d => [d, 0]));
  }

  // Compute daily HH medio from the group's records
  const dailyHHMedio = computeDailyHHMedio(groupRecords);

  // Sum HH-equivalent values per description
  const descValues: Record<string, number> = {};
  for (const desc of descriptions) {
    descValues[desc] = 0;
  }

  for (const r of groupRecords) {
    const desc = canonicalDescription(r.descricao || "Sem descrição");
    const value = getRecordHHNormalized(r, dailyHHMedio);
    if (desc in descValues) {
      descValues[desc] += value;
    }
  }

  // Total of all HH-equivalent values
  const total = Object.values(descValues).reduce((a, b) => a + b, 0);

  // Compute percentages
  const result: Record<string, number> = {};
  for (const desc of descriptions) {
    result[desc] = total > 0 ? +((descValues[desc] / total) * 100).toFixed(1) : 0;
  }

  return result;
}
