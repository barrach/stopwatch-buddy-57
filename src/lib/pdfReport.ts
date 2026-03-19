import jsPDF from "jspdf";
import { format } from "date-fns";
import type { ChartImages, ChartDimensions } from "./chartCapture";
import { PDF_OCEAN_RGB, buildStyledPdfLines, countStyledPdfLines, wrapTextByWords } from "./pdfTextFormatting";

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
type LegendItem = { name: string; color: string; percent: number };
type TimedBlock = { label: string; content: string };
type AnalysisSections = Record<string, string>;
type RecommendationBlock = { title: string; problema: string; causa: string; acao: string; responsavel: string; impacto: string };

const STACK_ORDER_FULL = [
  "Trabalhando",
  "Planejando",
  "Aguardando Ferramenta ou Material",
  "Transitando no local de trabalho - com ferramenta",
  "Transitando no local de trabalho - sem ferramenta",
  "Transitando fora do local de trabalho - com ferramenta",
  "Transitando fora do local de trabalho - sem ferramenta",
  "Assistindo / Stand By",
  "Aguardando Liberação de PT",
  "Pessoal",
  "Ocioso",
  "Interferências Operacionais",
  "Fatores Climáticos e Consequências",
] as const;

const STACK_ORDER = [...STACK_ORDER_FULL];
const LEGEND_ORDER_FULL = [...STACK_ORDER_FULL].reverse();
const LEGEND_ORDER = [...STACK_ORDER].reverse();
const DONUT_ORDER = ["Produtivo", "Suplementar", "Não Produtivo", "Não Produtivo Externo"] as const;
const HOUR_ORDER = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"] as const;
const WEEKDAY_ORDER = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"] as const;
const MONTH_ORDER = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;

