/**
 * Sample Confidence Factor
 *
 * Adjusts displayed percentages based on daily observation count.
 * fator_confiabilidade = min(1, total_observacoes_dia / 8)
 *
 * 8 observations = ideal day (100% confidence)
 * Less than that = proportionally reduced weight
 *
 * IMPORTANT: This is a VISUALIZATION-ONLY adjustment.
 * Raw data, HH calculations, and dynamic observations are NOT affected.
 */

const IDEAL_DAILY_OBS = 8;
const LOW_SAMPLE_THRESHOLD = 5;

/**
 * Compute confidence factor for a single day.
 * Uses unique observation time slots (horarios) as the count basis.
 */
export function computeDayConfidence(dayRecords: any[]): number {
  // Count unique time slots for the day
  const uniqueTimes = new Set<string>();
  for (const r of dayRecords) {
    const horario = r.horario || "";
    if (horario) uniqueTimes.add(horario);
  }
  const totalObs = uniqueTimes.size;
  const fator = Math.min(1, totalObs / IDEAL_DAILY_OBS);

  console.log({
    total_observacoes_dia: totalObs,
    horarios_unicos: [...uniqueTimes],
    fator_confiabilidade: fator,
  });

  return fator;
}

/**
 * Compute a weighted average confidence factor across multiple days.
 * Each day contributes equally to the average.
 */
export function computeOverallConfidence(records: any[]): number {
  if (records.length === 0) return 0;

  // Group records by date
  const dayMap = new Map<string, any[]>();
  for (const r of records) {
    const date = r.data || "";
    if (!dayMap.has(date)) dayMap.set(date, []);
    dayMap.get(date)!.push(r);
  }

  let totalConfidence = 0;
  let dayCount = 0;
  for (const [, dayRecords] of dayMap) {
    totalConfidence += computeDayConfidence(dayRecords);
    dayCount++;
  }

  return dayCount > 0 ? totalConfidence / dayCount : 0;
}

/**
 * Apply confidence factor to a percentage value.
 * percentual_ajustado = percentual_original × fator_confiabilidade
 */
export function adjustPercentage(originalPercent: number, confidenceFactor: number): number {
  const adjusted = originalPercent * confidenceFactor;

  console.log({
    percentual_original: originalPercent,
    fator_confiabilidade: confidenceFactor,
    percentual_ajustado: adjusted,
  });

  return +adjusted.toFixed(1);
}

/**
 * Check if sample size is below warning threshold.
 */
export function isLowSample(records: any[]): boolean {
  const dayMap = new Map<string, Set<string>>();
  for (const r of records) {
    const date = r.data || "";
    if (!dayMap.has(date)) dayMap.set(date, new Set());
    dayMap.get(date)!.add(r.horario || "");
  }

  // Check if ANY day has fewer than threshold unique times
  for (const [, times] of dayMap) {
    if (times.size < LOW_SAMPLE_THRESHOLD) return true;
  }
  return false;
}

/**
 * Get the average number of unique daily observations.
 */
export function getAverageDailyObs(records: any[]): number {
  if (records.length === 0) return 0;
  const dayMap = new Map<string, Set<string>>();
  for (const r of records) {
    const date = r.data || "";
    if (!dayMap.has(date)) dayMap.set(date, new Set());
    dayMap.get(date)!.add(r.horario || "");
  }
  let total = 0;
  for (const [, times] of dayMap) total += times.size;
  return total / dayMap.size;
}

export { IDEAL_DAILY_OBS, LOW_SAMPLE_THRESHOLD };
