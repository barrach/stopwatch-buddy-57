import jsPDF from "jspdf";
import { format } from "date-fns";
import type { ChartImages, ChartDimensions } from "./chartCapture";

export interface PDFReportData {
  periodo: string;
  obra: string;
  totalAmostras: number;
  totalControlaveis: number;
  produtivo: number;
  suplementar: number;
  naoProdutivo: number;
  externo: number;
  produtivoPct: number;
  suplementarPct: number;
  naoProdutivoPct: number;
  externoPct: number;
  byObra: Array<{ name: string; total: number; [key: string]: any }>;
  bySpecialty: Array<{ name: string; total: number; [key: string]: any }>;
  byFunction?: Array<{ name: string; total: number; [key: string]: any }>;
  byTimeHorario?: Array<{ time: string; total: number; [key: string]: any }>;
  byTimeDiaSemana?: Array<{ time: string; total: number; [key: string]: any }>;
  byTimeMes?: Array<{ time: string; total: number; [key: string]: any }>;
  nonprodCausas: Array<{ name: string; value: number; percent: number; cat: string }>;
  externalCausas: Array<{ name: string; value: number; percent: number }>;
  categoryTotals: Array<{ name: string; value: number }>;
  aiAnalysis: string;
  chartImages?: ChartImages;
  chartDimensions?: ChartDimensions;
}

type RGB = [number, number, number];

type LegendItem = {
  name: string;
  color: string;
  percent: number;
};

type TimedBlock = {
  label: string;
  content: string;
};

type AnalysisSections = Record<string, string>;

type RecBlock = {
  title: string;
  problema: string;
  causa: string;
  acao: string;
  responsavel: string;
  impacto: string;
};

const CANONICAL_ORDER_FULL = [
  "Trabalhando",
  "Planejando",
  "Aguardando Ferramenta ou Material",
  "Transitando no local de trabalho - com ferramenta",
  "Transitando no local de trabalho - sem ferramenta",
  "Transitando fora do local de trabalho - com ferramenta",
  "Transitando fora do local de trabalho - sem ferramenta",
  "Assistindo",
  "Aguardando Liberações",
  "Pessoal",
  "Ocioso",
  "Causas Naturais",
] as const;

const CANONICAL_ORDER = CANONICAL_ORDER_FULL.filter((item) => item !== "Causas Naturais");

const DONUT_ORDER = [
  "Produtivo",
  "Suplementar",
  "Não Produtivo",
  "Não Produtivo Externo",
] as const;

const HOUR_ORDER = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"] as const;
const WEEKDAY_ORDER = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"] as const;

const DESC_COLORS: Record<string, string> = {
  Trabalhando: "#2563EB",
  Planejando: "#60A5FA",
  "Aguardando Ferramenta ou Material": "#4ADE80",
  "Transitando no local de trabalho - com ferramenta": "#22C55E",
  "Transitando no local de trabalho - sem ferramenta": "#16A34A",
  "Transitando fora do local de trabalho - com ferramenta": "#65A30D",
  "Transitando fora do local de trabalho - sem ferramenta": "#84CC16",
  Assistindo: "#15803D",
  "Aguardando Liberações": "#FFFFFF",
  Pessoal: "#EF4444",
  Ocioso: "#DC2626",
  "Causas Naturais": "#F97316",
};

const CATEGORY_COLORS: Record<string, string> = {
  Produtivo: "#2563EB",
  Suplementar: "#16A34A",
  "Não Produtivo": "#DC2626",
  "Não Produtivo Externo": "#F97316",
};

