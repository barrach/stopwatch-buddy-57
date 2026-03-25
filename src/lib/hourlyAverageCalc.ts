/**
 * Hybrid HH Calculation for Charts
 *
 * For NPE and "Aguardando Liberação de PT":
 *   value = qty × duracao_horas (HH model)
 * For all other categories:
 *   value = qty (volume model)
 *
 * Charts compute: % = value / total × 100
 * where total = sum of all values (hybrid).
 */

import { canonicalDescription, normalizeTime } from "@/lib/chartConstants";

/** Descriptions that use HH (man-hours) model */
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

/** Get the effective value for a record: HH for special categories, qty for others */
export function getRecordHH(r: any): number {
  const desc = canonicalDescription(r.descricao || "Sem descrição");
  const categoria = (r.categorias_observacao as any)?.nome || r.categoria || "";
  const qty = Number(r.quantidade ?? 0);
  const duracao = Number(r.duracao_horas ?? r.duracao_em_horas ?? r.duracao ?? 1);
  const isDynamicHH = usesDerivedHHValue(r);

  if (isDynamicHH) {
    const valorFinal = qty * duracao;
    console.log({ categoria, qtd: qty, duracao, valor_final: valorFinal });
    return valorFinal;
  }

  if (HH_DESCRIPTIONS.has(desc) && r.is_dinamico !== true) return qty * duracao;
  return qty;
}

/**
 * Compute percentage for each description using the hybrid model:
 * - HH-model categories: value = qty × duration
 * - Normal categories: value = qty
 * - % = value / total_hybrid × 100
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

  // Sum hybrid values per description
  const descValues: Record<string, number> = {};
  for (const desc of descriptions) {
    descValues[desc] = 0;
  }

  for (const r of groupRecords) {
    const desc = canonicalDescription(r.descricao || "Sem descrição");
    const value = getRecordHH(r);
    if (desc in descValues) {
      descValues[desc] += value;
    }
  }

  // Total of all hybrid values
  const total = Object.values(descValues).reduce((a, b) => a + b, 0);

  // Compute percentages
  const result: Record<string, number> = {};
  for (const desc of descriptions) {
    result[desc] = total > 0 ? +((descValues[desc] / total) * 100).toFixed(1) : 0;
  }

  return result;
}
