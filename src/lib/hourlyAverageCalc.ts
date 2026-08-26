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

/**
 * Normalize an array of raw values into percentages that sum to exactly 100.0%
 * Uses the Largest Remainder Method to distribute rounding residuals.
 */
export function normalizeToHundred(keys: string[], rawValues: number[]): Record<string, number> {
  const total = rawValues.reduce((s, v) => s + v, 0);
  if (total <= 0) return Object.fromEntries(keys.map(k => [k, 0]));

  const exact = rawValues.map(v => (v / total) * 100);
  const floored = exact.map(v => Math.floor(v * 10) / 10);
  const flooredSum = Math.round(floored.reduce((s, v) => s + v, 0) * 10);
  let remainder = 1000 - flooredSum;

  const indices = exact.map((_, i) => i)
    .sort((a, b) => {
      const remA = exact[a] * 10 - Math.floor(exact[a] * 10);
      const remB = exact[b] * 10 - Math.floor(exact[b] * 10);
      return remB - remA;
    });

  for (let j = 0; j < remainder && j < indices.length; j++) {
    floored[indices[j]] = Math.round((floored[indices[j]] + 0.1) * 10) / 10;
  }

  const result: Record<string, number> = {};
  for (let i = 0; i < keys.length; i++) {
    result[keys[i]] = +floored[i].toFixed(1);
  }
  return result;
}

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

/**
 * Unified check: a record is dynamic if its canonical description
 * matches ANY of the 3 dynamic descriptions. Same rule for PT and NPE.
 */
function isDynamicTargetRecord(r: any): boolean {
  const desc = canonicalDescription(r.descricao || "Sem descrição");
  return HH_DESCRIPTIONS.has(desc);
}

export function usesDerivedHHValue(r: any): boolean {
  return isDynamicTargetRecord(r);
}

/** Get raw qty for a record */
function getStoredQty(r: any): number {
  return Number(r.quantidade_base ?? r.quantidade ?? 0);
}

/** Get duration in hours for a record (default 1.0) */
function getDuration(r: any): number {
  return Number(r.duracao_horas ?? r.duracao_em_horas ?? r.duracao ?? 1);
}

/**
 * Build a map of (date|especialidade) → average qty per hour.
 * Groups non-dynamic records by hour, sums per hour, then divides total by unique hours.
 *
 * Memoized per record-array reference: this function is called for every record
 * inside hot loops, and recomputing it each time made large datasets freeze the UI.
 */
const daySpecialtyBaseCache = new WeakMap<any[], Map<string, number>>();

function getDaySpecialtyBaseMap(dayRecords: any[]): Map<string, number> {
  const cached = daySpecialtyBaseCache.get(dayRecords);
  if (cached) return cached;

  // First pass: group qty by (date|especialidade|hour)
  const hourlyMap = new Map<string, Map<string, number>>(); // specKey → (hour → sumQty)

  for (const record of dayRecords) {
    if (usesDerivedHHValue(record)) continue;

    const specKey = `${record.data}|${record.especialidade_id ?? "sem-especialidade"}`;
    const rawHorario = record.horario ?? "";
    // Normalize to HH:mm (take first 5 chars, pad if needed)
    const hour = rawHorario.length >= 5 ? rawHorario.slice(0, 5) : rawHorario;

    if (!hourlyMap.has(specKey)) hourlyMap.set(specKey, new Map());
    const hoursForSpec = hourlyMap.get(specKey)!;
    hoursForSpec.set(hour, (hoursForSpec.get(hour) || 0) + getStoredQty(record));
  }

  // Second pass: compute average = totalQty / uniqueHours, adjusted by confidence factor
  const EXPECTED_OBSERVATIONS = 8;
  const resultMap = new Map<string, number>();
  for (const [specKey, hoursMap] of hourlyMap) {
    const totalQty = [...hoursMap.values()].reduce((a, b) => a + b, 0);
    const uniqueHours = hoursMap.size;
    const avgPerHour = uniqueHours > 0 ? totalQty / uniqueHours : 0;

    // Confidence factor: clamp between 0.25 and 1.0
    const fatorConfiabilidade = Math.min(Math.max(uniqueHours / EXPECTED_OBSERVATIONS, 0.25), 1.0);
    resultMap.set(specKey, avgPerHour * fatorConfiabilidade);
  }

  daySpecialtyBaseCache.set(dayRecords, resultMap);
  return resultMap;
}


// Conservative default when no productive baseline exists for the specialty
// on the target day and no historical average can be derived. Using 1 avoids
// inflating NPE HH totals by assuming a fictional crew size (previous value
// of 10 was superestimating parado externo em dias sem base produtiva).
const FALLBACK_DEFAULT_QTY = 1;

/**
 * Compute historical average for a specialty from records of other days (last 7 days).
 * Returns average qty per hour across those days, or 0 if no data.
 */
const historicalAvgCache = new WeakMap<any[], Map<string, number>>();