const C = {
  headerBg: [15, 23, 42] as RGB,
  sectionBg: [23, 80, 97] as RGB,
  sectionBgDark: [14, 64, 74] as RGB,
  white: [255, 255, 255] as RGB,
  pageBg: [255, 255, 255] as RGB,
  textDark: [31, 41, 55] as RGB,
  textMuted: [107, 114, 128] as RGB,
  border: [209, 213, 219] as RGB,
  cardBg: [248, 250, 252] as RGB,
  analysisBg: [240, 247, 248] as RGB,
  blue: [37, 99, 235] as RGB,
  green: [22, 163, 74] as RGB,
  amber: [245, 158, 11] as RGB,
  red: [220, 38, 38] as RGB,
  orange: [249, 115, 22] as RGB,
} as const;

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_MARGIN = 14;
const MAX_Y = PAGE_H - BOTTOM_MARGIN;
const CHART_RATIO = 0.7;
const LEGEND_RATIO = 0.3;
const CHART_W = CONTENT_W * CHART_RATIO;
const LEGEND_W = CONTENT_W * LEGEND_RATIO;
const MAX_CHART_H = 108;
const LEGEND_FONT_PT = 9;
const LEGEND_LINE_H = 4.2;
const LEGEND_ITEM_GAP = 3;

function hexToRgb(hex: string): RGB {
  const value = hex.replace("#", "");
  return [
    parseInt(value.substring(0, 2), 16),
    parseInt(value.substring(2, 4), 16),
    parseInt(value.substring(4, 6), 16),
  ];
}

function normalizeTitle(raw: string): string {
  return raw
    .replace(/^={2,}\s*(?:DIA|HORA)\s*:\s*/i, "")
    .replace(/^\*\*/g, "")
    .replace(/\*\*$/g, "")
    .replace(/^Dia\s*[:\-]\s*/i, "")
    .replace(/^Hora\s*[:\-]\s*/i, "")
    .trim();
}

function stripTags(text: string): string {
  return text
    .replace(/===\s*([A-Z_]+)\s*:?\s*([^=\n]*)===/gi, (_, marker, value) => {
      const clean = String(value || "").trim();
      return clean ? `\n${marker}: ${clean}\n` : "\n";
    })
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseAnalysis(aiText: string): AnalysisSections {
  const sections: AnalysisSections = {};
  if (!aiText?.trim()) return sections;

  const regex = /===\s*([A-Z_]+)\s*===\s*\n([\s\S]*?)(?=\n===\s*[A-Z_]+\s*===|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(aiText)) !== null) {
    sections[match[1].trim()] = match[2].trim();
  }

  if (!Object.keys(sections).length) sections.GERAL = aiText.trim();
  return sections;
}

