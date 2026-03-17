import jsPDF from "jspdf";
import { format } from "date-fns";
import type { ChartImages, ChartDimensions } from "./chartCapture";
import { PDF_OCEAN_RGB, buildStyledPdfLines, countStyledPdfLines, wrapTextByWords } from "./pdfTextFormatting";

type RGB = [number, number, number];

const STACK_ORDER_FULL = [
  "Trabalhando",
  "Planejando",
  "Aguardando Ferramenta ou Material",
  "Transitando no local de trabalho - com ferramenta",
  "Transitando no local de trabalho - sem ferramenta",
  "Transitando fora do local de trabalho - com ferramenta",
  "Transitando fora do local de trabalho - sem ferramenta",
  "Assistindo",
  "Pessoal",
  "Ocioso",
  "Aguardando Liberação de PT",
  "Vazamento / Interferência da Planta",
  "Causas Naturais",
  "Não Produtivo Externo",
];

const STACK_ORDER = [
  "Trabalhando",
  "Planejando",
  "Aguardando Ferramenta ou Material",
  "Transitando no local de trabalho - com ferramenta",
  "Transitando no local de trabalho - sem ferramenta",
  "Assistindo",
  "Pessoal",
  "Ocioso",
  "Aguardando Liberação de PT",
  "Vazamento / Interferência da Planta",
  "Causas Naturais",
];

const LEGEND_ORDER_FULL = [...STACK_ORDER_FULL];
const LEGEND_ORDER = [...STACK_ORDER];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MAX_Y = PAGE_H - 14;
const CHART_W = CONTENT_W;
const CHART_H = 60;
const LEGEND_W = CONTENT_W * 0.32;
const LEGEND_ITEM_GAP = 3;
const LEGEND_LINE_H = 4.2;
const LEGEND_FONT_PT = 9;

const C = {
  headerBg: [15, 23, 42] as RGB,
  sectionBg: [...PDF_OCEAN_RGB] as RGB,
  sectionBgDark: [22, 59, 92] as RGB,
  white: [255, 255, 255] as RGB,
  pageBg: [255, 255, 255] as RGB,
  textDark: [31, 41, 55] as RGB,
  textMuted: [107, 114, 128] as RGB,
  border: [209, 213, 219] as RGB,
  cardBg: [248, 250, 252] as RGB,
  analysisBg: [248, 250, 252] as RGB,
  blue: [...PDF_OCEAN_RGB] as RGB,
  green: [22, 163, 74] as RGB,
  amber: [245, 158, 11] as RGB,
  red: [220, 38, 38] as RGB,
  orange: [249, 115, 22] as RGB,
} as const;

const DESC_COLORS: Record<string, string> = {
  Trabalhando: "#2563EB",
  Planejando: "#60A5FA",
  "Aguardando Ferramenta ou Material": "#4ADE80",
  "Transitando no local de trabalho - com ferramenta": "#22C55E",
  "Transitando no local de trabalho - sem ferramenta": "#16A34A",
  "Transitando fora do local de trabalho - com ferramenta": "#65A30D",
  "Transitando fora do local de trabalho - sem ferramenta": "#84CC16",
  Assistindo: "#15803D",
  Pessoal: "#EF4444",
  Ocioso: "#DC2626",
  "Aguardando Liberação de PT": "#D4B896",
  "Vazamento / Interferência da Planta": "#C8A882",
  "Causas Naturais": "#F97316",
  "Não Produtivo Externo": "#9CA3AF",
};

const isWhiteColor = (hex: string): boolean => hex.toUpperCase() === "#FFFFFF";

const dims: ChartDimensions = {
  small: { w: 140, h: 80 },
  medium: { w: CHART_W, h: CHART_H },
  large: { w: 560, h: 320 },
};

type LegendItem = { name: string; percent: number; color: string };
type RecBlock = { title: string; problema: string; causa: string; acao: string; responsavel: string; impacto: string };

function hexToRgb(hex: string): RGB {
  const v = hex.replace("#", "");
  return [parseInt(v.substring(0, 2), 16), parseInt(v.substring(2, 4), 16), parseInt(v.substring(4, 6), 16)];
}

function fmtPct(p: number): string {
  return `${Number(p || 0).toFixed(1)}%`;
}

function estimateChartHeight(d: ChartDimensions, key: string, w: number): number {
  const dim = d[key as keyof ChartDimensions] || d.medium;
  return (dim.h / dim.w) * w;
}

const stripTags = (html: string): string => html.replace(/(<([^>]+)>)/gi, "");
const normalizeTitle = (title: string): string => title.replace(/[:\n\r]/g, "").trim();

