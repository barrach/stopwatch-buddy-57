/**
 * Hourly-Average Percentage Calculation for Special Categories
 * 
 * For NPE and "Aguardando Liberação de PT", instead of calculating
 * percentage as (total_qty / grand_total * 100), we:
 * 1. For each hour, calculate the % of that category within that hour
 * 2. Average those hourly percentages across all hours
 * 
 * This prevents distortion when a single hour has 100% of a special category
 * but other hours have none.
 */

import { canonicalDescription, normalizeTime } from "@/lib/chartConstants";

/** Descriptions that use hourly-average calculation instead of volume-based */
const HOURLY_AVG_DESCRIPTIONS = new Set([
  "Aguardando Liberação de PT",
  "Fatores Climáticos e Consequências",
  "Interferências Operacionais",
]);

export function isHourlyAvgDescription(desc: string): boolean {
  return HOURLY_AVG_DESCRIPTIONS.has(desc);
}

/**
 * Given raw records belonging to a single chart group (e.g. one contract, one weekday),
 * compute the percentage for each description using:
 * - Hourly-average method for special categories
 * - Volume-based method for normal categories
 * 
 * Returns an object: { [description]: percentValue }
 * All percentages are normalized so the total = 100%.
 * 
 * @param groupRecords - records already filtered to the chart group
 * @param descriptions - the canonical description list
 */
export function computeHourlyAdjustedPercentages(
  groupRecords: any[],
  descriptions: string[]
): Record<string, number> {
  if (groupRecords.length === 0) {
    return Object.fromEntries(descriptions.map(d => [d, 0]));
  }

  // Step 1: Group records by normalized hour
  const byHour: Record<string, Record<string, number>> = {};

  for (const r of groupRecords) {
    const hour = normalizeTime(r.horario || "");
    if (!hour) continue;
    if (!byHour[hour]) byHour[hour] = {};
    const desc = canonicalDescription(r.descricao || "Sem descrição");
    byHour[hour][desc] = (byHour[hour][desc] || 0) + (r.quantidade || 0);
  }

  const hours = Object.keys(byHour);
  if (hours.length === 0) {
    return Object.fromEntries(descriptions.map(d => [d, 0]));
  }

  // Step 2: For special categories, compute average of hourly percentages
  const specialAvgs: Record<string, number> = {};
  for (const desc of descriptions) {
    if (!isHourlyAvgDescription(desc)) continue;
    let sumPct = 0;
    let countHours = 0;
    for (const hour of hours) {
      const hourTotal = Object.values(byHour[hour]).reduce((a, b) => a + b, 0);
      if (hourTotal <= 0) continue;
      const descQty = byHour[hour][desc] || 0;
      sumPct += (descQty / hourTotal) * 100;
      countHours++;
    }
    specialAvgs[desc] = countHours > 0 ? sumPct / countHours : 0;
  }

  // Step 3: For normal categories, compute volume-based percentage
  const totalQty = groupRecords.reduce((s, r) => s + (r.quantidade || 0), 0);
  const normalRaw: Record<string, number> = {};
  let normalRawSum = 0;

  for (const desc of descriptions) {
    if (isHourlyAvgDescription(desc)) continue;
    let qty = 0;
    for (const r of groupRecords) {
      if (canonicalDescription(r.descricao || "Sem descrição") === desc) {
        qty += r.quantidade || 0;
      }
    }
    const pct = totalQty > 0 ? (qty / totalQty) * 100 : 0;
    normalRaw[desc] = pct;
    normalRawSum += pct;
  }

  // Step 4: Normalize so everything sums to 100%
  const specialSum = Object.values(specialAvgs).reduce((a, b) => a + b, 0);
  
  // Scale normal categories to fill the remaining percentage
  const normalScale = normalRawSum > 0 ? (100 - specialSum) / normalRawSum : 0;

  const result: Record<string, number> = {};
  for (const desc of descriptions) {
    if (isHourlyAvgDescription(desc)) {
      result[desc] = +(specialAvgs[desc] || 0).toFixed(1);
    } else {
      result[desc] = +((normalRaw[desc] || 0) * (specialSum > 0 ? normalScale : 1)).toFixed(1);
    }
  }

  return result;
}
