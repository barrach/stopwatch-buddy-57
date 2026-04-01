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
    sourceDescricao: "Trabalhando",
    splits: [
      { descricao: "Trabalhando", fraction: 0.333 },
      { descricao: "Aguardando Liberação de PT", fraction: 0.667 },
    ],
    reason: "Medição das 08:00 realizada às 08:50 após liberação de PT às 08:40. 40min PT + 20min produção.",
  },
];

/**
 * Apply manual adjustments to a list of records (for visualization only).
 * Returns a new array with adjusted records — original records are NOT mutated.
 * 
 * For matching records, the original is replaced by N virtual copies
 * with adjusted `quantidade` values according to the split fractions.
 */
export function applyManualAdjustments(records: any[]): any[] {
  const result: any[] = [];

  for (const r of records) {
    const normalizedHorario = (r.horario || "").slice(0, 5);
    
    // Check if this record matches any adjustment
    const adjustment = MANUAL_ADJUSTMENTS.find(
      (adj) =>
        r.data === adj.date &&
        normalizedHorario === adj.horario &&
        (r.descricao || "") === adj.sourceDescricao
    );

    if (adjustment) {
      // Split record into virtual copies
      for (const split of adjustment.splits) {
        const qty = Number(r.quantidade_base ?? r.quantidade ?? 0);
        result.push({
          ...r,
          descricao: split.descricao,
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