export async function generateReportPDF(
  analysis: any,
  images: ChartImages,
  model: any,
  obraNome: string,
  dateStart: string,
  dateEnd: string,
  times: string[]
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");
  const periodLabel = `${dateStart} até ${dateEnd}`;

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

  const measureAnalysisBox = (text: string): number => {
    const blocks = buildStyledPdfLines(doc, stripTags(text), CONTENT_W - 12);
    const lineCount = countStyledPdfLines(blocks);
    return lineCount > 0 ? Math.max(16, lineCount * 4.5 + 8) + 2 : 0;
  };

  /** Measure a sub-header height */
  const measureSubHeader = (title: string): number => {
    const clean = normalizeTitle(title);
    return clean ? 10 : 0;
  };

  const drawAnalysisBox = (text: string) => {
    const blocks = buildStyledPdfLines(doc, stripTags(text), CONTENT_W - 12);
    if (!blocks.length) return;

    const lineCount = countStyledPdfLines(blocks);
    const boxH = Math.max(16, lineCount * 4.5 + 8);
    ensureSpace(boxH + 2);

    doc.setFillColor(...C.analysisBg);
    doc.roundedRect(MARGIN, curY, CONTENT_W, boxH, 1.5, 1.5, "F");
    doc.setFillColor(...C.sectionBg);
    doc.rect(MARGIN, curY, 2, boxH, "F");

    let ty = curY + 5;
    doc.setFontSize(9);

    for (const block of blocks) {
      if (block.prefix) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.blue);
        doc.text(block.prefix, MARGIN + 6, ty);

        const firstLine = block.lines[0] || "";
        if (firstLine) {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textDark);
          doc.text(firstLine, MARGIN + 6 + doc.getTextWidth(block.prefix) + 1.5, ty);
        }

        ty += 4.5;

        for (const continuation of block.lines.slice(1)) {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textDark);
          doc.text(continuation, MARGIN + 6, ty);
          ty += 4.5;
        }

        ty += 0.8;
        continue;
      }

      for (const line of block.lines) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textDark);
        doc.text(line, MARGIN + 6, ty);
        ty += 4.5;
      }

      ty += 0.8;
    }

    curY += boxH + 2;
  };

  const drawLegend = (items: LegendItem[], x: number, y: number): number => {
    if (!items.length) return 0;
    const textW = LEGEND_W - 10;
    let drawY = y;
    doc.setFontSize(LEGEND_FONT_PT);

    for (const item of items) {
      const swX = x + 2;
      const swY = drawY + 0.7;
      const tX = swX + 5.2;
      const label = `${item.name} — ${fmtPct(item.percent)}`;
      const lines = wrapTextByWords(doc, label, textW - 5);
      const itemH = Math.max(4.5, lines.length * LEGEND_LINE_H);
      const rgb = hexToRgb(item.color);

      doc.setFillColor(...rgb);
      if (isWhiteColor(item.color)) {
        doc.setDrawColor(...C.border);
        doc.roundedRect(swX, swY, 3.2, 3.2, 0.5, 0.5, "FD");
      } else {
        doc.roundedRect(swX, swY, 3.2, 3.2, 0.5, 0.5, "F");
      }

      doc.setTextColor(...(isWhiteColor(item.color) ? C.textMuted : C.textDark));
      doc.setFont("helvetica", "bold");
      doc.text(lines[0] || "", tX, drawY + 3.6);
      if (lines.length > 1) {
        doc.setFont("helvetica", "normal");
        for (let i = 1; i < lines.length; i++) doc.text(lines[i], tX, drawY + 3.6 + i * LEGEND_LINE_H);
      }
      drawY += itemH + LEGEND_ITEM_GAP;
    }
    return drawY - y;
  };

  const measureLegendH = (items: LegendItem[]): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(LEGEND_FONT_PT);
    const tW = LEGEND_W - 10;
    let h = 0;
    for (const item of items) {
      const lines = wrapTextByWords(doc, `${item.name} — ${fmtPct(item.percent)}`, tW - 5);
      h += Math.max(4.5, lines.length * LEGEND_LINE_H) + LEGEND_ITEM_GAP;
    }
    return h;
  };

  const drawChart = (image: string | undefined, dimKey: string, w: number): number => {
    if (!image) return 0;
    const h = estimateChartHeight(dims, dimKey, w);
    doc.addImage(image, "PNG", MARGIN, curY, w, h);
    return h;
  };

  const computeLegend = (data: any, stackOrder: string[]): LegendItem[] => {
    if (!data) return [];
    const total = data.reduce((sum: number, item: any) => sum + (Number(item.value) || 0), 0);
    return stackOrder.map((key) => ({
      name: key,
      percent: total > 0 ? (Number(data.find((item: any) => item.id === key)?.value) || 0) / total * 100 : 0,
      color: DESC_COLORS[key] || "#6B7280",
    }));
  };

  const renderPareto = (title: string, data: any[]) => {
    if (!data || data.length === 0) return;
    const blockH = 12 + data.length * 5.5 + 8;
    ensureSpace(blockH);

    sectionHeader(title);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.textDark);
    doc.text("Causa", MARGIN + 2, curY + 3);
    doc.text("%", MARGIN + CONTENT_W - 15, curY + 3);
    curY += 5;
    doc.setDrawColor(...C.border);
    doc.line(MARGIN, curY, MARGIN + CONTENT_W, curY);
    curY += 1;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    for (const item of data) {
      const name = String(item.name || "").length > 45 ? item.name.substring(0, 45) + "…" : item.name;
      doc.setTextColor(...C.textDark);
      doc.text(name, MARGIN + 2, curY + 3);
      doc.text(`${item.percent}%`, MARGIN + CONTENT_W - 15, curY + 3);
      curY += 5;
    }
    curY += 3;
  };

  const renderExternalCauses = (title: string, data: any[]) => {
    if (!data || data.length === 0) return;
    const blockH = 12 + data.length * 5.5 + 8;
    ensureSpace(blockH);

    sectionHeader(title);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.textDark);
    doc.text("Causa", MARGIN + 2, curY + 3);
    doc.text("%", MARGIN + CONTENT_W - 15, curY + 3);
    curY += 5;
    doc.setDrawColor(...C.border);
    doc.line(MARGIN, curY, MARGIN + CONTENT_W, curY);
    curY += 1;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    for (const item of data) {
      const color = hexToRgb(DESC_COLORS[item.id] || "#6B7280");
      doc.setFillColor(...color);
      doc.circle(MARGIN + 3, curY + 2, 1.5, "F");
      doc.setTextColor(...C.textDark);
      doc.text(item.name, MARGIN + 7, curY + 3);
      doc.text(`${item.percent}%`, MARGIN + CONTENT_W - 15, curY + 3);
      curY += 5;
    }
    curY += 3;
  };

  // ═══ COVER ═══
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, PAGE_W, 50, "F");
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("ProdControl", MARGIN, 21);
  doc.setFontSize(14);
  doc.text("Relatório de Produtividade", MARGIN, 31);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Contrato: ${obraNome}`, MARGIN, 41);
  doc.text(`Período: ${periodLabel}`, MARGIN, 47);
  doc.text(`Gerado em: ${dateStr}`, PAGE_W - MARGIN, 47, { align: "right" });
  curY = 58;

  // ═══ CHARTS ═══
  sectionHeader("Visão Geral da Produtividade");
  const chartH = drawChart(images.main, "medium", CHART_W);
  if (chartH) curY += chartH + 6;

  const legendItems = computeLegend(analysis.stack, LEGEND_ORDER);
  const legendH = measureLegendH(legendItems);
  ensureSpace(legendH + 8);
  drawLegend(legendItems.reverse(), MARGIN, curY);
  curY += legendH + 8;

  if (images.trend) {
    sectionHeader("Tendência da Produtividade");
    const trendH = drawChart(images.trend, "medium", CHART_W);
    if (trendH) curY += trendH + 6;
  }

  if (images.specialty) {
    sectionHeader("Produtividade por Especialidade");
    const specialtyH = drawChart(images.specialty, "medium", CHART_W);
    if (specialtyH) curY += specialtyH + 6;
  }

  if (images.times) {
    sectionHeader("Produtividade por Horário");
    const timesH = drawChart(images.times, "medium", CHART_W);
    if (timesH) curY += timesH + 6;
  }

  if (images.weekdays) {
    sectionHeader("Produtividade por Dia da Semana");
    const weekdaysH = drawChart(images.weekdays, "medium", CHART_W);
    if (weekdaysH) curY += weekdaysH + 6;
  }

  if (images.monthly) {
    sectionHeader("Produtividade por Mês");
    const monthlyH = drawChart(images.monthly, "medium", CHART_W);
    if (monthlyH) curY += monthlyH + 6;
  }

  renderPareto("Top Causas (Pareto)", analysis.pareto);
  renderExternalCauses("Causas Externas de Parada (NPE)", analysis.external);

  if (model.recommendations.length) {
    const buildRecommendationText = (item: RecBlock, index: number) => {
      const lines = [
        item.title ? `Problema crítico ${index + 1}: ${item.title}` : "",
        item.problema ? `1. Problema: ${item.problema}` : "",
        item.causa ? `2. Causa provável: ${item.causa}` : "",
        item.acao ? `3. Ação recomendada: ${item.acao}` : "",
        item.responsavel ? `4. Responsável: ${item.responsavel}` : "",
        item.impacto ? `5. Impacto esperado: ${item.impacto}` : "",
      ].filter(Boolean);
      return lines.join("\n");
    };

    const firstBlockH = measureAnalysisBox(buildRecommendationText(model.recommendations[0], 0));
    ensureSpace(12 + firstBlockH);
    sectionHeader("Conclusões e Recomendações");

    model.recommendations.forEach((item, index) => {
      drawAnalysisBox(buildRecommendationText(item, index));
    });
  } else {
    ensureSpace(12 + measureAnalysisBox(analysis.RECOMENDACOES || analysis.GERAL || "Sem recomendações estruturadas para este período."));
    sectionHeader("Conclusões e Recomendações");
    drawAnalysisBox(analysis.RECOMENDACOES || analysis.GERAL || "Sem recomendações estruturadas para este período.");
  }

  // Save
  const fileName = `relatorio-${obraNome.replace(/\s+/g, "-")}-${periodLabel.replace(/\s+/g, "-")}.pdf`;
  doc.save(fileName);
}
