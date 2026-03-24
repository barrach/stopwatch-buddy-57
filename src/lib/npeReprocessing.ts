/**
 * NPE Dynamic Reprocessing Engine (HH-based)
 *
 * For NPE and dynamic PT records, replaces quantities with a proportional
 * value based on Man-Hours (HH = qty × duration).
 *
 * Formula:
 *   HH_record = qty × duracao_horas (default 1.0)
 *   HH_total_day = sum of all records' HH for same (date, obra)
 *   proportion = HH_record / HH_total_day
 *   new_qty = proportion × total_samples_of_day
 *
 * This ensures NPE/PT values reflect real operational impact (time × staff).
 */

import { normalizeDescriptionName } from "@/lib/categoryNormalization";

export interface NpeParentInfo {
  impactMap: Record<string, boolean>;
}

function isNpeRecord(r: any, info: NpeParentInfo): boolean {
  const cat = r.categorias_observacao as any;
  if (!cat) return false;
  if (cat.impacta_produtividade === false) return true;
  if (cat.categoria_pai_id && info.impactMap[cat.categoria_pai_id] === false) return true;
  return false;
}

function isExcludedFromAverage(r: any): boolean {
  const normalized = normalizeDescriptionName(r.descricao);
  return normalized === "Aguardando Liberação de PT";
}

/** Get HH value for a record: qty × duration (default 1h) */
function recordHH(r: any): number {
  const qty = r.quantidade || 0;
  const duracao = r.duracao_horas != null ? Number(r.duracao_horas) : 1.0;
  return qty * duracao;
}

export function reprocessNpeQuantities<T extends Record<string, any>>(
  records: T[],
  parentCats: Array<{ id: string; impacta_produtividade: boolean | null }>
): T[] {
  if (!records.length) return records;

  const impactMap: Record<string, boolean> = {};
  parentCats.forEach((c) => {
    impactMap[c.id] = c.impacta_produtividade !== false;
  });
  const info: NpeParentInfo = { impactMap };

  // Group by (date, obra_id) to compute HH totals
  // key: "date|obra_id"
  const hhTotalMap = new Map<string, number>();
  const qtyTotalMap = new Map<string, number>();

  for (const r of records) {
    const key = `${r.data}|${r.obra_id}`;
    hhTotalMap.set(key, (hhTotalMap.get(key) || 0) + recordHH(r));
    qtyTotalMap.set(key, (qtyTotalMap.get(key) || 0) + (r.quantidade || 0));
  }

  return records.map((r) => {
    const isNpe = isNpeRecord(r, info);
    const isPt = isExcludedFromAverage(r);
    if (!isNpe && !isPt) return r;

    // NPE is always dynamic. PT is dynamic only if is_dinamico === true
    if (isPt && !isNpe) {
      if (r.is_dinamico !== true) return r;
    }

    const key = `${r.data}|${r.obra_id}`;
    const hhTotal = hhTotalMap.get(key) || 0;
    const qtyTotal = qtyTotalMap.get(key) || 0;

    if (hhTotal <= 0 || qtyTotal <= 0) return r;

    // Proportion based on HH impact
    const hh = recordHH(r);
    const proportion = hh / hhTotal;
    const newQty = Math.round(proportion * qtyTotal);

    return { ...r, quantidade: newQty > 0 ? newQty : 1 };
  });
}
