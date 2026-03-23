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

  // Step 1: Group records by time slot (date + normalized hour)
  // This prevents different dates with the same hour from being merged.
  const bySlot: Record<string, Record<string, number>> = {};

  for (const r of groupRecords) {
    const hour = normalizeTime(r.horario || "");
    if (!hour) continue;
    const slot = `${r.data || "sem-data"}|${hour}`;
    if (!bySlot[slot]) bySlot[slot] = {};
    const desc = canonicalDescription(r.descricao || "Sem descrição");
    bySlot[slot][desc] = (bySlot[slot][desc] || 0) + (r.quantidade || 0);
  }

  const slots = Object.keys(bySlot);
  if (slots.length === 0) {
    return Object.fromEntries(descriptions.map((d) => [d, 0]));
  }

  // Step 2: For special categories, compute the simple average of the percentage
  // only across slots where that category actually occurred.
  const specialAvgs: Record<string, number> = {};
  for (const desc of descriptions) {
    if (!isHourlyAvgDescription(desc)) continue;

    let sumPct = 0;
    let countSlots = 0;

    for (const slot of slots) {
      const slotTotal = Object.values(bySlot[slot]).reduce((a, b) => a + b, 0);
      if (slotTotal <= 0) continue;

      const descQty = bySlot[slot][desc] || 0;
      if (descQty <= 0) continue;

      sumPct += (descQty / slotTotal) * 100;
      countSlots++;
    }

    specialAvgs[desc] = countSlots > 0 ? sumPct / countSlots : 0;
  }

  // Step 3: For normal categories, keep the current volume-based percentage.
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

  // Step 4: Keep the special categories fixed and scale the normal ones to fill the remainder.
  const specialSum = Object.values(specialAvgs).reduce((a, b) => a + b, 0);
  const remaining = Math.max(0, 100 - specialSum);
  const normalScale = normalRawSum > 0 ? remaining / normalRawSum : 0;

  const result: Record<string, number> = {};
  for (const desc of descriptions) {
    if (isHourlyAvgDescription(desc)) {
      result[desc] = +(specialAvgs[desc] || 0).toFixed(1);
    } else {
      result[desc] = +((normalRaw[desc] || 0) * normalScale).toFixed(1);
    }
  }

  return result;
}