const DESC_COLORS: Record<string, string> = {
  Trabalhando: "#2563EB",
  Planejando: "#60A5FA",
  "Aguardando Ferramenta ou Material": "#4ADE80",
  "Transitando no local de trabalho - com ferramenta": "#22C55E",
  "Transitando no local de trabalho - sem ferramenta": "#16A34A",
  "Transitando fora do local de trabalho - com ferramenta": "#65A30D",
  "Transitando fora do local de trabalho - sem ferramenta": "#84CC16",
  "Assistindo / Stand By": "#15803D",
  Assistindo: "#15803D",
  Pessoal: "#EF4444",
  Ocioso: "#DC2626",
  "Aguardando Liberação de PT": "#34D399",
  "Interferências Operacionais": "#C8A882",
  "Vazamento / Interferência da Planta": "#C8A882",
  "Fatores Climáticos e Consequências": "#F97316",
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

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_MARGIN = 14;
const MAX_Y = PAGE_H - BOTTOM_MARGIN;
const CHART_RATIO = 0.7;
const CHART_W = CONTENT_W * CHART_RATIO;
const LEGEND_W = CONTENT_W - CHART_W;
const MAX_CHART_H = 108;
const LEGEND_FONT_PT = 9;
const LEGEND_LINE_H = 4.2;
const LEGEND_ITEM_GAP = 3;
const ANALYSIS_LINE_H = 4.5;

function hexToRgb(hex: string): RGB {
  const value = hex.replace("#", "");
  return [parseInt(value.substring(0, 2), 16), parseInt(value.substring(2, 4), 16), parseInt(value.substring(4, 6), 16)];
}

function isWhiteColor(hex: string): boolean {
  const normalized = hex.toUpperCase();
  return normalized === "#FFFFFF" || normalized === "#C8A882";
}

function toPercent(value: number): number {
  return Number((value || 0).toFixed(1));
}

function fmtPct(value: number): string {
  return `${toPercent(value).toFixed(1)}%`;
}

function normalizeTitle(raw: string): string {
  return raw
    .replace(/^={2,}\s*(?:DIA|HORA|MES)\s*:\s*/i, "")
    .replace(/^\*\*/g, "")
    .replace(/\*\*$/g, "")
    .replace(/^Dia\s*[:\-]\s*/i, "")
    .replace(/^Hora\s*[:\-]\s*/i, "")
    .replace(/^M[eê]s\s*[:\-]\s*/i, "")
    .trim();
}

function stripTags(text: string): string {
  return text
    .replace(/===\s*([A-Z_]+)\s*:?\s*([^=\n]*)===/gi, (_, marker, value) => {
      const clean = String(value || "").trim();
      return clean ? `\n${marker}: ${clean}\n` : "\n";
    })
    .replace(/\*\*/g, "")
    .replace(/<[^>]+>/g, "")
    // Strip emoji/special unicode that jsPDF cannot render
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{200D}]/gu, "")
    // Fix encoding artifacts
    .replace(/Ø=Ý4/g, "Crítico")
    .replace(/[&]\s*þ/g, "Acima do ideal")
    // Ensure space after colons
    .replace(/:([A-ZÀ-Úa-zà-ú])/g, ": $1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeBlockText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function getFirstMatchIndex(text: string, patterns: RegExp[]): number {
  const indexes = patterns.map((pattern) => text.search(pattern)).filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function trimAtNestedMarker(text: string, patterns: RegExp[]): string {
  const index = getFirstMatchIndex(text, patterns);
  return index >= 0 ? text.slice(0, index).trim() : text.trim();
}

function extractInferredSection(text: string, startPattern: RegExp, endPatterns: RegExp[]): string {
  const start = text.search(startPattern);
  if (start < 0) return "";
  const slice = text.slice(start);
  const end = getFirstMatchIndex(slice, endPatterns);
  return (end >= 0 ? slice.slice(0, end) : slice).trim();
}

function parseAnalysis(aiText: string): AnalysisSections {
  const normalized = normalizeBlockText(aiText);
  const sections: AnalysisSections = {};
  if (!normalized) return sections;

  const topLevelRegex = /(?:^|\n)\s*===\s*(RESUMO|CONTRATO|CATEGORIA|PARETO(?:_ESPECIALIDADE|_FUNCAO)?|ESPECIALIDADE|FUNCAO|NAO_PRODUTIVO|EXTERNO|HORARIO|DIA_SEMANA|MES|RECOMENDACOES)\s*===\s*\n/gi;
  const markers = [...normalized.matchAll(topLevelRegex)].map((match) => ({
    key: match[1].trim().toUpperCase(),
    start: match.index ?? 0,
    contentStart: (match.index ?? 0) + match[0].length,
  }));

  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    sections[current.key] = normalized.slice(current.contentStart, next?.start ?? normalized.length).trim();
  }

  if (!sections.HORARIO) {
    sections.HORARIO = extractInferredSection(normalized, /(?:^|\n)\s*===\s*HORA\s*:/i, [
      /(?:^|\n)\s*===\s*DIA_SEMANA\s*===/i,
      /(?:^|\n)\s*===\s*DIA\s*:/i,
      /(?:^|\n)\s*===\s*MES\s*===/i,
      /(?:^|\n)\s*===\s*MES\s*:/i,
      /(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i,
    ]);
  }

  if (!sections.DIA_SEMANA) {
    sections.DIA_SEMANA = extractInferredSection(normalized, /(?:^|\n)\s*===\s*DIA\s*:/i, [
      /(?:^|\n)\s*===\s*MES\s*===/i,
      /(?:^|\n)\s*===\s*MES\s*:/i,
      /(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i,
    ]);
  }

  if (!sections.MES) {
    sections.MES = extractInferredSection(normalized, /(?:^|\n)\s*===\s*MES\s*:/i, [/(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i]);
  }

  sections.EXTERNO = trimAtNestedMarker(sections.EXTERNO || "", [
    /(?:^|\n)\s*===\s*HORA\s*:/i,
    /(?:^|\n)\s*===\s*DIA\s*:/i,
    /(?:^|\n)\s*===\s*MES\s*:/i,
    /(?:^|\n)\s*===\s*HORARIO\s*===/i,
    /(?:^|\n)\s*===\s*DIA_SEMANA\s*===/i,
    /(?:^|\n)\s*===\s*MES\s*===/i,
  ]);
  sections.HORARIO = trimAtNestedMarker(sections.HORARIO || "", [
    /(?:^|\n)\s*===\s*DIA\s*:/i,
    /(?:^|\n)\s*===\s*DIA_SEMANA\s*===/i,
    /(?:^|\n)\s*===\s*MES\s*:/i,
    /(?:^|\n)\s*===\s*MES\s*===/i,
    /(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i,
  ]);
  sections.DIA_SEMANA = trimAtNestedMarker(sections.DIA_SEMANA || "", [
    /(?:^|\n)\s*===\s*MES\s*:/i,
    /(?:^|\n)\s*===\s*MES\s*===/i,
    /(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i,
  ]);
  sections.MES = trimAtNestedMarker(sections.MES || "", [/(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i]);

  if (!Object.keys(sections).some((key) => sections[key]?.trim())) {
    sections.GERAL = normalized;
  }

  return sections;
}

function parseTimedBlocks(text: string, marker: "HORA" | "DIA" | "MES"): TimedBlock[] {
  const normalized = normalizeBlockText(text);
  if (!normalized) return [];

  const blocks: TimedBlock[] = [];
  const strictRegex = new RegExp(`(?:^|\\n)\\s*===\\s*${marker}\\s*:\\s*([^=\\n]+?)\\s*===\\s*\\n([\\s\\S]*?)(?=\\n\\s*===\\s*${marker}\\s*:|$)`, "gi");
  let match: RegExpExecArray | null;

  while ((match = strictRegex.exec(normalized)) !== null) {
    blocks.push({ label: normalizeTitle(match[1]), content: stripTags(match[2]) });
  }

  if (!blocks.length && marker === "HORA") {
    const fb = /(?:^|\n)\s*(\d{1,2}:\d{2})\s*\n([\s\S]*?)(?=\n\s*\d{1,2}:\d{2}\s*\n|$)/g;
    while ((match = fb.exec(normalized)) !== null) {
      blocks.push({ label: normalizeTitle(match[1]), content: stripTags(match[2]) });
    }
  }

  if (!blocks.length && marker === "DIA") {
    const dayPattern = WEEKDAY_ORDER.map((day) => day.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const fb = new RegExp(`(?:^|\\n)\\s*(${dayPattern})\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:${dayPattern})\\s*\\n|$)`, "gi");
    while ((match = fb.exec(normalized)) !== null) {
      blocks.push({ label: normalizeTitle(match[1]), content: stripTags(match[2]) });
    }
  }

  if (!blocks.length && marker === "MES") {
    const monthPattern = MONTH_ORDER.map((month) => month.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const fb = new RegExp(`(?:^|\\n)\\s*(${monthPattern})\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:${monthPattern})\\s*\\n|$)`, "gi");
    while ((match = fb.exec(normalized)) !== null) {
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
    return indexA !== indexB ? indexA - indexB : a.label.localeCompare(b.label, "pt-BR");
  });
}

function parseRecommendations(text: string): RecommendationBlock[] {
  const clean = stripTags(text);
  if (!clean) return [];

  const parts = clean
    .split(/(?:^|\n)\s*(?:PROBLEMA\s+\d+|Problema\s+\d+)\s*[:\-—]?\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.map((part) => {
    const block: RecommendationBlock = { title: "", problema: "", causa: "", acao: "", responsavel: "", impacto: "" };
    const lines = part.split("\n").map((line) => line.trim()).filter(Boolean);
    let activeField: keyof RecommendationBlock = "title";

    for (const rawLine of lines) {
      const line = rawLine.replace(/^[-•]\s*/, "");
      const lower = line.toLowerCase();
      if (lower.startsWith("problema:")) {
        block.problema = line.replace(/^[^:]+:\s*/, "");
        activeField = "problema";
      } else if (lower.startsWith("causa provável:") || lower.startsWith("causa provavel:") || lower.startsWith("causa:")) {
        block.causa = line.replace(/^[^:]+:\s*/, "");
        activeField = "causa";
      } else if (lower.startsWith("ação recomendada:") || lower.startsWith("acao recomendada:") || lower.startsWith("ação:") || lower.startsWith("acao:")) {
        block.acao = line.replace(/^[^:]+:\s*/, "");
        activeField = "acao";
      } else if (lower.startsWith("responsável:") || lower.startsWith("responsavel:")) {
        block.responsavel = line.replace(/^[^:]+:\s*/, "");
        activeField = "responsavel";
      } else if (lower.startsWith("impacto esperado:") || lower.startsWith("impacto:")) {
        block.impacto = line.replace(/^[^:]+:\s*/, "");
        activeField = "impacto";
      } else if (!block.title) {
        block.title = line;
      } else {
        block[activeField] = [block[activeField], line].filter(Boolean).join(" ").trim();
      }
    }

    if (!block.title) block.title = block.problema || "Problema crítico";
    return block;
  });
}

function computeLegendItems(
  rows: Array<{ [key: string]: any }>,
  legendOrder: readonly string[],
  stackOrder: readonly string[],
  keepZero = true,
): LegendItem[] {
  const totals = new Map<string, number>();
  let grandTotal = 0;

  for (const desc of stackOrder) {
    let sum = 0;
    for (const row of rows) {
      const rawKey = `raw_${desc}`;
      if (rawKey in row) sum += Number(row[rawKey] || 0);
      else if (desc in row) sum += ((Number(row[desc]) || 0) / 100) * (Number(row.total) || 0);
    }
    totals.set(desc, sum);
    grandTotal += sum;
  }

  return legendOrder
    .map((desc) => ({
      name: desc,
      color: DESC_COLORS[desc] || "#6B7280",
      percent: grandTotal > 0 ? toPercent(((totals.get(desc) || 0) / grandTotal) * 100) : 0,
    }))
    .filter((item) => keepZero || item.percent > 0);
}

function computeSimpleLegendItems(
  items: Array<{ name: string; value?: number; percent?: number }>,
  order: readonly string[],
  colorMap: Record<string, string>,
  keepZero = true,
): LegendItem[] {
  const itemMap = new Map(items.map((item) => [item.name, item]));
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);

  return order
    .map((name) => {
      const item = itemMap.get(name);
      const percent = item?.percent != null ? toPercent(Number(item.percent)) : total > 0 ? toPercent(((item?.value || 0) / total) * 100) : 0;
      return { name, color: colorMap[name] || "#6B7280", percent };
    })
    .filter((item) => keepZero || item.percent > 0);
}

function estimateChartHeight(dimensions: ChartDimensions, dimKey: string, width: number): number {
  const dim = dimensions[dimKey];
  if (!dim?.width || !dim?.height) return Math.min(width * 0.58, MAX_CHART_H);
  return Math.min(width * (dim.height / dim.width), MAX_CHART_H);
}

export async function generatePDFReport(data: PDFReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const images = data.chartImages || {};
  const dimensions = data.chartDimensions || {};
  const analysis = parseAnalysis(data.aiAnalysis);
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");
  const recommendations = parseRecommendations(analysis.RECOMENDACOES || analysis.GERAL || "");

  const contractLegend = computeLegendItems(data.byObra, LEGEND_ORDER_FULL, STACK_ORDER_FULL, true);
  const specialtyLegend = computeLegendItems(data.bySpecialty, LEGEND_ORDER, STACK_ORDER, true);
  const hourLegend = computeLegendItems(data.byTimeHorario || [], LEGEND_ORDER_FULL, STACK_ORDER_FULL, true);
  const weekLegend = computeLegendItems(data.byTimeDiaSemana || [], LEGEND_ORDER_FULL, STACK_ORDER_FULL, true);
  const monthLegend = computeLegendItems(data.byTimeMes || [], LEGEND_ORDER_FULL, STACK_ORDER_FULL, true);
  const categoryLegend = computeSimpleLegendItems(data.categoryTotals, DONUT_ORDER, CATEGORY_COLORS, true);
  const npeLegend = computeSimpleLegendItems(data.externalCausas, ["Fatores Climáticos e Consequências", "Interferências Operacionais"], DESC_COLORS, true);
  const hourBlocks = sortBlocks(parseTimedBlocks(analysis.HORARIO || "", "HORA"), HOUR_ORDER);
  const weekdayBlocks = sortBlocks(parseTimedBlocks(analysis.DIA_SEMANA || "", "DIA"), WEEKDAY_ORDER);
  const monthBlocks = sortBlocks(parseTimedBlocks(analysis.MES || "", "MES"), MONTH_ORDER);

  let curY = MARGIN;
  let sectionCount = 0;

  // Yield to main thread periodically to prevent UI freeze
  const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

  const newPage = () => {
    doc.addPage("a4", "portrait");
    doc.setFillColor(...C.pageBg);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    curY = MARGIN;
  };

  const ensureSpace = (height: number) => {
    if (curY + height > MAX_Y) newPage();
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
    const clean = normalizeTitle(title);
    if (!clean) return;
    ensureSpace(10);
    doc.setFillColor(...C.sectionBgDark);
    doc.roundedRect(MARGIN + 1, curY, CONTENT_W - 2, 8, 1.6, 1.6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...C.white);
    doc.text(clean, MARGIN + 5, curY + 5.2);
    curY += 10;
  };

  const getAnalysisBlocks = (text: string, width: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    return buildStyledPdfLines(doc, stripTags(text), width);
  };

  const measureAnalysisBox = (text: string): number => {
    const blocks = getAnalysisBlocks(text, CONTENT_W - 12);
    const lineCount = countStyledPdfLines(blocks);
    return lineCount > 0 ? Math.max(16, lineCount * ANALYSIS_LINE_H + 8) + 2 : 0;
  };

  const drawAnalysisBox = (text: string) => {
    const blocks = getAnalysisBlocks(text, CONTENT_W - 12);
    if (!blocks.length) return;

    const lineCount = countStyledPdfLines(blocks);
    const boxH = Math.max(16, lineCount * ANALYSIS_LINE_H + 8);
    ensureSpace(boxH + 2);

    doc.setFillColor(...C.analysisBg);
    doc.roundedRect(MARGIN, curY, CONTENT_W, boxH, 1.5, 1.5, "F");
    doc.setFillColor(...C.sectionBg);
    doc.rect(MARGIN, curY, 2, boxH, "F");

    let textY = curY + 5;
    doc.setFontSize(9);

    for (const block of blocks) {
      if (block.prefix) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.blue);
        doc.text(block.prefix, MARGIN + 6, textY);

        const firstLine = block.lines[0] || "";
        if (firstLine) {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textDark);
          doc.text(firstLine, MARGIN + 6 + doc.getTextWidth(block.prefix) + 1.5, textY);
        }

        textY += ANALYSIS_LINE_H;
        for (const continuation of block.lines.slice(1)) {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textDark);
          doc.text(continuation, MARGIN + 6, textY);
          textY += ANALYSIS_LINE_H;
        }
        textY += 0.8;
        continue;
      }

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.textDark);
      for (const line of block.lines) {
        doc.text(line, MARGIN + 6, textY);
        textY += ANALYSIS_LINE_H;
      }
      textY += 0.8;
    }

    curY += boxH + 2;
  };

  const drawLegend = (items: LegendItem[], x: number, y: number): number => {
    if (!items.length) return 0;
    const textW = LEGEND_W - 10;
    let drawY = y;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(LEGEND_FONT_PT);

    for (const item of items) {
      const label = `${item.name} — ${fmtPct(item.percent)}`;
      const lines = wrapTextByWords(doc, label, textW - 5);
      const itemH = Math.max(4.5, lines.length * LEGEND_LINE_H);
      const rgb = hexToRgb(item.color);
      const swX = x + 2;
      const swY = drawY + 0.7;
      const textX = swX + 5.2;

      doc.setFillColor(...rgb);
      if (isWhiteColor(item.color)) {
        doc.setDrawColor(...C.border);
        doc.roundedRect(swX, swY, 3.2, 3.2, 0.5, 0.5, "FD");
      } else {
        doc.roundedRect(swX, swY, 3.2, 3.2, 0.5, 0.5, "F");
      }

      doc.setTextColor(...(isWhiteColor(item.color) ? C.textMuted : C.textDark));
      doc.setFont("helvetica", "bold");
      doc.text(lines[0] || "", textX, drawY + 3.6);
      if (lines.length > 1) {
        doc.setFont("helvetica", "normal");
        for (let i = 1; i < lines.length; i += 1) {
          doc.text(lines[i], textX, drawY + 3.6 + i * LEGEND_LINE_H);
        }
      }

      drawY += itemH + LEGEND_ITEM_GAP;
    }

    return drawY - y;
  };

  const measureLegendH = (items: LegendItem[]): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(LEGEND_FONT_PT);
    const textW = LEGEND_W - 10;
    let height = 0;
    for (const item of items) {
      const lines = wrapTextByWords(doc, `${item.name} — ${fmtPct(item.percent)}`, textW - 5);
      height += Math.max(4.5, lines.length * LEGEND_LINE_H) + LEGEND_ITEM_GAP;
    }
    return height;
  };

  const drawChart = (image: string | undefined, dimKey: string, width: number, x = MARGIN): number => {
    if (!image) return 0;
    const height = estimateChartHeight(dimensions, dimKey, width);
    doc.addImage(image, "PNG", x, curY, width, height);
    return height;
  };

  const renderStandardBlock = async (title: string, image: string | undefined, dimKey: string, legend: LegendItem[], analysisText?: string) => {
    sectionCount++;
    if (sectionCount % 2 === 0) await yieldToMain();

    const chartH = image ? estimateChartHeight(dimensions, dimKey, legend.length ? CHART_W : CONTENT_W) : 0;
    const legendH = legend.length ? measureLegendH(legend) : 0;
    const rowH = Math.max(chartH, legendH);
    const analysisH = analysisText?.trim() ? measureAnalysisBox(analysisText) : 0;
    ensureSpace(12 + rowH + 3 + analysisH);

    sectionHeader(title);
    const rowStart = curY;
    const drawnChartH = image ? drawChart(image, dimKey, legend.length ? CHART_W : CONTENT_W) : 0;
    const drawnLegendH = legend.length ? drawLegend(legend, MARGIN + CHART_W, rowStart) : 0;
    curY = rowStart + Math.max(drawnChartH, drawnLegendH) + 3;
    if (analysisText?.trim()) drawAnalysisBox(analysisText);
  };

  const renderParetoBlock = (title: string, image: string | undefined, dimKey: string, analysisText?: string) => {
    if (!image && !analysisText?.trim()) return;
    const chartH = image ? estimateChartHeight(dimensions, dimKey, CONTENT_W) : 0;
    const analysisH = analysisText?.trim() ? measureAnalysisBox(analysisText) : 0;
    ensureSpace(12 + chartH + 3 + analysisH);

    sectionHeader(title);
    if (image) {
      const drawnChartH = drawChart(image, dimKey, CONTENT_W);
      curY += drawnChartH + 3;
    }
    if (analysisText?.trim()) drawAnalysisBox(analysisText);
  };

  const renderTimedBlock = (title: string, image: string | undefined, dimKey: string, legend: LegendItem[], blocks: TimedBlock[]) => {
    const chartH = image ? estimateChartHeight(dimensions, dimKey, legend.length ? CHART_W : CONTENT_W) : 0;
    const legendH = legend.length ? measureLegendH(legend) : 0;
    ensureSpace(12 + Math.max(chartH, legendH) + 3);

    sectionHeader(title);
    const rowStart = curY;
    const drawnChartH = image ? drawChart(image, dimKey, legend.length ? CHART_W : CONTENT_W) : 0;
    const drawnLegendH = legend.length ? drawLegend(legend, MARGIN + CHART_W, rowStart) : 0;
    curY = rowStart + Math.max(drawnChartH, drawnLegendH) + 3;

    for (const block of blocks) {
      const headerH = block.label ? 10 : 0;
      const boxH = block.content?.trim() ? measureAnalysisBox(block.content) : 0;
      if (headerH + boxH > 0) ensureSpace(headerH + boxH);
      if (block.label) subHeader(block.label);
      if (block.content?.trim()) drawAnalysisBox(block.content);
    }
  };

  const buildRecommendationText = (item: RecommendationBlock, index: number) => {
    const lines = [
      item.title ? `Problema crítico ${index + 1}: ${item.title}` : "",
      item.problema ? `1. Diagnóstico: ${item.problema}` : "",
      item.causa ? `2. Interpretação operacional: ${item.causa}` : "",
      item.acao ? `3. Ação recomendada: ${item.acao}` : "",
      item.responsavel ? `4. Responsável: ${item.responsavel}` : "",
      item.impacto ? `5. Impacto esperado: ${item.impacto}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  };

  doc.setFillColor(...C.pageBg);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
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
    { label: "Produtividade", value: fmtPct(data.produtivoPct), color: C.green },
    { label: "Suplementar", value: fmtPct(data.suplementarPct), color: C.amber },
    { label: "Não Produtivo", value: fmtPct(data.naoProdutivoPct), color: C.red },
    { label: "NPE (Externo)", value: fmtPct(data.externoPct), color: C.orange },
  ];
  const kpiGap = 3;
  const kpiWidth = (CONTENT_W - kpiGap * 4) / 5;
  kpis.forEach((kpi, index) => {
    const x = MARGIN + index * (kpiWidth + kpiGap);
    doc.setFillColor(...C.cardBg);
    doc.setDrawColor(...C.border);
    doc.roundedRect(x, curY, kpiWidth, 22, 1.2, 1.2, "FD");
    doc.setFillColor(...kpi.color);
    doc.rect(x, curY, kpiWidth, 1.5, "F");
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
  drawAnalysisBox(analysis.RESUMO || analysis.GERAL || "Diagnóstico geral indisponível para este período.");

  renderStandardBlock("Visão Geral por Contrato", images.contrato, "contrato", contractLegend, analysis.CONTRATO);
  renderStandardBlock("Distribuição por Categoria", images.categoria, "categoria", categoryLegend, analysis.CATEGORIA);
  renderParetoBlock("Top Causas — Pareto por Categorias", images.paretoCategoria, "paretoCategoria", analysis.PARETO);
  
  renderStandardBlock("Produtividade por Especialidade", images.especialidade, "especialidade", specialtyLegend, analysis.ESPECIALIDADE);
  renderStandardBlock("Causas Externas de Parada (NPE)", images.externas, "externas", npeLegend, analysis.EXTERNO);
  renderTimedBlock("Produtividade por Horário", images.tempoHorario, "tempoHorario", hourLegend, hourBlocks);
  renderTimedBlock("Produtividade por Dia da Semana", images.tempoDiaSemana, "tempoDiaSemana", weekLegend, weekdayBlocks);
  renderTimedBlock("Produtividade por Mês", images.tempoMes, "tempoMes", monthLegend, monthBlocks);

  sectionHeader("Conclusões e Recomendações");
  if (recommendations.length) {
    recommendations.forEach((item, index) => drawAnalysisBox(buildRecommendationText(item, index)));
  } else {
    drawAnalysisBox(analysis.RECOMENDACOES || analysis.GERAL || "Sem recomendações estruturadas para este período.");
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textMuted);
    doc.text(`ProdControl — Página ${page} de ${totalPages}`, MARGIN, PAGE_H - 8);
    doc.text(dateStr, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  doc.save(`relatorio-produtividade_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
}