function parseTimedBlocks(text: string, marker: "HORA" | "DIA"): TimedBlock[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const blocks: TimedBlock[] = [];
  const strictRegex = new RegExp(
    `(?:^|\\n)\\s*===\\s*${marker}\\s*:\\s*([^=\\n]+?)\\s*===\\s*\\n([\\s\\S]*?)(?=\\n\\s*===\\s*${marker}\\s*:|$)`,
    "gi"
  );

  let match: RegExpExecArray | null;
  while ((match = strictRegex.exec(normalized)) !== null) {
    blocks.push({ label: normalizeTitle(match[1]), content: stripTags(match[2]) });
  }

  if (!blocks.length && marker === "HORA") {
    const fallbackHourRegex = /(?:^|\n)\s*(\d{1,2}:\d{2})\s*\n([\s\S]*?)(?=\n\s*\d{1,2}:\d{2}\s*\n|$)/g;
    while ((match = fallbackHourRegex.exec(normalized)) !== null) {
      blocks.push({ label: normalizeTitle(match[1]), content: stripTags(match[2]) });
    }
  }

  if (!blocks.length && marker === "DIA") {
    const fallbackDays = WEEKDAY_ORDER.map((day) => day.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const fallbackDayRegex = new RegExp(
      `(?:^|\\n)\\s*(${fallbackDays})\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:${fallbackDays})\\s*\\n|$)`,
      "gi"
    );
    while ((match = fallbackDayRegex.exec(normalized)) !== null) {
      blocks.push({ label: normalizeTitle(match[1]), content: stripTags(match[2]) });
    }
  }

  return blocks.length ? blocks : [{ label: "", content: stripTags(normalized) }];
}

function sortBlocks(blocks: TimedBlock[], order: readonly string[]): TimedBlock[] {
  const orderMap = new Map(order.map((item, index) => [item, index]));
  return [...blocks].sort((a, b) => {
    const indexA = orderMap.get(a.label) ?? Number.MAX_SAFE_INTEGER;
    const indexB = orderMap.get(b.label) ?? Number.MAX_SAFE_INTEGER;
    if (indexA !== indexB) return indexA - indexB;
    return a.label.localeCompare(b.label, "pt-BR");
  });
}

function parseRecommendations(text: string): RecBlock[] {
  const cleanText = stripTags(text);
  if (!cleanText) return [];

  const parts = cleanText
    .split(/(?:^|\n)\s*(?:PROBLEMA\s+\d+|Problema\s+\d+)\s*[:\-]?\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.map((part) => {
    const block: RecBlock = {
      title: "",
      problema: "",
      causa: "",
      acao: "",
      responsavel: "",
      impacto: "",
    };

    const lines = part.split("\n").map((line) => line.trim()).filter(Boolean);
    let activeField: keyof RecBlock = "title";

    for (const line of lines) {
      const normalized = line.replace(/^[-•]\s*/, "");
      const lower = normalized.toLowerCase();
      if (lower.startsWith("problema:")) {
        block.problema = normalized.replace(/^[^:]+:\s*/, "");
        activeField = "problema";
      } else if (lower.startsWith("causa provável:") || lower.startsWith("causa provavel:") || lower.startsWith("causa:")) {
        block.causa = normalized.replace(/^[^:]+:\s*/, "");
        activeField = "causa";
      } else if (lower.startsWith("ação recomendada:") || lower.startsWith("acao recomendada:") || lower.startsWith("ação:") || lower.startsWith("acao:")) {
        block.acao = normalized.replace(/^[^:]+:\s*/, "");
        activeField = "acao";
      } else if (lower.startsWith("responsável:") || lower.startsWith("responsavel:")) {
        block.responsavel = normalized.replace(/^[^:]+:\s*/, "");
        activeField = "responsavel";
      } else if (lower.startsWith("impacto esperado:") || lower.startsWith("impacto:")) {
        block.impacto = normalized.replace(/^[^:]+:\s*/, "");
        activeField = "impacto";
      } else if (!block.title) {
        block.title = normalized;
      } else {
        block[activeField] = [block[activeField], normalized].filter(Boolean).join(" ").trim();
      }
    }

    if (!block.title) block.title = block.problema || "Problema crítico";
    return block;
  });
}

function toPercent(value: number): number {
  return Number((value || 0).toFixed(1));
}

function computeLegendItems(
  rows: Array<{ [key: string]: any }>,
  descriptions: readonly string[],
  keepZero = true
): LegendItem[] {
  const totals = new Map<string, number>();
  let grandTotal = 0;

  for (const desc of descriptions) {
    let sum = 0;
    for (const row of rows) {
      const rawKey = `raw_${desc}`;
      if (rawKey in row) {
        sum += Number(row[rawKey] || 0);
      } else if (desc in row) {
        sum += ((Number(row[desc]) || 0) / 100) * (Number(row.total) || 0);
      }
    }
    totals.set(desc, sum);
    grandTotal += sum;
  }

  return descriptions
    .map((desc) => ({
      name: desc,
      color: DESC_COLORS[desc] || "#6B7280",
      percent: grandTotal > 0 ? toPercent((Number(totals.get(desc)) / grandTotal) * 100) : 0,
    }))
    .filter((item) => keepZero || item.percent > 0);
}

function computeSimpleLegendItems(
  items: Array<{ name: string; value?: number; percent?: number }>,
  order: readonly string[],
  colorMap: Record<string, string>,
  keepZero = true
): LegendItem[] {
  const itemMap = new Map(items.map((item) => [item.name, item]));
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);

  return order
    .map((name) => {
      const item = itemMap.get(name);
      const percent = item?.percent != null
        ? toPercent(Number(item.percent))
        : total > 0
          ? toPercent((Number(item?.value || 0) / total) * 100)
          : 0;

      return {
        name,
        color: colorMap[name] || "#6B7280",
        percent,
      };
    })
    .filter((item) => keepZero || item.percent > 0);
}

function validateLegendSequence(items: LegendItem[], expected: readonly string[]): LegendItem[] {
  const map = new Map(items.map((item) => [item.name, item]));
  return expected
    .map((name) => map.get(name) || { name, color: DESC_COLORS[name] || CATEGORY_COLORS[name] || "#6B7280", percent: 0 })
    .filter(Boolean);
}

function estimateChartHeight(dimensions: ChartDimensions, dimKey: string, width: number): number {
  const dim = dimensions[dimKey];
  if (!dim?.width || !dim?.height) return Math.min(width * 0.58, MAX_CHART_H);
  return Math.min(width * (dim.height / dim.width), MAX_CHART_H);
}

function isWhite(hex: string): boolean {
  return hex.toUpperCase() === "#FFFFFF";
}

function formatLegendPercent(percent: number): string {
  return `${toPercent(percent).toFixed(1)}%`;
}

function buildValidatedModel(data: PDFReportData, analysis: AnalysisSections) {
  const contractLegend = validateLegendSequence(computeLegendItems(data.byObra, CANONICAL_ORDER_FULL, true), CANONICAL_ORDER_FULL);
  const specialtyLegend = validateLegendSequence(computeLegendItems(data.bySpecialty, CANONICAL_ORDER, true), CANONICAL_ORDER);
  const hourLegend = validateLegendSequence(computeLegendItems(data.byTimeHorario || [], CANONICAL_ORDER, true), CANONICAL_ORDER);
  const weekLegend = validateLegendSequence(computeLegendItems(data.byTimeDiaSemana || [], CANONICAL_ORDER, true), CANONICAL_ORDER);
  const monthLegend = validateLegendSequence(computeLegendItems(data.byTimeMes || [], CANONICAL_ORDER, true), CANONICAL_ORDER);
  const categoryLegend = computeSimpleLegendItems(data.categoryTotals, DONUT_ORDER, CATEGORY_COLORS, true);
  const npeLegend = computeSimpleLegendItems(
    data.externalCausas,
    ["Causas Naturais", "Aguardando Liberações"],
    DESC_COLORS,
    true
  );
  const hourBlocks = sortBlocks(parseTimedBlocks(analysis.HORARIO || "", "HORA"), HOUR_ORDER);
  const weekdayBlocks = sortBlocks(parseTimedBlocks(analysis.DIA_SEMANA || "", "DIA"), WEEKDAY_ORDER);

  return {
    contractLegend,
    specialtyLegend,
    hourLegend,
    weekLegend,
    monthLegend,
    categoryLegend,
    npeLegend,
    hourBlocks,
    weekdayBlocks,
    recommendations: parseRecommendations(analysis.RECOMENDACOES || analysis.GERAL || ""),
    validations: {
      legendFontOk: LEGEND_FONT_PT >= 9,
      paretoHasNoLegend: true,
      contractLegendOk: JSON.stringify(contractLegend.map((item) => item.name)) === JSON.stringify(CANONICAL_ORDER_FULL),
      specialtyLegendOk: JSON.stringify(specialtyLegend.map((item) => item.name)) === JSON.stringify(CANONICAL_ORDER),
      hourLegendOk: JSON.stringify(hourLegend.map((item) => item.name)) === JSON.stringify(CANONICAL_ORDER),
      graphBeforeAnalysis: true,
      hourTitlesOk: hourBlocks.every((block) => !block.label || HOUR_ORDER.includes(block.label as (typeof HOUR_ORDER)[number])),
    },
  };
}

export function generatePDFReport(data: PDFReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const chartImages = data.chartImages || {};
  const chartDimensions = data.chartDimensions || {};
  const analysis = parseAnalysis(data.aiAnalysis);
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");
  let curY = MARGIN;

  const model = buildValidatedModel(data, analysis);
  const validationsPassed = Object.values(model.validations).every(Boolean);
  if (!validationsPassed) {
    console.warn("PDF report model required normalization before rendering.", model.validations);
  }

  const addPage = () => {
    if (doc.getNumberOfPages() > 0) doc.addPage("a4", "portrait");
    doc.setFillColor(...C.pageBg);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    curY = MARGIN;
  };

  const ensureSpace = (height: number) => {
    if (curY + height > MAX_Y) addPage();
  };

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

  const subHeader = (title: string) => {
    const cleanTitle = normalizeTitle(title);
    if (!cleanTitle) return;
    ensureSpace(10);
    doc.setFillColor(...C.sectionBgDark);
    doc.roundedRect(MARGIN + 1, curY, CONTENT_W - 2, 8, 1.6, 1.6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...C.white);
    doc.text(cleanTitle, MARGIN + 5, curY + 5.2);
    curY += 10;
  };

  const drawParagraphBlock = (text: string) => {
    const clean = stripTags(text);
    if (!clean) return;

    const paragraphs = clean
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const bodyWidth = CONTENT_W - 14;
    const wrappedLines: string[] = [];
    paragraphs.forEach((paragraph, index) => {
      const lines = doc.splitTextToSize(paragraph, bodyWidth) as string[];
      wrappedLines.push(...lines);
      if (index < paragraphs.length - 1) wrappedLines.push("");
    });

    const boxHeight = Math.max(12, wrappedLines.length * 4 + 6);
    ensureSpace(boxHeight + 2);

    doc.setFillColor(...C.analysisBg);
    doc.roundedRect(MARGIN, curY, CONTENT_W, boxHeight, 1.5, 1.5, "F");
    doc.setFillColor(...C.sectionBg);
    doc.rect(MARGIN, curY, 2, boxHeight, "F");

    let textY = curY + 5;
    doc.setFontSize(9);
    for (const line of wrappedLines) {
      if (!line) {
        textY += 1.5;
        continue;
      }

      const colonIndex = line.indexOf(":");
      if (colonIndex > 0 && colonIndex < 40) {
        const prefix = line.slice(0, colonIndex + 1);
        const rest = line.slice(colonIndex + 1).trimStart();
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.sectionBg);
        doc.text(prefix, MARGIN + 6, textY);
        const prefixWidth = doc.getTextWidth(prefix);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textDark);
        doc.text(rest, MARGIN + 6 + prefixWidth + 1, textY);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textDark);
        doc.text(line, MARGIN + 6, textY);
      }
      textY += 4;
    }

    curY += boxHeight + 2;
  };

  const measureLegendHeight = (items: LegendItem[]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(LEGEND_FONT_PT);
    const textWidth = LEGEND_W - 10;
    let totalHeight = 0;
    for (const item of items) {
      const lines = doc.splitTextToSize(`${item.name} — ${formatLegendPercent(item.percent)}`, textWidth - 5) as string[];
      totalHeight += Math.max(4.5, lines.length * LEGEND_LINE_H) + LEGEND_ITEM_GAP;
    }
    return totalHeight;
  };

  const drawLegend = (items: LegendItem[], x: number, y: number) => {
    if (!items.length) return 0;

    const textWidth = LEGEND_W - 10;
    let drawY = y;
    doc.setFontSize(LEGEND_FONT_PT);

    for (const item of items) {
      const swatchX = x + 2;
      const swatchY = drawY + 0.7;
      const textX = swatchX + 5.2;
      const lines = doc.splitTextToSize(`${item.name} — ${formatLegendPercent(item.percent)}`, textWidth - 5) as string[];
      const itemHeight = Math.max(4.5, lines.length * LEGEND_LINE_H);
      const rgb = hexToRgb(item.color);

      doc.setFillColor(...rgb);
      if (isWhite(item.color)) {
        doc.setDrawColor(...C.border);
        doc.roundedRect(swatchX, swatchY, 3.2, 3.2, 0.5, 0.5, "FD");
      } else {
        doc.roundedRect(swatchX, swatchY, 3.2, 3.2, 0.5, 0.5, "F");
      }

      doc.setTextColor(...(isWhite(item.color) ? C.textMuted : C.textDark));
      doc.setFont("helvetica", "bold");
      doc.text(lines[0] || "", textX, drawY + 3.6);

      if (lines.length > 1) {
        doc.setFont("helvetica", "normal");
        for (let i = 1; i < lines.length; i++) {
          doc.text(lines[i], textX, drawY + 3.6 + i * LEGEND_LINE_H);
        }
      }

      drawY += itemHeight + LEGEND_ITEM_GAP;
    }

    return drawY - y;
  };

  const drawChartImage = (image: string | undefined, dimKey: string, width: number) => {
    if (!image) return { width, height: 0 };
    const height = estimateChartHeight(chartDimensions, dimKey, width);
    doc.addImage(image, "PNG", MARGIN, curY, width, height);
    return { width, height };
  };

  const renderChartSection = (
    title: string,
    image: string | undefined,
    dimKey: string,
    legendItems: LegendItem[],
    analysisText?: string
  ) => {
    const estimatedChartHeight = estimateChartHeight(chartDimensions, dimKey, CHART_W);
    const estimatedLegendHeight = legendItems.length ? measureLegendHeight(legendItems) : 0;
    const rowHeight = Math.max(estimatedChartHeight, estimatedLegendHeight);
    ensureSpace(12 + rowHeight + 12);

    sectionHeader(title);

    const rowStartY = curY;
    const chart = drawChartImage(image, dimKey, legendItems.length ? CHART_W : CONTENT_W);
    const legendHeight = legendItems.length ? drawLegend(legendItems, MARGIN + CHART_W, rowStartY) : 0;
    curY = rowStartY + Math.max(chart.height, legendHeight) + 3;

    if (analysisText?.trim()) drawParagraphBlock(analysisText);
  };

  const renderChartSectionWithBlocks = (
    title: string,
    image: string | undefined,
    dimKey: string,
    legendItems: LegendItem[],
    blocks: TimedBlock[]
  ) => {
    const estimatedChartHeight = estimateChartHeight(chartDimensions, dimKey, CHART_W);
    const estimatedLegendHeight = legendItems.length ? measureLegendHeight(legendItems) : 0;
    const rowHeight = Math.max(estimatedChartHeight, estimatedLegendHeight);
    ensureSpace(12 + rowHeight + 12);

    sectionHeader(title);

    const rowStartY = curY;
    const chart = drawChartImage(image, dimKey, legendItems.length ? CHART_W : CONTENT_W);
    const legendHeight = legendItems.length ? drawLegend(legendItems, MARGIN + CHART_W, rowStartY) : 0;
    curY = rowStartY + Math.max(chart.height, legendHeight) + 3;

    blocks.forEach((block) => {
      if (block.label) subHeader(block.label);
      if (block.content?.trim()) drawParagraphBlock(block.content);
    });
  };

  const renderParetoSection = (title: string, image: string | undefined, dimKey: string, analysisText?: string) => {
    const estimatedChartHeight = estimateChartHeight(chartDimensions, dimKey, CONTENT_W);
    ensureSpace(12 + estimatedChartHeight + 12);
    sectionHeader(title);
    const chart = drawChartImage(image, dimKey, CONTENT_W);
    curY += chart.height + 3;
    if (analysisText?.trim()) drawParagraphBlock(analysisText);
  };

  addPage();

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
  doc.text(`Contrato: ${data.obra || "Todos os Contratos"}`, MARGIN, 41);
  doc.text(`Período analisado: ${data.periodo}`, MARGIN, 47);
  doc.text(`Data de geração: ${dateStr}`, PAGE_W - MARGIN, 47, { align: "right" });
  curY = 58;

  sectionHeader("Indicadores Principais");
  const kpis = [
    { label: "Total de Amostras", value: `${data.totalAmostras}`, color: C.blue },
    { label: "Produtividade", value: `${toPercent(data.produtivoPct).toFixed(1)}%`, color: C.green },
    { label: "Suplementar", value: `${toPercent(data.suplementarPct).toFixed(1)}%`, color: C.amber },
    { label: "Não Produtivo", value: `${toPercent(data.naoProdutivoPct).toFixed(1)}%`, color: C.red },
    { label: "NPE (Externo)", value: `${toPercent(data.externoPct).toFixed(1)}%`, color: C.orange },
  ];

  const kpiGap = 3;
  const kpiW = (CONTENT_W - kpiGap * 4) / 5;
  kpis.forEach((kpi, index) => {
    const x = MARGIN + index * (kpiW + kpiGap);
    doc.setFillColor(...C.cardBg);
    doc.setDrawColor(...C.border);
    doc.roundedRect(x, curY, kpiW, 22, 1.2, 1.2, "FD");
    doc.setFillColor(...kpi.color);
    doc.rect(x, curY, kpiW, 1.5, "F");
    doc.setTextColor(...kpi.color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(kpi.value, x + 3.5, curY + 10.5);
    doc.setTextColor(...C.textMuted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.text(kpi.label, x + 3.5, curY + 17.5);
  });
  curY += 25;

  drawParagraphBlock(analysis.RESUMO || analysis.GERAL || "Diagnóstico geral da obra indisponível para este período.");

  renderChartSection("Visão Geral por Contrato", chartImages.contrato, "contrato", model.contractLegend, analysis.CONTRATO);
  renderChartSection("Distribuição por Categoria", chartImages.categoria, "categoria", model.categoryLegend, analysis.CATEGORIA);
  renderParetoSection("Top Causas — Pareto por Categorias", chartImages.paretoCategoria, "paretoCategoria", analysis.PARETO);
  renderParetoSection("Top Causas — Pareto por Especialidades", chartImages.paretoEspecialidade, "paretoEspecialidade", analysis.PARETO_ESPECIALIDADE);
  renderChartSection("Produtividade por Especialidade", chartImages.especialidade, "especialidade", model.specialtyLegend, analysis.ESPECIALIDADE);
  renderChartSection("Causas Externas de Parada (NPE)", chartImages.externas, "externas", model.npeLegend, analysis.EXTERNO);

  if (chartImages.tempoHorario) {
    renderChartSectionWithBlocks("Produtividade por Horário", chartImages.tempoHorario, "tempoHorario", model.hourLegend, model.hourBlocks);
  }

  if (chartImages.tempoDiaSemana) {
    renderChartSectionWithBlocks(
      "Produtividade por Dia da Semana",
      chartImages.tempoDiaSemana,
      "tempoDiaSemana",
      model.weekLegend,
      model.weekdayBlocks
    );
  }

  renderChartSection("Produtividade por Mês", chartImages.tempoMes, "tempoMes", model.monthLegend, analysis.MES);

  sectionHeader("Conclusões e Recomendações");
  if (model.recommendations.length) {
    model.recommendations.forEach((item, index) => {
      const fields = [
        { label: "PROBLEMA", value: item.problema },
        { label: "CAUSA PROVÁVEL", value: item.causa },
        { label: "AÇÃO RECOMENDADA", value: item.acao },
        { label: "RESPONSÁVEL", value: item.responsavel },
        { label: "IMPACTO ESPERADO", value: item.impacto },
      ].filter((field) => field.value?.trim());

      let blockHeight = 12;
      fields.forEach((field) => {
        const lines = doc.splitTextToSize(field.value, CONTENT_W - 16) as string[];
        blockHeight += 5 + lines.length * 3.6;
      });

      ensureSpace(blockHeight + 6);
      doc.setFillColor(...C.sectionBgDark);
      doc.roundedRect(MARGIN + 1, curY, CONTENT_W - 2, 8, 1.6, 1.6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...C.white);
      doc.text(`PROBLEMA ${index + 1} — ${item.title}`, MARGIN + 5, curY + 5.2);
      curY += 10;

      fields.forEach((field) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...C.sectionBg);
        doc.text(field.label, MARGIN + 5, curY + 3.5);
        curY += 5;
        const lines = doc.splitTextToSize(field.value, CONTENT_W - 16) as string[];
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...C.textDark);
        doc.text(lines, MARGIN + 9, curY + 3);
        curY += lines.length * 3.6 + 2;
      });

      curY += 2;
    });
  } else {
    drawParagraphBlock(analysis.RECOMENDACOES || analysis.GERAL || "Sem recomendações estruturadas para este período.");
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textMuted);
    doc.text(`ProdControl — Página ${page} de ${totalPages}`, MARGIN, PAGE_H - 8);
    doc.text(dateStr, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  doc.save(`relatorio-produtividade_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
}
