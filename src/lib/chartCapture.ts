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

/**
 * Finds the inner chart element (recharts-wrapper or svg) inside a card,
 * so we capture ONLY the chart — not the card background/shadow/border.
 */
function findChartElement(cardEl: HTMLElement): HTMLElement {
  // Try recharts-responsive-container first (wraps the chart tightly)
  const responsive = cardEl.querySelector(".recharts-responsive-container") as HTMLElement;
  if (responsive) return responsive;
  // Fallback to recharts-wrapper
  const wrapper = cardEl.querySelector(".recharts-wrapper") as HTMLElement;
  if (wrapper) return wrapper;
  // Last resort: the card itself
  return cardEl;
}

/**
 * Temporarily strip card styles from a parent element so html2canvas
 * renders a clean white background with no shadows/borders.
 */
function applyCleanStyles(el: HTMLElement): () => void {
  const orig = {
    background: el.style.background,
    backgroundColor: el.style.backgroundColor,
    boxShadow: el.style.boxShadow,
    border: el.style.border,
    borderRadius: el.style.borderRadius,
    padding: el.style.padding,
  };
  el.style.background = "white";
  el.style.backgroundColor = "#ffffff";
  el.style.boxShadow = "none";
  el.style.border = "none";
  el.style.borderRadius = "0";

  return () => {
    el.style.background = orig.background;
    el.style.backgroundColor = orig.backgroundColor;
    el.style.boxShadow = orig.boxShadow;
    el.style.border = orig.border;
    el.style.borderRadius = orig.borderRadius;
    el.style.padding = orig.padding;
  };
}

async function captureElement(cardEl: HTMLElement): Promise<{ data: string; width: number; height: number }> {
  const chartEl = findChartElement(cardEl);

  // Temporarily clean the card wrapper styles
  const restoreCard = applyCleanStyles(cardEl);

  // Wait for any chart animations/renders to settle
  await new Promise((r) => setTimeout(r, 300));

  const canvas = await html2canvas(chartEl, {
    backgroundColor: "#FFFFFF",
    scale: 4,
    logging: false,
    useCORS: true,
    allowTaint: true,
    scrollX: 0,
    scrollY: 0,
    windowWidth: chartEl.scrollWidth,
    windowHeight: chartEl.scrollHeight,
    width: chartEl.scrollWidth,
    height: chartEl.scrollHeight,
  });

  // Restore original styles
  restoreCard();

  // Apply light compression (quality 0.95)
  const data = canvas.toDataURL("image/png", 0.95);

  return {
    data,
    width: chartEl.scrollWidth,
    height: chartEl.scrollHeight,
  };
}

/**
 * Captures all dashboard charts as base64 PNG images.
 * Captures ONLY the inner chart element (not the card wrapper).
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
