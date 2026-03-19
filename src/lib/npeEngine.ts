/**
 * Centralized NPE Reprocessing Engine
 * 
 * Recalculates NPE weights at query time (runtime) without modifying the database.
 * 
 * Algorithm:
 * 1. Group all records by day (data)
 * 2. For each day, group by period (horario)
 * 3. Classify each period: "valid" (has non-NPE samples) or "NPE-only"
 * 4. media_dia = sum(non-NPE samples of valid periods) / count(valid periods)
 * 5. For NPE records: replace quantity with media_dia weight
 * 6. Rebuild totals: non-NPE raw + (NPE periods × media_dia)
 */

export interface NpeWeightResult {
  /** Weighted NPE count (media_dia × NPE periods) */
  weightedNpe: number;
  /** Raw non-NPE sample count */
  nonNpeRaw: number;
  /** Adjusted total = nonNpeRaw + weightedNpe */
  adjustedTotal: number;
  /** Average samples per valid period */
  mediaDia: number;
  /** Number of valid (non-NPE) periods */
  validPeriodCount: number;
  /** Number of NPE-only periods */
  npePeriodCount: number;
}

/**
 * Core engine: computes weighted NPE from a set of records.
 * 
 * @param records - Array of observation records (must have data, horario, quantidade)
 * @param isExternalRecord - Function that returns true if a record is NPE
 * @returns NpeWeightResult with all computed values
 */
export function computeNpeWeights(
  records: any[],
  isExternalRecord: (r: any) => boolean
): NpeWeightResult {
  // Step 1+2: Group by day → period (date + horario)
  const dayPeriodMap: Record<string, Record<string, { npe: number; nonNpe: number }>> = {};

  records.forEach((r: any) => {
    const day = r.data;
    const period = r.horario;
    const qty = r.quantidade || 0;

    if (!dayPeriodMap[day]) dayPeriodMap[day] = {};
    if (!dayPeriodMap[day][period]) dayPeriodMap[day][period] = { npe: 0, nonNpe: 0 };

    if (isExternalRecord(r)) {
      dayPeriodMap[day][period].npe += qty;
    } else {
      dayPeriodMap[day][period].nonNpe += qty;
    }
  });

  // Step 3+4: For each day, compute media_dia and weighted NPE
  let totalWeightedNpe = 0;
  let totalNonNpeRaw = 0;

  Object.values(dayPeriodMap).forEach((periods) => {
    let dayValidPeriods = 0;
    let dayValidSamples = 0;
    let dayNpePeriods = 0;
    let dayNonNpeRaw = 0;

    Object.values(periods).forEach((p) => {
      if (p.nonNpe > 0) {
        // Valid period: has real production
        dayValidPeriods++;
        dayValidSamples += p.nonNpe;
        dayNonNpeRaw += p.nonNpe;
      } else if (p.npe > 0) {
        // NPE-only period
        dayNpePeriods++;
      }
      // Periods with both: nonNpe counts, npe in that period is ignored for weighting
      // because the period itself had production
      if (p.nonNpe > 0 && p.npe > 0) {
        // Mixed period: NPE samples in a valid period are kept at face value
        // but we don't count additional NPE periods
      }
    });

    // Handle mixed periods: periods that have BOTH npe and nonNpe
    // Re-scan for pure NPE periods and mixed ones
    let pureNpePeriods = 0;
    let mixedNpeSamples = 0;
    Object.values(periods).forEach((p) => {
      if (p.nonNpe === 0 && p.npe > 0) {
        pureNpePeriods++;
      } else if (p.nonNpe > 0 && p.npe > 0) {
        // Mixed: keep NPE samples at face value
        mixedNpeSamples += p.npe;
      }
    });

    // media_dia for this day
    let mediaDia: number;
    if (dayValidPeriods > 0) {
      mediaDia = dayValidSamples / dayValidPeriods;
    } else {
      // Fallback: no valid periods this day, use raw NPE (prevents zero)
      mediaDia = 0;
      Object.values(periods).forEach((p) => { mixedNpeSamples += p.npe; });
      pureNpePeriods = 0; // Already counted in mixed
    }

    // Weighted NPE for pure NPE periods + face-value for mixed
    const dayWeightedNpe = Math.round(mediaDia * pureNpePeriods) + mixedNpeSamples;

    totalWeightedNpe += dayWeightedNpe;
    totalNonNpeRaw += dayNonNpeRaw;
  });

  // Global aggregates
  let globalValidPeriods = 0;
  let globalValidSamples = 0;
  let globalNpePeriods = 0;

  Object.values(dayPeriodMap).forEach((periods) => {
    Object.values(periods).forEach((p) => {
      if (p.nonNpe > 0) {
        globalValidPeriods++;
        globalValidSamples += p.nonNpe;
      } else if (p.npe > 0) {
        globalNpePeriods++;
      }
    });
  });

  const globalMediaDia = globalValidPeriods > 0
    ? globalValidSamples / globalValidPeriods
    : 0;

  const adjustedTotal = totalNonNpeRaw + totalWeightedNpe;

  return {
    weightedNpe: totalWeightedNpe,
    nonNpeRaw: totalNonNpeRaw,
    adjustedTotal: adjustedTotal > 0 ? adjustedTotal : records.reduce((s, r) => s + (r.quantidade || 0), 0),
    mediaDia: globalMediaDia,
    validPeriodCount: globalValidPeriods,
    npePeriodCount: globalNpePeriods,
  };
}

