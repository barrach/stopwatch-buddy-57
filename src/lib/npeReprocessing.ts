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

function getBaseQuantity(r: any): number {
  if (r.quantidade_base != null) return Number(r.quantidade_base) || 0;
  return r.quantidade || 0;
}

/** Get HH value for a record: qty × duration (default 1h) */
function recordHH(r: any): number {
  const qty = getBaseQuantity(r);
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

  // Identify which records are dynamic (NPE/PT)
  const isDynamic = (r: any): boolean => {
    const isNpe = isNpeRecord(r, info);
    const isPt = isExcludedFromAverage(r);
    if (!isNpe && !isPt) return false;
    if (isPt && !isNpe) return r.is_dinamico === true;
    return true;
  };

   // Group by (date, obra_id) to compute HH totals using original/base quantity for dynamic rows.
  const hhTotalMap = new Map<string, number>();
  const qtyTotalMap = new Map<string, number>();

  for (const r of records) {
    const key = `${r.data}|${r.obra_id}`;
    const duracao = r.duracao_horas != null ? Number(r.duracao_horas) : 1.0;
    if (isDynamic(r)) {
       const baseQty = getBaseQuantity(r);
       hhTotalMap.set(key, (hhTotalMap.get(key) || 0) + (baseQty * duracao));
       qtyTotalMap.set(key, (qtyTotalMap.get(key) || 0) + baseQty);
    } else {
      const qty = r.quantidade || 0;
      hhTotalMap.set(key, (hhTotalMap.get(key) || 0) + qty * duracao);
      qtyTotalMap.set(key, (qtyTotalMap.get(key) || 0) + qty);
    }
  }

  return records.map((r) => {
    if (!isDynamic(r)) return r;

    const key = `${r.data}|${r.obra_id}`;
    const hhTotal = hhTotalMap.get(key) || 0;
    const qtyTotal = qtyTotalMap.get(key) || 0;

    if (hhTotal <= 0 || qtyTotal <= 0) return r;

    // Dynamic records: quantidade = HH real (qtd_base × duração)
    const newQty = Math.round(recordHH(r) * 100) / 100;

    return { ...r, quantidade: newQty > 0.01 ? newQty : 0.01 };
  });
}
