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
 *
 * CONFIDENCE FACTOR:
 *   fator_confiabilidade = min(1, horarios_unicos_dia / 8)
 *   Applied to ALL record values before percentage calculation.
 *   Days with fewer unique observation hours are weighted down.
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
 */
function getDaySpecialtyBaseMap(dayRecords: any[]): Map<string, number> {
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

  // Second pass: compute average = totalQty / uniqueHours
  const resultMap = new Map<string, number>();
  for (const [specKey, hoursMap] of hourlyMap) {
    const totalQty = [...hoursMap.values()].reduce((a, b) => a + b, 0);
    const uniqueHours = hoursMap.size;
    const avgPerHour = uniqueHours > 0 ? totalQty / uniqueHours : 0;

    console.log({
      especialidade_key: specKey,
      horas_unicas: [...hoursMap.keys()],
      qtd_por_hora: Object.fromEntries(hoursMap),
      QTD_total_dia: totalQty,
      QTD_dinamica: avgPerHour,
    });

    resultMap.set(specKey, avgPerHour);
  }

  return resultMap;
}

const FALLBACK_DEFAULT_QTY = 10;

/**
 * Compute historical average for a specialty from records of other days (last 7 days).
 * Returns average qty per hour across those days, or 0 if no data.
 */
function getHistoricalSpecialtyAvg(especialidadeId: string, currentDate: string, allRecords: any[]): number {
  const specId = especialidadeId ?? "sem-especialidade";
  const currentDateObj = new Date(currentDate);
  const sevenDaysAgo = new Date(currentDateObj);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Filter records: same specialty, different days (last 7), non-dynamic only
  const historicalRecords = allRecords.filter((rec) => {
    if (usesDerivedHHValue(rec)) return false;
    if ((rec.especialidade_id ?? "sem-especialidade") !== specId) return false;
    const recDate = new Date(rec.data);
    return rec.data !== currentDate && recDate >= sevenDaysAgo && recDate < currentDateObj;
  });

  if (historicalRecords.length === 0) return 0;

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

  return dayCount > 0 ? totalAvg / dayCount : 0;
}

function getCalculatedQty(r: any, dayRecords: any[], allRecords?: any[]): number {
  if (!usesDerivedHHValue(r)) return getStoredQty(r);

  const specialtyKey = `${r.data}|${r.especialidade_id ?? "sem-especialidade"}`;
  const specialtyBaseQty = getDaySpecialtyBaseMap(dayRecords).get(specialtyKey) || 0;
  const duracao = getDuration(r);

  let finalQty = specialtyBaseQty;
  let origem = "dia";

  if (specialtyBaseQty === 0 && allRecords && allRecords.length > 0) {
    // FALLBACK: historical average (last 7 days)
    const historicalAvg = getHistoricalSpecialtyAvg(r.especialidade_id, r.data, allRecords);
    if (historicalAvg > 0) {
      finalQty = historicalAvg;
      origem = "historico_7dias";
    } else {
      // FALLBACK do fallback: default value
      finalQty = FALLBACK_DEFAULT_QTY;
      origem = "default_fallback";
    }
  }

  console.log({
    especialidade: (r.especialidades as any)?.nome || r.especialidade_id || "Sem especialidade",
    data: r.data,
    tem_base_no_dia: specialtyBaseQty > 0,
    QTD_base_especialidade: specialtyBaseQty,
    qtd_dinamica: finalQty,
    origem,
    duracao,
    valor_final: finalQty * duracao,
  });

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
    if (usesDerivedHHValue(r)) {
      qty = specialtyBaseMap.get(`${r.data}|${r.especialidade_id ?? "sem-especialidade"}`) || 0;
      // Apply fallback if no base in day
      if (qty === 0 && allRecords && allRecords.length > 0) {
        const hist = getHistoricalSpecialtyAvg(r.especialidade_id, r.data, allRecords);
        qty = hist > 0 ? hist : FALLBACK_DEFAULT_QTY;
      }
    } else {
      qty = getStoredQty(r);
    }
    const dur = getDuration(r);
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
  const qty = getStoredQty(r);
  const duracao = getDuration(r);

  if (HH_DESCRIPTIONS.has(desc)) {
    return qty * duracao;
  }
  return qty;
}

/**
 * Compute the confidence factor for a day group.
 * fator = min(1, unique_hours / 8)
 * Uses unique observation hours (horario field) as sample density metric.
 */
export function computeConfidenceFactor(dayRecords: any[]): number {
  const uniqueHours = new Set<string>();
  for (const r of dayRecords) {
    const rawHorario = r.horario ?? "";
    const hour = rawHorario.length >= 5 ? rawHorario.slice(0, 5) : rawHorario;
    if (hour) uniqueHours.add(hour);
  }
  const total_observacoes_dia = uniqueHours.size;
  const fator = Math.min(1, total_observacoes_dia / 8);

  console.log({
    total_observacoes_dia,
    horarios_unicos: [...uniqueHours],
    fator_confiabilidade: fator,
  });

  return fator;
}

/**
 * Compute percentage for each description using the full HH model.
 * Groups records by day/obra to calculate HH_medio_dia per group,
 * then sums HH values per description across all groups.
 * Applies confidence factor per day group.
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

  // Pre-compute HH_medio_dia and confidence factor for each day group
  const hhMedioMap = new Map<string, number>();
  const confidenceMap = new Map<string, number>();
  for (const [key, recs] of dayGroups) {
    hhMedioMap.set(key, computeHHMedioDia(recs, groupRecords));
    confidenceMap.set(key, computeConfidenceFactor(recs));
  }

  // Sum HH values per description (with confidence factor applied)
  const descValues: Record<string, number> = {};
  for (const desc of descriptions) {
    descValues[desc] = 0;
  }

  for (const r of groupRecords) {
    const desc = canonicalDescription(r.descricao || "Sem descrição");
    const key = `${r.data}|${r.obra_id}`;
    const hhMedio = hhMedioMap.get(key) || 1;
    const fator = confidenceMap.get(key) || 1;
    const valor_original = getRecordHHWithContext(r, hhMedio, dayGroups.get(key) || [], groupRecords);
    const valor_ajustado = valor_original * fator;

    console.log({
      fator_confiabilidade: fator,
      valor_original,
      valor_ajustado,
      descricao: desc,
      data: r.data,
    });

    if (desc in descValues) {
      descValues[desc] += valor_ajustado;
    }
  }

  // Total of all adjusted HH values
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
 * Applies confidence factor.
 */
export function getRecordValue(r: any, allRecords: any[]): number {
  // Find all records from the same day/obra
  const dayKey = `${r.data}|${r.obra_id}`;
  const dayRecords = allRecords.filter(rec => `${rec.data}|${rec.obra_id}` === dayKey);
  const hhMedio = computeHHMedioDia(dayRecords, allRecords);
  const valor_original = getRecordHHWithContext(r, hhMedio, dayRecords, allRecords);
  const fator = computeConfidenceFactor(dayRecords);
  const valor_ajustado = valor_original * fator;

  console.log({
    fator_confiabilidade: fator,
    valor_original,
    valor_ajustado,
  });

  return valor_ajustado;
}
