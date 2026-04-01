/**
 * Manual Adjustments for Visualization
 * 
 * These adjustments correct known measurement distortions
 * WITHOUT modifying original database records.
 * Applied only at visualization/calculation time.
 */

interface ManualAdjustment {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Time slot (HH:mm) */
  horario: string;
  /** Description of the original record to split. Use "*" to match ALL descriptions. */
  sourceDescricao: string;
  /** Splits: each entry gets a fraction of the original quantity. Use "__KEEP__" to keep original descricao. */
  splits: Array<{
    descricao: string;
    fraction: number;
  }>;
  /** Reason for the adjustment (documentation only) */
  reason: string;
}

/**
 * Registry of manual adjustments.
 * Add new entries here as needed.
 */
const MANUAL_ADJUSTMENTS: ManualAdjustment[] = [
  {
    date: "2026-03-31",
    horario: "08:00",
    sourceDescricao: "*",
    splits: [
      { descricao: "__KEEP__", fraction: 0.333 },
      { descricao: "Aguardando Liberação de PT", fraction: 0.667 },
    ],
    reason: "Medição das 08:00 realizada às 08:50 após liberação de PT às 08:40. 40min PT + 20min produção.",
  },
  {
    date: "2026-03-31",
    horario: "13:00",
    sourceDescricao: "*",
    splits: [
      { descricao: "__KEEP__", fraction: 0.50 },
      { descricao: "Transitando no local de trabalho - com ferramenta", fraction: 0.20 },
      { descricao: "Transitando no local de trabalho - sem ferramenta", fraction: 0.15 },
      { descricao: "Aguardando Ferramenta ou Material", fraction: 0.15 },
    ],
    reason: "Medição das 13:00 realizada às 13:30. 30min não observados distribuídos conforme padrão real de campo.",
  },
];

/**
 * Apply manual adjustments to a list of records (for visualization only).
 * Returns a new array with adjusted records — original records are NOT mutated.
 */
export function applyManualAdjustments(records: any[]): any[] {
  const result: any[] = [];

  for (const r of records) {
    const normalizedHorario = (r.horario || "").slice(0, 5);
    
    const adjustment = MANUAL_ADJUSTMENTS.find(
      (adj) =>
        r.data === adj.date &&
        normalizedHorario === adj.horario &&
        (adj.sourceDescricao === "*" || (r.descricao || "") === adj.sourceDescricao)
    );

    if (adjustment) {
      for (const split of adjustment.splits) {
        const qty = Number(r.quantidade_base ?? r.quantidade ?? 0);
        result.push({
          ...r,
          descricao: split.descricao === "__KEEP__" ? r.descricao : split.descricao,
          quantidade: Math.round(qty * split.fraction * 100) / 100,
          quantidade_base: Math.round(qty * split.fraction * 100) / 100,
          _manual_adjustment: true,
          _adjustment_reason: adjustment.reason,
        });
      }
    } else {
      result.push(r);
    }
  }

  return result;
}

/** Distribution rules per time slot for DB-stored weighting */
const WEIGHTING_DISTRIBUTION: Record<string, Array<{ descricao: string; fraction: number }>> = {
  "08:00": [
    { descricao: "Aguardando Liberação de PT", fraction: 1.0 },
  ],
  "13:00": [
    { descricao: "Aguardando Ferramenta ou Material", fraction: 0.30 },
    { descricao: "Transitando no local de trabalho - com ferramenta", fraction: 0.40 },
    { descricao: "Transitando no local de trabalho - sem ferramenta", fraction: 0.30 },
  ],
};

/**
 * Apply DB-stored ponderação (weighting) to records.
 * Records with ponderado=true get split into:
 * - Original record with peso_real fraction
 * - Complementary virtual records for the non-observed fraction
 */
export function applyDbWeighting(records: any[]): any[] {
  const result: any[] = [];

  for (const r of records) {
    if (!r.ponderado || !r.peso_real) {
      result.push(r);
      continue;
    }

    const pesoReal = Number(r.peso_real);
    const pesoRestante = 1 - pesoReal;
    const normalizedHorario = (r.horario || "").slice(0, 5);
    const qty = Number(r.quantidade_base ?? r.quantidade ?? 0);

    // Keep original record with reduced weight
    result.push({
      ...r,
      quantidade: Math.round(qty * pesoReal * 100) / 100,
      quantidade_base: Math.round(qty * pesoReal * 100) / 100,
      _ponderado: true,
    });

    // Add complementary virtual records
    const distribution = WEIGHTING_DISTRIBUTION[normalizedHorario];
    if (distribution && pesoRestante > 0) {
      for (const d of distribution) {
        result.push({
          ...r,
          id: `${r.id}_pond_${d.descricao.slice(0, 10)}`,
          descricao: d.descricao,
          quantidade: Math.round(qty * pesoRestante * d.fraction * 100) / 100,
          quantidade_base: Math.round(qty * pesoRestante * d.fraction * 100) / 100,
          _ponderado_virtual: true,
          _ponderado: true,
        });
      }
    }
  }

  return result;
}
