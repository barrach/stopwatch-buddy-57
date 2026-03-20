/**
 * NPE Dynamic Reprocessing Engine
 *
 * For each (date, especialidade_id), computes the average non-NPE samples per hour,
 * then replaces NPE record quantities with that average — at runtime, without
 * modifying database records.
 *
 * Classification is based on parent category (impacta_produtividade flag / categoria_pai_id),
 * NEVER on description text.
 */

import { normalizeDescriptionName } from "@/lib/categoryNormalization";

export interface NpeParentInfo {
  /** Map of category ID → impacta_produtividade of its PARENT (or itself if root) */
  impactMap: Record<string, boolean>;
}

/**
 * Determines if a record is NPE based on category metadata (not text).
 * A record is NPE when its category or parent category has impacta_produtividade === false.
 */
function isNpeRecord(r: any, info: NpeParentInfo): boolean {
  const cat = r.categorias_observacao as any;
  if (!cat) return false;
  // Direct flag on the subcategory itself
  if (cat.impacta_produtividade === false) return true;
  // Check parent category flag
  if (cat.categoria_pai_id && info.impactMap[cat.categoria_pai_id] === false) return true;
  return false;
}

/**
 * "Aguardando Liberação de PT" must be excluded from the average calculation
 * even though it is Suplementar, per operational rules.
 */
function isExcludedFromAverage(r: any): boolean {
  const normalized = normalizeDescriptionName(r.descricao);
  return normalized === "Aguardando Liberação de PT";
}

/**
 * Reprocesses an array of observation records, replacing NPE quantities
 * with the computed per-specialty daily average of non-NPE records.
 *
 * Returns a NEW array (no mutation). Non-NPE records are returned as-is.
 *
 * @param records  - observation rows (must include categorias_observacao join)
 * @param parentCats - parent category rows with { id, impacta_produtividade }
 */
export function reprocessNpeQuantities<T extends Record<string, any>>(
  records: T[],
  parentCats: Array<{ id: string; impacta_produtividade: boolean | null }>
): T[] {
  if (!records.length) return records;

  // Build impact lookup from parent categories
  const impactMap: Record<string, boolean> = {};
  parentCats.forEach((c) => {
    impactMap[c.id] = c.impacta_produtividade !== false;
  });
  const info: NpeParentInfo = { impactMap };

  // Step 1: group non-NPE records by (date, especialidade_id) → per-hour totals
  // Key: "date|especialidade_id"
  const groupMap = new Map<string, Map<string, number>>();

  for (const r of records) {
    if (isNpeRecord(r, info)) continue;
    if (isExcludedFromAverage(r)) continue;
    const key = `${r.data}|${r.especialidade_id}`;
    let hourMap = groupMap.get(key);
    if (!hourMap) {
      hourMap = new Map<string, number>();
      groupMap.set(key, hourMap);
    }
    const hour = r.horario as string;
    hourMap.set(hour, (hourMap.get(hour) || 0) + (r.quantidade || 0));
  }

  // Step 2: compute averages
  const avgMap = new Map<string, number>();
  for (const [key, hourMap] of groupMap) {
    const totalQty = Array.from(hourMap.values()).reduce((a, b) => a + b, 0);
    const numHours = hourMap.size;
    avgMap.set(key, numHours > 0 ? totalQty / numHours : 0);
  }

  // Step 3: return records with NPE or PT quantities replaced
  return records.map((r) => {
    const isNpe = isNpeRecord(r, info);
    const isPt = isExcludedFromAverage(r);
    if (!isNpe && !isPt) return r;

    // NPE is always dynamic. PT is dynamic only if is_dinamico === true
    // For legacy records (is_dinamico === null/undefined), NPE is always reprocessed,
    // PT keeps its DB value (already batch-corrected).
    if (isPt && !isNpe) {
      if (r.is_dinamico !== true) return r;
    }

    const key = `${r.data}|${r.especialidade_id}`;
    const avg = avgMap.get(key);
    // If no valid data exists for that day/specialty, keep original (fallback)
    if (avg === undefined || avg === 0) return r;
    return { ...r, quantidade: Math.round(avg) };
  });
}