function getHistoricalSpecialtyAvg(especialidadeId: string, currentDate: string, allRecords: any[]): number {
  const specId = especialidadeId ?? "sem-especialidade";
  const cacheKey = `${specId}|${currentDate}`;
  let cache = historicalAvgCache.get(allRecords);
  if (cache) {
    const hit = cache.get(cacheKey);
    if (hit !== undefined) return hit;
  } else {
    cache = new Map();
    historicalAvgCache.set(allRecords, cache);
  }

  // Widen the historical window: use ALL available past days for the same
  // specialty (non-dynamic records only). A 7-day window frequently returned
  // zero and forced the default fallback (10), which inflated NPE metrics
  // on days with only "parado externo" launches.
  const historicalRecords = allRecords.filter((rec) => {
    if (usesDerivedHHValue(rec)) return false;
    if ((rec.especialidade_id ?? "sem-especialidade") !== specId) return false;
    return rec.data !== currentDate;
  });

  if (historicalRecords.length === 0) {
    cache.set(cacheKey, 0);
    return 0;
  }

  // Group by day, compute avg per day, then average across days
  const dayMap = new Map<string, any[]>();
  for (const rec of historicalRecords) {
    if (!dayMap.has(rec.data)) dayMap.set(rec.data, []);
    dayMap.get(rec.data)!.push(rec);
  }

  let totalAvg = 0;
  let dayCount = 0;
  for (const [, recs] of dayMap) {
    const baseMap = getDaySpecialtyBaseMap(recs);
    // Sum all specialty averages for this day (there should be one key per specialty)
    for (const [key, val] of baseMap) {
      if (key.includes(specId)) {
        totalAvg += val;
        dayCount++;
        break;
      }
    }
  }

  const result = dayCount > 0 ? totalAvg / dayCount : 0;
  cache.set(cacheKey, result);
  return result;
}

function getCalculatedQty(r: any, dayRecords: any[], allRecords?: any[]): number {
  if (!usesDerivedHHValue(r)) return getStoredQty(r);

  const specialtyKey = `${r.data}|${r.especialidade_id ?? "sem-especialidade"}`;
  const specialtyBaseQty = getDaySpecialtyBaseMap(dayRecords).get(specialtyKey) || 0;

  let finalQty = specialtyBaseQty;

  if (specialtyBaseQty === 0 && allRecords && allRecords.length > 0) {
    // FALLBACK: historical average
    const historicalAvg = getHistoricalSpecialtyAvg(r.especialidade_id, r.data, allRecords);
    finalQty = historicalAvg > 0 ? historicalAvg : FALLBACK_DEFAULT_QTY;
  }

  return finalQty;
}


/**
 * Compute HH_medio_dia for a set of records (same day/obra).
 * HH_medio = sum(qty × duration) / sum(qty)
 */
export function computeHHMedioDia(dayRecords: any[], allRecords?: any[]): number {
  if (dayRecords.length === 0) return 0;
  let hhTotal = 0;
  let qtyTotal = 0;
  const specialtyBaseMap = getDaySpecialtyBaseMap(dayRecords);

  for (const r of dayRecords) {
    let qty: number;
    let dur: number;
    if (usesDerivedHHValue(r)) {
      qty = specialtyBaseMap.get(`${r.data}|${r.especialidade_id ?? "sem-especialidade"}`) || 0;
      // Apply fallback if no base in day
      if (qty === 0 && allRecords && allRecords.length > 0) {
        const hist = getHistoricalSpecialtyAvg(r.especialidade_id, r.data, allRecords);
        qty = hist > 0 ? hist : FALLBACK_DEFAULT_QTY;
      }
      // Ignora duração do evento no cálculo do HH médio para manter
      // simetria com getRecordHHWithContext (dynamic = qty × 1).
      dur = 1;
    } else {
      qty = getStoredQty(r);
      dur = getDuration(r);
    }
    hhTotal += qty * dur;
    qtyTotal += qty;
  }
  if (qtyTotal === 0) return 0;
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
export function getRecordHHWithContext(r: any, hhMedioDia: number, dayRecords: any[] = [], allRecords?: any[]): number {
  const desc = canonicalDescription(r.descricao || "Sem descrição");
  const qty = getCalculatedQty(r, dayRecords, allRecords);
  const duracao = getDuration(r);

  if (HH_DESCRIPTIONS.has(desc)) {
    // HH REAL — duração ignorada no peso do %: usamos qty × 1h
    // para evitar que eventos longos (ex.: 8h de chuva) inflem o NPE
    // em ordens de grandeza superiores às amostras produtivas (que
    // valem qty × HH_medio_dia ≈ qty × 1). A duração continua
    // preservada no registro para relatórios de horas paradas.
    const valorFinal = qty * 1;
    console.log({
      tipo: "HH_REAL",
      categoria: (r.categorias_observacao as any)?.nome || r.categoria || "",
      descricao: desc,
      qtd: qty,
      duracao,
      duracao_ignorada_no_peso: true,
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
  const qty = getStoredQty(r);
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
    hhMedioMap.set(key, computeHHMedioDia(recs, groupRecords));
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
    const value = getRecordHHWithContext(r, hhMedio, dayGroups.get(key) || [], groupRecords);
    // Always accumulate — even if desc is not in the original list
    if (!(desc in descValues)) {
      descValues[desc] = 0;
    }
    descValues[desc] += value;
  }

  // Total of all HH values
  const total = Object.values(descValues).reduce((a, b) => a + b, 0);

  // Compute percentages using largest remainder method to guarantee sum = 100%
  if (total <= 0) {
    return Object.fromEntries(descriptions.map(d => [d, 0]));
  }

  return normalizeToHundred(descriptions, descriptions.map(d => descValues[d] || 0));
}

/**
 * Get display quantity for a record (for the "Qtd" column).
 * Dynamic records show the HH real value (qty × duration).
 * Other records show raw quantity.
 */
export function getDisplayQuantity(r: any, allRecords: any[] = []): number {
  if (usesDerivedHHValue(r)) {
    const dayRecords = allRecords.filter((rec) => `${rec.data}|${rec.obra_id}` === `${r.data}|${r.obra_id}`);
    return Math.round(getCalculatedQty(r, dayRecords, allRecords));
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
  const hhMedio = computeHHMedioDia(dayRecords, allRecords);
  return getRecordHHWithContext(r, hhMedio, dayRecords, allRecords);
}
