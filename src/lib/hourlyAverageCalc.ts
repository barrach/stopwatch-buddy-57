/**
 * Hybrid HH Calculation Engine
 *
 * MODEL:
 *   1. HH_total_dia = sum(qty × duracao) for ALL records of same (date, obra)
 *   2. QTD_total_dia = sum(qty) for ALL records of same (date, obra)
 *   3. HH_medio_dia = HH_total_dia / QTD_total_dia
 *
 *   For DYNAMIC categories (PT, Fatores Climáticos, Interferências Operacionais):
 *     valor = qty × duracao  (HH REAL)
 *
 *   For ALL OTHER categories:
 *     valor = qty × HH_medio_dia  (HH EQUIVALENTE)
 *
 *   Charts: % = sum(valor_categoria) / sum(todos_valores) × 100
 *
 * IMPORTANT: The `quantidade` field in the DB is NEVER modified.
 *            All HH values are derived at read-time.
 */

import { canonicalDescription } from "@/lib/chartConstants";

/** Descriptions that use HH REAL (qty × duration) */
const HH_DESCRIPTIONS = new Set([
  "Aguardando Liberação de PT",
  "Fatores Climáticos e Consequências",
  "Interferências Operacionais",
]);

export function isHourlyAvgDescription(desc: string): boolean {
  return HH_DESCRIPTIONS.has(desc);
}

export function usesDerivedHHValue(r: any): boolean {
  const desc = canonicalDescription(r.descricao || "Sem descrição");
  return r.is_dinamico === true && HH_DESCRIPTIONS.has(desc);
}

/** Get raw qty for a record */
function getRawQty(r: any): number {
  return Number(r.quantidade_base ?? r.quantidade ?? 1);
}

/** Get duration in hours for a record (default 1.0) */
function getDuration(r: any): number {
  return Number(r.duracao_horas ?? r.duracao_em_horas ?? r.duracao ?? 1);
}

/**
 * Compute HH_medio_dia for a set of records (same day/obra).
 * HH_medio = sum(qty × duration) / sum(qty)
 */
export function computeHHMedioDia(dayRecords: any[]): number {
  if (dayRecords.length === 0) return 1;
  let hhTotal = 0;
  let qtyTotal = 0;
  for (const r of dayRecords) {
    const qty = getRawQty(r);
    const dur = getDuration(r);
    hhTotal += qty * dur;
    qtyTotal += qty;
  }
  if (qtyTotal === 0) return 1;
  const medio = hhTotal / qtyTotal;
  console.log({ HH_total_dia: hhTotal, QTD_total_dia: qtyTotal, HH_medio_dia: medio });
  return medio;
}

/**
 * Get the effective HH value for a single record.
 * REQUIRES dayRecords context for computing HH_medio_dia.
 *
 * - Dynamic categories: valor = qty × duration (HH real)
 * - Other categories: valor = qty × HH_medio_dia (HH equivalent)
 */
export function getRecordHHWithContext(r: any, hhMedioDia: number): number {
  const desc = canonicalDescription(r.descricao || "Sem descrição");
  const qty = getRawQty(r);
  const duracao = getDuration(r);

  if (HH_DESCRIPTIONS.has(desc)) {
    // HH REAL
    const valorFinal = qty * duracao;
    console.log({
      tipo: "HH_REAL",
      categoria: (r.categorias_observacao as any)?.nome || r.categoria || "",
      descricao: desc,
      qtd: qty,
      duracao,
      valor_final: valorFinal,
    });
    return valorFinal;
  }

  // HH EQUIVALENTE
  const valorFinal = qty * hhMedioDia;
  return valorFinal;
}

/**
 * Legacy single-record HH getter (without day context).
 * Falls back to qty × duration for dynamic, qty for others.
 * Use getRecordHHWithContext when day records are available.
 */
export function getRecordHH(r: any): number {
  const desc = canonicalDescription(r.descricao || "Sem descrição");
  const qty = getRawQty(r);
  const duracao = getDuration(r);

  if (HH_DESCRIPTIONS.has(desc)) {
    return qty * duracao;
  }
  return qty;
}

/**
 * Compute percentage for each description using the full HH model.
 * Groups records by day/obra to calculate HH_medio_dia per group,
 * then sums HH values per description across all groups.
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

  // Group records by (date, obra_id) to compute HH_medio per day
  const dayGroups = new Map<string, any[]>();
  for (const r of groupRecords) {
    const key = `${r.data}|${r.obra_id}`;
    if (!dayGroups.has(key)) dayGroups.set(key, []);
    dayGroups.get(key)!.push(r);
  }

  // Pre-compute HH_medio_dia for each day group
  const hhMedioMap = new Map<string, number>();
  for (const [key, recs] of dayGroups) {
    hhMedioMap.set(key, computeHHMedioDia(recs));
  }

  // Sum HH values per description
  const descValues: Record<string, number> = {};
  for (const desc of descriptions) {
    descValues[desc] = 0;
  }

  for (const r of groupRecords) {
    const desc = canonicalDescription(r.descricao || "Sem descrição");
    const key = `${r.data}|${r.obra_id}`;
    const hhMedio = hhMedioMap.get(key) || 1;
    const value = getRecordHHWithContext(r, hhMedio);
    if (desc in descValues) {
      descValues[desc] += value;
    }
  }

  // Total of all HH values
  const total = Object.values(descValues).reduce((a, b) => a + b, 0);

  // Compute percentages
  const result: Record<string, number> = {};
  for (const desc of descriptions) {
    result[desc] = total > 0 ? +((descValues[desc] / total) * 100).toFixed(1) : 0;
  }

  return result;
}

/**
 * Get display quantity for a record (for the "Qtd" column).
 * Dynamic records show the HH real value (qty × duration).
 * Other records show raw quantity.
 */
export function getDisplayQuantity(r: any): number {
  if (usesDerivedHHValue(r)) {
    const qty = getRawQty(r);
    const duracao = getDuration(r);
    return qty * duracao;
  }
  return Number(r.quantidade ?? 0);
}

/**
 * Get HH value for a record in the context of all day records.
 * This is the main function to use for ALL chart/aggregate calculations.
 */
export function getRecordValue(r: any, allRecords: any[]): number {
  // Find all records from the same day/obra
  const dayKey = `${r.data}|${r.obra_id}`;
  const dayRecords = allRecords.filter(rec => `${rec.data}|${rec.obra_id}` === dayKey);
  const hhMedio = computeHHMedioDia(dayRecords);
  return getRecordHHWithContext(r, hhMedio);
}