/**
 * Builds a virtual record set where NPE record quantities are replaced
 * with their weighted values (for chart consumption).
 * 
 * This creates a COPY — original records are never modified.
 */
export function buildWeightedRecords(
  records: any[],
  isExternalRecord: (r: any) => boolean
): any[] {
  // Group by day to compute per-day media
  const dayPeriodMap: Record<string, Record<string, { npe: number; nonNpe: number }>> = {};

  records.forEach((r: any) => {
    const day = r.data;
    const period = r.horario;
    const qty = r.quantidade || 0;
    if (!dayPeriodMap[day]) dayPeriodMap[day] = {};
    if (!dayPeriodMap[day][period]) dayPeriodMap[day][period] = { npe: 0, nonNpe: 0 };
    if (isExternalRecord(r)) {
      dayPeriodMap[day][period].npe += qty;
    } else {
      dayPeriodMap[day][period].nonNpe += qty;
    }
  });

  // Compute media_dia per day
  const mediaDiaByDay: Record<string, number> = {};
  Object.entries(dayPeriodMap).forEach(([day, periods]) => {
    let validPeriods = 0;
    let validSamples = 0;
    Object.values(periods).forEach((p) => {
      if (p.nonNpe > 0) {
        validPeriods++;
        validSamples += p.nonNpe;
      }
    });
    mediaDiaByDay[day] = validPeriods > 0 ? validSamples / validPeriods : 0;
  });

  // Count NPE records per day+period to distribute weight
  const npeRecordCountByPeriod: Record<string, number> = {};
  records.forEach((r: any) => {
    if (!isExternalRecord(r)) return;
    const key = `${r.data}_${r.horario}`;
    npeRecordCountByPeriod[key] = (npeRecordCountByPeriod[key] || 0) + 1;
  });

  // Build weighted copy
  return records.map((r: any) => {
    if (!isExternalRecord(r)) return r; // Non-NPE: keep original

    const day = r.data;
    const periodKey = `${r.data}_${r.horario}`;
    const media = mediaDiaByDay[day] || 0;

    // Check if this period is pure NPE (no non-NPE samples in same period)
    const periodData = dayPeriodMap[day]?.[r.horario];
    if (periodData && periodData.nonNpe > 0) {
      // Mixed period: keep original quantity
      return r;
    }

    // Pure NPE period: distribute media_dia across NPE records in this period
    const npeCount = npeRecordCountByPeriod[periodKey] || 1;
    const weightedQty = Math.round(media / npeCount) || 0;

    return { ...r, quantidade: weightedQty };
  });
}
