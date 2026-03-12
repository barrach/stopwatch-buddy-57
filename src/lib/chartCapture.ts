import html2canvas from "html2canvas";

export interface ChartImages {
  contrato?: string;
  categoria?: string;
  paretoCategoria?: string;
  paretoEspecialidade?: string;
  paretoFuncao?: string;
  especialidade?: string;
  funcao?: string;
  naoprod?: string;
  externas?: string;
  tempoHorario?: string;
  tempoDiaSemana?: string;
  tempoMes?: string;
}

const STATIC_CHART_IDS = [
  "contrato",
  "categoria",
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
 * Switches Pareto mode (categoria/especialidade/funcao) and time view mode to capture all variants.
 */
export async function captureAllCharts(
  setTimeViewMode: (mode: "horario" | "diasemana" | "mes") => void,
  currentTimeViewMode: "horario" | "diasemana" | "mes",
  setParetoMode: (mode: "categoria" | "especialidade" | "funcao") => void,
  currentParetoMode: "categoria" | "especialidade" | "funcao",
): Promise<ChartImages> {
  const images: ChartImages = {};

  // Capture static charts
  for (const id of STATIC_CHART_IDS) {
    const el = document.getElementById(`chart-${id}`);
    if (el) {
      try {
        images[id] = await captureElement(el);
      } catch (e) {
        console.warn(`Failed to capture chart-${id}:`, e);
      }
    }
  }

  // Capture Pareto — all 3 variants
  const paretoModes: Array<{ mode: "categoria" | "especialidade" | "funcao"; key: keyof ChartImages }> = [
    { mode: "categoria", key: "paretoCategoria" },
    { mode: "especialidade", key: "paretoEspecialidade" },
    { mode: "funcao", key: "paretoFuncao" },
  ];

  for (const { mode, key } of paretoModes) {
    setParetoMode(mode);
    await new Promise((r) => setTimeout(r, 800));
    const el = document.getElementById("chart-pareto");
    if (el) {
      try {
        images[key] = await captureElement(el);
      } catch (e) {
        console.warn(`Failed to capture chart-pareto (${mode}):`, e);
      }
    }
  }
  // Restore original pareto mode
  setParetoMode(currentParetoMode);

  // Capture time charts — all 3 variants
  const timeModes: Array<{ mode: "horario" | "diasemana" | "mes"; key: keyof ChartImages }> = [
    { mode: "horario", key: "tempoHorario" },
    { mode: "diasemana", key: "tempoDiaSemana" },
    { mode: "mes", key: "tempoMes" },
  ];

  for (const { mode, key } of timeModes) {
    setTimeViewMode(mode);
    await new Promise((r) => setTimeout(r, 800));
    const el = document.getElementById("chart-tempo");
    if (el) {
      try {
        images[key] = await captureElement(el);
      } catch (e) {
        console.warn(`Failed to capture chart-tempo (${mode}):`, e);
      }
    }
  }
  // Restore original mode
  setTimeViewMode(currentTimeViewMode);

  return images;
}
