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

/** Stores original pixel dimensions of each captured chart */
export interface ChartDimensions {
  [key: string]: { width: number; height: number };
}

const STATIC_CHART_IDS = [
  "contrato",
  "categoria",
  "especialidade",
  "funcao",
  "naoprod",
  "externas",
] as const;

async function captureElement(el: HTMLElement): Promise<{ data: string; width: number; height: number }> {
  // Force white background and ensure full visibility before capture
  const canvas = await html2canvas(el, {
    backgroundColor: "#FFFFFF",
    scale: 4,
    logging: false,
    useCORS: true,
    allowTaint: true,
    scrollX: 0,
    scrollY: 0,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
    // Ensure we capture the full element including overflow
    width: el.scrollWidth,
    height: el.scrollHeight,
  });
  return {
    data: canvas.toDataURL("image/png"),
    width: el.scrollWidth,
    height: el.scrollHeight,
  };
}

/**
 * Captures all dashboard charts as base64 PNG images.
 * Switches Pareto mode and time view mode to capture all variants.
 * Returns both images and their original dimensions for proper aspect ratio in exports.
 */
export async function captureAllCharts(
  setTimeViewMode: (mode: "horario" | "diasemana" | "mes") => void,
  currentTimeViewMode: "horario" | "diasemana" | "mes",
  setParetoMode: (mode: "categoria" | "especialidade" | "funcao") => void,
  currentParetoMode: "categoria" | "especialidade" | "funcao",
): Promise<{ images: ChartImages; dimensions: ChartDimensions }> {
  const images: ChartImages = {};
  const dimensions: ChartDimensions = {};

  // Capture static charts
  for (const id of STATIC_CHART_IDS) {
    const el = document.getElementById(`chart-${id}`);
    if (el) {
      try {
        const result = await captureElement(el);
        images[id] = result.data;
        dimensions[id] = { width: result.width, height: result.height };
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
    await new Promise((r) => setTimeout(r, 1200));
    const el = document.getElementById("chart-pareto");
    if (el) {
      try {
        const result = await captureElement(el);
        images[key] = result.data;
        dimensions[key as string] = { width: result.width, height: result.height };
      } catch (e) {
        console.warn(`Failed to capture chart-pareto (${mode}):`, e);
      }
    }
  }
  setParetoMode(currentParetoMode);

  // Capture time charts — all 3 variants
  const timeModes: Array<{ mode: "horario" | "diasemana" | "mes"; key: keyof ChartImages }> = [
    { mode: "horario", key: "tempoHorario" },
    { mode: "diasemana", key: "tempoDiaSemana" },
    { mode: "mes", key: "tempoMes" },
  ];

  for (const { mode, key } of timeModes) {
    setTimeViewMode(mode);
    await new Promise((r) => setTimeout(r, 1200));
    const el = document.getElementById("chart-tempo");
    if (el) {
      try {
        const result = await captureElement(el);
        images[key] = result.data;
        dimensions[key as string] = { width: result.width, height: result.height };
      } catch (e) {
        console.warn(`Failed to capture chart-tempo (${mode}):`, e);
      }
    }
  }
  setTimeViewMode(currentTimeViewMode);

  return { images, dimensions };
}
