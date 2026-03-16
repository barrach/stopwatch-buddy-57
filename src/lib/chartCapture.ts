import html2canvas from "html2canvas";

export interface ChartImages {
  contrato?: string;
  categoria?: string;
  paretoCategoria?: string;
  paretoEspecialidade?: string;
  especialidade?: string;
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
  "externas",
] as const;

/**
 * Finds the inner chart element (recharts container/wrapper or svg) inside a card,
 * so we capture ONLY the chart — never the card background/shadow/border.
 */
function findChartElement(cardEl: HTMLElement): HTMLElement {
  // Priority: recharts-responsive-container > recharts-wrapper > svg > card
  const responsive = cardEl.querySelector(".recharts-responsive-container") as HTMLElement;
  if (responsive) return responsive;
  const wrapper = cardEl.querySelector(".recharts-wrapper") as HTMLElement;
  if (wrapper) return wrapper;
  const svg = cardEl.querySelector("svg.recharts-surface") as HTMLElement;
  if (svg) return svg;
  return cardEl;
}

/**
 * Temporarily strip ALL card/dashboard styles so the capture is clean:
 * white background, no shadow, no border, no border-radius.
 * Also cleans all ancestor elements up to the card boundary.
 */
function applyCleanStyles(el: HTMLElement): () => void {
  const restoreFns: Array<() => void> = [];

  // Clean the card element itself
  const cleanElement = (target: HTMLElement) => {
    const orig = {
      background: target.style.background,
      backgroundColor: target.style.backgroundColor,
      boxShadow: target.style.boxShadow,
      border: target.style.border,
      borderRadius: target.style.borderRadius,
      outline: target.style.outline,
    };
    target.style.background = "white";
    target.style.backgroundColor = "#ffffff";
    target.style.boxShadow = "none";
    target.style.border = "none";
    target.style.borderRadius = "0";
    target.style.outline = "none";

    restoreFns.push(() => {
      target.style.background = orig.background;
      target.style.backgroundColor = orig.backgroundColor;
      target.style.boxShadow = orig.boxShadow;
      target.style.border = orig.border;
      target.style.borderRadius = orig.borderRadius;
      target.style.outline = orig.outline;
    });
  };

  cleanElement(el);

  // Also clean immediate parent containers that may add visual noise
  let parent = el.parentElement;
  let depth = 0;
  while (parent && depth < 3) {
    const computed = window.getComputedStyle(parent);
    if (computed.boxShadow !== "none" || computed.borderRadius !== "0px") {
      cleanElement(parent);
    }
    parent = parent.parentElement;
    depth++;
  }

  return () => {
    restoreFns.forEach((fn) => fn());
  };
}

async function captureElement(cardEl: HTMLElement): Promise<{ data: string; width: number; height: number }> {
  const chartEl = findChartElement(cardEl);

  // Temporarily clean the card wrapper and parent styles
  const restoreCard = applyCleanStyles(cardEl);

  // Wait for chart animations/renders to fully settle (500ms as specified)
  await new Promise((r) => setTimeout(r, 500));

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
  setParetoMode: (mode: "categoria" | "especialidade") => void,
  currentParetoMode: "categoria" | "especialidade",
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
  const paretoModes: Array<{ mode: "categoria" | "especialidade"; key: keyof ChartImages }> = [
    { mode: "categoria", key: "paretoCategoria" },
    { mode: "especialidade", key: "paretoEspecialidade" },
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
