import React from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { CANONICAL_ORDER_FULL } from "@/lib/chartConstants";
import { normalizeToHundred } from "@/lib/hourlyAverageCalc";
import {
  StackedBarChartSection, ParetoChartSection, ExternalPieSection,
} from "@/components/ReportCharts";
import type { SavedReport } from "@/components/SavedReportsList";
import type { SavedReportExternalCause } from "./savedReportExternalCauses";

export interface SavedReportChartImages {
  byObra?: string;
  bySpecialty?: string;
  byHorario?: string;
  byDiaSemana?: string;
  byMes?: string;
  pareto?: string;
  externalCausas?: string;
}

export interface SavedReportChartDimensions {
  [key: string]: { width: number; height: number };
}

function normalizeRows(rows: any[], xKey: string): any[] {
  if (!rows || rows.length === 0) return [];
  return rows.map(row => {
    const keys = CANONICAL_ORDER_FULL.filter(d => row[d] !== undefined && row[d] !== null);
    if (keys.length === 0) return row;
    const rawValues = keys.map(d => Number(row[d]) || 0);
    const sum = rawValues.reduce((s, v) => s + v, 0);
    if (sum <= 0) return row;
    const normalized = normalizeToHundred(keys, rawValues);
    const newRow: any = { [xKey]: row[xKey], total: row.total };
    for (const d of CANONICAL_ORDER_FULL) {
      newRow[d] = normalized[d] ?? row[d] ?? 0;
    }
    return newRow;
  });
}

async function captureElement(el: HTMLElement): Promise<{ data: string; width: number; height: number }> {
  // Find the recharts container inside
  const chartEl =
    (el.querySelector(".recharts-responsive-container") as HTMLElement) ||
    (el.querySelector(".recharts-wrapper") as HTMLElement) ||
    el;

  const canvas = await html2canvas(chartEl, {
    backgroundColor: "#FFFFFF",
    scale: 3,
    logging: false,
    useCORS: true,
    allowTaint: true,
    scrollX: 0,
    scrollY: 0,
    width: chartEl.scrollWidth,
    height: chartEl.scrollHeight,
  });

  return {
    data: canvas.toDataURL("image/png", 0.95),
    width: chartEl.scrollWidth,
    height: chartEl.scrollHeight,
  };
}

/**
 * Renders chart components off-screen, captures them as images, then cleans up.
 */
export async function captureSavedReportCharts(
  report: SavedReport,
  externalCausasOverride?: SavedReportExternalCause[]
): Promise<{ images: SavedReportChartImages; dimensions: SavedReportChartDimensions }> {
  const s = report.snapshot;
  const images: SavedReportChartImages = {};
  const dimensions: SavedReportChartDimensions = {};

  // Create off-screen container
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "900px";
  container.style.opacity = "1";
  container.style.pointerEvents = "none";
  container.style.zIndex = "-1";
  container.style.background = "#FFFFFF";
  document.body.appendChild(container);

  // Define all charts to render
  const chartConfigs: Array<{
    key: keyof SavedReportChartImages;
    element: React.ReactElement | null;
  }> = [
    {
      key: "byObra",
      element: s.byObra?.length ? (
        <StackedBarChartSection
          data={normalizeRows(s.byObra, "name")}
          dataKeyX="name"
          descriptions={CANONICAL_ORDER_FULL}
          title="Visão Geral por Contrato"
          xAngle={-15}
          legendBelow={true}
        />
      ) : null,
    },
    {
      key: "bySpecialty",
      element: s.bySpecialty?.length ? (
        <StackedBarChartSection
          data={normalizeRows(s.bySpecialty, "name")}
          dataKeyX="name"
          descriptions={CANONICAL_ORDER_FULL}
          title="Produtividade por Especialidade"
          xAngle={-25}
          legendBelow={true}
        />
      ) : null,
    },
    {
      key: "byHorario",
      element: s.byHorario?.length ? (
        <StackedBarChartSection
          data={normalizeRows(s.byHorario, "time")}
          dataKeyX="time"
          descriptions={CANONICAL_ORDER_FULL}
          title="Produtividade por Horário"
          legendBelow={true}
        />
      ) : null,
    },
    {
      key: "byDiaSemana",
      element: s.byDiaSemana?.length ? (
        <StackedBarChartSection
          data={normalizeRows(s.byDiaSemana, "time")}
          dataKeyX="time"
          descriptions={CANONICAL_ORDER_FULL}
          title="Produtividade por Dia da Semana"
          legendBelow={true}
        />
      ) : null,
    },
    {
      key: "byMes",
      element: s.byMes?.length ? (
        <StackedBarChartSection
          data={normalizeRows(s.byMes, "time")}
          dataKeyX="time"
          descriptions={CANONICAL_ORDER_FULL}
          title="Produtividade por Mês"
          legendBelow={true}
        />
      ) : null,
    },
    {
      key: "pareto",
      element: s.paretoData?.length ? (
        <ParetoChartSection data={s.paretoData} title="Top Causas (Pareto)" mode="categoria" />
      ) : null,
    },
    {
      key: "externalCausas",
      element: (externalCausasOverride || s.externalCausas)?.length ? (
        <ExternalPieSection data={externalCausasOverride || s.externalCausas} title="Causas Externas de Parada (NPE)" />
      ) : null,
    },
  ];

  // Render and capture each chart one at a time
  for (const config of chartConfigs) {
    if (!config.element) continue;

    const chartDiv = document.createElement("div");
    chartDiv.style.width = "900px";
    chartDiv.style.background = "#FFFFFF";
    chartDiv.style.padding = "16px";
    container.appendChild(chartDiv);

    const root = createRoot(chartDiv);
    root.render(config.element);

    // Wait for Recharts to fully render (SVG + animations)
    await new Promise(r => setTimeout(r, 1500));

    try {
      const result = await captureElement(chartDiv);
      images[config.key] = result.data;
      dimensions[config.key] = { width: result.width, height: result.height };
    } catch (e) {
      console.warn(`Failed to capture saved report chart ${config.key}:`, e);
    }

    root.unmount();
    container.removeChild(chartDiv);
  }

  // Cleanup
  document.body.removeChild(container);

  return { images, dimensions };
}
