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
 * Capture the FULL card element (chart + legend together).
 * Temporarily clean visual noise (shadows, borders, dark backgrounds).
 */
async function captureCard(cardEl: HTMLElement): Promise<{ data: string; width: number; height: number }> {
  // Save and override styles for a clean white capture
  const saved = new Map<HTMLElement, Record<string, string>>();

  const clean = (el: HTMLElement) => {
    const orig: Record<string, string> = {};
    const props = ["background", "backgroundColor", "boxShadow", "border", "borderRadius", "outline"] as const;
    for (const p of props) orig[p] = el.style[p as any];
    el.style.background = "#ffffff";
    el.style.backgroundColor = "#ffffff";
    el.style.boxShadow = "none";
    el.style.border = "none";
    el.style.borderRadius = "0";
    el.style.outline = "none";
    saved.set(el, orig);
  };

  clean(cardEl);
  // Also clean 2 ancestor levels (grid wrappers may add shadow)
  let parent = cardEl.parentElement;
  for (let i = 0; i < 2 && parent; i++) {
    const cs = window.getComputedStyle(parent);
    if (cs.boxShadow !== "none" || cs.borderRadius !== "0px") clean(parent);
    parent = parent.parentElement;
  }

  await new Promise((r) => setTimeout(r, 600));

  const canvas = await html2canvas(cardEl, {
    backgroundColor: "#FFFFFF",
    scale: 3,
    logging: false,
    useCORS: true,
    allowTaint: true,
    scrollX: 0,
    scrollY: 0,
    windowWidth: cardEl.scrollWidth,
    windowHeight: cardEl.scrollHeight,
    width: cardEl.scrollWidth,
    height: cardEl.scrollHeight,
  });

  // Restore
  for (const [el, orig] of saved) {
    for (const [k, v] of Object.entries(orig)) (el.style as any)[k] = v;
  }

  return {
    data: canvas.toDataURL("image/png", 0.92),
    width: cardEl.scrollWidth,
    height: cardEl.scrollHeight,
  };
}

export async function captureAllCharts(
  setTimeViewMode: (mode: "horario" | "diasemana" | "mes") => void,
  currentTimeViewMode: "horario" | "diasemana" | "mes",
  setParetoMode: (mode: "categoria" | "especialidade") => void,
  currentParetoMode: "categoria" | "especialidade",
): Promise<{ images: ChartImages; dimensions: ChartDimensions }> {
  const images: ChartImages = {};
  const dimensions: ChartDimensions = {};

  // Static charts
  for (const id of STATIC_CHART_IDS) {
    const el = document.getElementById(`chart-${id}`);
    if (el) {
      try {
        const r = await captureCard(el);
        images[id] = r.data;
        dimensions[id] = { width: r.width, height: r.height };
      } catch (e) { console.warn(`Capture chart-${id} failed:`, e); }
    }
  }

  // Pareto variants
  for (const { mode, key } of [
    { mode: "categoria" as const, key: "paretoCategoria" as keyof ChartImages },
    { mode: "especialidade" as const, key: "paretoEspecialidade" as keyof ChartImages },
  ]) {
    setParetoMode(mode);
    await new Promise((r) => setTimeout(r, 1200));
    const el = document.getElementById("chart-pareto");
    if (el) {
      try {
        const r = await captureCard(el);
        images[key] = r.data;
        dimensions[key as string] = { width: r.width, height: r.height };
      } catch (e) { console.warn(`Capture pareto ${mode} failed:`, e); }
    }
  }
  setParetoMode(currentParetoMode);

  // Time variants
  for (const { mode, key } of [
    { mode: "horario" as const, key: "tempoHorario" as keyof ChartImages },
    { mode: "diasemana" as const, key: "tempoDiaSemana" as keyof ChartImages },
    { mode: "mes" as const, key: "tempoMes" as keyof ChartImages },
  ]) {
    setTimeViewMode(mode);
    await new Promise((r) => setTimeout(r, 1200));
    const el = document.getElementById("chart-tempo");
    if (el) {
      try {
        const r = await captureCard(el);
        images[key] = r.data;
        dimensions[key as string] = { width: r.width, height: r.height };
      } catch (e) { console.warn(`Capture tempo ${mode} failed:`, e); }
    }
  }
  setTimeViewMode(currentTimeViewMode);

  return { images, dimensions };
}
