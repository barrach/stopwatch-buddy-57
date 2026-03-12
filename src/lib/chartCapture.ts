import html2canvas from "html2canvas";

export interface ChartImages {
  contrato?: string;
  categoria?: string;
  pareto?: string;
  especialidade?: string;
  funcao?: string;
  naoprod?: string;
  externas?: string;
  tempoHorario?: string;
  tempoDiaSemana?: string;
  tempoMes?: string;
}

const CHART_IDS = [
  "contrato",
  "categoria",
  "pareto",
  "especialidade",
  "funcao",
  "naoprod",
  "externas",
] as const;

async function captureElement(el: HTMLElement): Promise<string> {
  const canvas = await html2canvas(el, {
    backgroundColor: "#111827",
    scale: 2,
    logging: false,
    useCORS: true,
    allowTaint: true,
  });
  return canvas.toDataURL("image/png");
}

/**
 * Captures all dashboard charts as base64 PNG images.
 * For time charts, it switches the view mode, waits for re-render, and captures each variant.
 */
export async function captureAllCharts(
  setTimeViewMode: (mode: "horario" | "diasemana" | "mes") => void,
  currentTimeViewMode: "horario" | "diasemana" | "mes",
): Promise<ChartImages> {
  const images: ChartImages = {};

  // Capture static charts
  for (const id of CHART_IDS) {
    const el = document.getElementById(`chart-${id}`);
    if (el) {
      try {
        images[id] = await captureElement(el);
      } catch (e) {
        console.warn(`Failed to capture chart-${id}:`, e);
      }
    }
  }

  // Capture time charts — all 3 variants
  const timeEl = document.getElementById("chart-tempo");
  if (timeEl) {
    const modes: Array<{ mode: "horario" | "diasemana" | "mes"; key: keyof ChartImages }> = [
      { mode: "horario" as const, key: "tempoHorario" as keyof ChartImages },
      { mode: "diasemana" as const, key: "tempoDiaSemana" as keyof ChartImages },
      { mode: "mes" as const, key: "tempoMes" as keyof ChartImages },
    ];

    for (const { mode, key } of modes) {
      setTimeViewMode(mode);
      // Wait for React re-render + recharts animation
      await new Promise((r) => setTimeout(r, 800));
      try {
        images[key] = await captureElement(timeEl);
      } catch (e) {
        console.warn(`Failed to capture chart-tempo (${mode}):`, e);
      }
    }

    // Restore original mode
    setTimeViewMode(currentTimeViewMode);
  }

  return images;
}
