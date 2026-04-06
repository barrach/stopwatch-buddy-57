import jsPDF from "jspdf";
import { format } from "date-fns";
import type { SavedReport } from "@/components/SavedReportsList";
import { PDF_OCEAN_RGB } from "./pdfTextFormatting";
import type { SavedReportChartImages, SavedReportChartDimensions } from "./savedReportChartCapture";
import type { SavedReportExternalCause } from "./savedReportExternalCauses";

type RGB = [number, number, number];

const C = {
  headerBg: [15, 23, 42] as RGB,
  sectionBg: [...PDF_OCEAN_RGB] as RGB,
  white: [255, 255, 255] as RGB,
  textDark: [31, 41, 55] as RGB,
  textMuted: [107, 114, 128] as RGB,
  border: [209, 213, 219] as RGB,
  cardBg: [248, 250, 252] as RGB,
  blue: [...PDF_OCEAN_RGB] as RGB,
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MAX_Y = PAGE_H - 14;
const MAX_CHART_H = 115;

function estimateChartH(dims: SavedReportChartDimensions, key: string, width: number): number {
  const d = dims[key];
  if (!d?.width || !d?.height) return Math.min(width * 0.5, MAX_CHART_H);
  return Math.min(width * (d.height / d.width), MAX_CHART_H);
}

export function generateSavedReportPDF(
  report: SavedReport,
  chartImages: SavedReportChartImages,
  chartDimensions: SavedReportChartDimensions
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const s = report.snapshot;
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");
  const periodLabel = report.date_mode === "single"
    ? report.data_unica || ""
    : `${report.data_inicio} até ${report.data_fim}`;
  const summ = s.summary || {};

  let curY = MARGIN;

  const newPage = () => { doc.addPage(); curY = MARGIN; };
  const ensureSpace = (h: number) => { if (curY + h > MAX_Y) newPage(); };

  const sectionHeader = (title: string) => {
    ensureSpace(14);
    doc.setFillColor(...C.sectionBg);
    doc.roundedRect(MARGIN, curY, CONTENT_W, 10, 1.8, 1.8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...C.white);
    doc.text(title, MARGIN + 5, curY + 6.7);
    curY += 12;
  };

  const addChartImage = (image: string | undefined, dimKey: string): number => {
    if (!image) return 0;
    const h = estimateChartH(chartDimensions, dimKey, CONTENT_W);
    doc.addImage(image, "PNG", MARGIN, curY, CONTENT_W, h);
    curY += h + 3;
    return h;
  };

  // ═══ PAGE 1 — COVER + SUMMARY + VISÃO GERAL ═══
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, PAGE_W, 48, "F");
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("ProdControl", MARGIN, 18);
  doc.setFontSize(13);
  doc.text("Relatório de Produtividade", MARGIN, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Contrato: ${report.obra_nome}`, MARGIN, 38);
  doc.text(`Período: ${periodLabel}`, MARGIN, 44);
  doc.text(`Gerado em: ${dateStr}`, PAGE_W - MARGIN, 44, { align: "right" });
  curY = 54;

  if (report.especialidade_nome) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C.textMuted);
    doc.text(`Especialidade: ${report.especialidade_nome}`, MARGIN, curY);
    curY += 6;
  }

  // KPI cards
  sectionHeader("Resumo do Período");
  const kpis = [
    { label: "Total de Medições", value: String(summ.totalMeasurements != null ? Math.round(summ.totalMeasurements) : "—") },
    { label: "Dias Analisados", value: String(summ.totalDays || "—") },
  ];
  const kpiW = (CONTENT_W - 3) / 2;
  kpis.forEach((kpi, i) => {
    const x = MARGIN + i * (kpiW + 3);
    doc.setFillColor(...C.cardBg);
    doc.setDrawColor(...C.border);
    doc.roundedRect(x, curY, kpiW, 18, 1.2, 1.2, "FD");
    doc.setFillColor(...C.blue);
    doc.rect(x, curY, kpiW, 1.5, "F");
    doc.setTextColor(...C.blue);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(kpi.value, x + 4, curY + 9);
    doc.setTextColor(...C.textMuted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(kpi.label, x + 4, curY + 14.5);
  });
  curY += 22;

  // Visão Geral por Contrato
  if (chartImages.byObra) {
    sectionHeader("Visão Geral por Contrato");
    addChartImage(chartImages.byObra, "byObra");
  }

  // ═══ PAGE 2 — ESPECIALIDADES ═══
  newPage();
  if (chartImages.bySpecialty) {
    sectionHeader("Produtividade por Especialidade");
    addChartImage(chartImages.bySpecialty, "bySpecialty");
  }

  // ═══ PAGE 3 — DISTRIBUIÇÃO TEMPORAL ═══
  newPage();
  if (chartImages.byHorario) {
    sectionHeader("Produtividade por Horário");
    addChartImage(chartImages.byHorario, "byHorario");
  }
  curY += 2;
  if (chartImages.byDiaSemana) {
    const neededH = estimateChartH(chartDimensions, "byDiaSemana", CONTENT_W) + 14;
    ensureSpace(neededH);
    sectionHeader("Produtividade por Dia da Semana");
    addChartImage(chartImages.byDiaSemana, "byDiaSemana");
  }

  // ═══ PAGE 4 — CONSOLIDAÇÃO FINAL ═══
  newPage();
  if (chartImages.byMes) {
    sectionHeader("Produtividade por Mês");
    addChartImage(chartImages.byMes, "byMes");
  }
  curY += 2;

  if (chartImages.pareto) {
    const neededH = estimateChartH(chartDimensions, "pareto", CONTENT_W) + 14;
    ensureSpace(neededH);
    sectionHeader("Top Causas (Pareto)");
    addChartImage(chartImages.pareto, "pareto");
  }

  if (chartImages.externalCausas) {
    const pieH = estimateChartH(chartDimensions, "externalCausas", CONTENT_W * 0.5);
    const neededH = pieH + 18;
    ensureSpace(neededH);
    sectionHeader("Causas Externas de Parada (NPE)");

    // Layout: pie image on the left, text legend on the right
    const pieW = CONTENT_W * 0.5;
    doc.addImage(chartImages.externalCausas, "PNG", MARGIN, curY, pieW, pieH);

    // Build legend from snapshot data
    const npeColors: Record<string, RGB> = {
      "Aguardando Liberação de PT": [34, 197, 94],
      "Fatores Climáticos e Consequências": [249, 115, 22],
      "Interferências Operacionais": [217, 189, 140],
    };
    const extData: Array<{ name: string; value: number }> = (s.externalCausas || []).map((d: any) => ({
      name: d.name || d.categoria || "",
      value: Number(d.value) || 0,
    }));
    const totalNpe = extData.reduce((acc, d) => acc + d.value, 0);

    const legendX = MARGIN + pieW + 6;
    let legendY = curY + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...C.textDark);
    doc.text("Legenda", legendX, legendY);
    legendY += 6;

    for (const item of extData) {
      if (item.value <= 0) continue;
      const pct = totalNpe > 0 ? ((item.value / totalNpe) * 100).toFixed(1) : "0.0";
      const color = npeColors[item.name] || C.textMuted;
      // Color dot
      doc.setFillColor(...color);
      doc.circle(legendX + 2, legendY - 1.2, 1.8, "F");
      // Text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...C.textDark);
      doc.text(`${item.name} — ${pct}%`, legendX + 6, legendY);
      legendY += 5.5;
    }

    curY += pieH + 4;
  }

  // ═══ PAGE FOOTER ═══
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textMuted);
    doc.text(`ProdControl — Página ${p} de ${totalPages}`, MARGIN, PAGE_H - 8);
    doc.text(dateStr, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  const fileName = `relatorio-${report.obra_nome.replace(/\s+/g, "-")}-${periodLabel.replace(/\s+/g, "-")}.pdf`;
  doc.save(fileName);
}
