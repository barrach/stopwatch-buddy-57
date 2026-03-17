import jsPDF from "jspdf";
import { format } from "date-fns";
import type { ChartImages, ChartDimensions } from "./chartCapture";

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */

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
type RecBlock = { title: string; problema: string; causa: string; acao: string; responsavel: string; impacto: string };

/* ═══════════════════════════════════════════════════════════
   CONSTANTS — canonical orders & colors
   ═══════════════════════════════════════════════════════════ */

// Stack order bottom→top (Trabalhando at bottom, Ocioso/Causas Naturais at top)
const STACK_ORDER_FULL = [
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

const STACK_ORDER = STACK_ORDER_FULL.filter((n) => n !== "Causas Naturais");

// Legend order = visual top→bottom = REVERSED stack order
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
  Assistindo: "#15803D",
  "Aguardando Liberações": "#F5E6D0",
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

/* ═══════════════════════════════════════════════════════════
   LAYOUT CONSTANTS
   ═══════════════════════════════════════════════════════════ */

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
const CHART_RATIO = 0.70;
const LEGEND_RATIO = 0.30;
const CHART_W = CONTENT_W * CHART_RATIO;
const LEGEND_W = CONTENT_W * LEGEND_RATIO;
const MAX_CHART_H = 108;
const LEGEND_FONT_PT = 9;
const LEGEND_LINE_H = 4.2;
const LEGEND_ITEM_GAP = 3;

/* ═══════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════ */

function hexToRgb(hex: string): RGB {
  const v = hex.replace("#", "");
  return [parseInt(v.substring(0, 2), 16), parseInt(v.substring(2, 4), 16), parseInt(v.substring(4, 6), 16)];
}

function isWhiteColor(hex: string): boolean {
  const h = hex.toUpperCase();
  return h === "#FFFFFF" || h === "#F5E6D0";
}

function toPercent(value: number): number {
  return Number((value || 0).toFixed(1));
}

function fmtPct(p: number): string {
  return `${toPercent(p).toFixed(1)}%`;
}

function normalizeTitle(raw: string): string {
  return raw
    .replace(/^={2,}\s*(?:DIA|HORA)\s*:\s*/i, "")
    .replace(/^\*\*/g, "").replace(/\*\*$/g, "")
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

/* ═══════════════════════════════════════════════════════════
   AI ANALYSIS PARSING
   ═══════════════════════════════════════════════════════════ */

function normalizeBlockText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function getFirstMatchIndex(text: string, patterns: RegExp[]): number {
  const indexes = patterns
    .map((pattern) => text.search(pattern))
    .filter((index) => index >= 0);

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

  for (let i = 0; i < markers.length; i++) {
    const current = markers[i];
    const next = markers[i + 1];
    sections[current.key] = normalized.slice(current.contentStart, next?.start ?? normalized.length).trim();
  }

  // --- Infer missing sections from inline markers ---
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
    sections.MES = extractInferredSection(normalized, /(?:^|\n)\s*===\s*MES\s*:/i, [
      /(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i,
    ]);
  }

  // --- CRITICAL: Trim each section to prevent content leaking into the next ---
  // EXTERNO must not contain HORA/DIA/MES blocks
  sections.EXTERNO = trimAtNestedMarker(sections.EXTERNO || "", [
    /(?:^|\n)\s*===\s*HORA\s*:/i,
    /(?:^|\n)\s*===\s*DIA\s*:/i,
    /(?:^|\n)\s*===\s*MES\s*:/i,
    /(?:^|\n)\s*===\s*HORARIO\s*===/i,
    /(?:^|\n)\s*===\s*DIA_SEMANA\s*===/i,
    /(?:^|\n)\s*===\s*MES\s*===/i,
  ]);

  // HORARIO must not contain DIA or MES blocks
  sections.HORARIO = trimAtNestedMarker(sections.HORARIO || "", [
    /(?:^|\n)\s*===\s*DIA\s*:/i,
    /(?:^|\n)\s*===\s*DIA_SEMANA\s*===/i,
    /(?:^|\n)\s*===\s*MES\s*:/i,
    /(?:^|\n)\s*===\s*MES\s*===/i,
    /(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i,
  ]);

  // DIA_SEMANA must not contain MES blocks
  sections.DIA_SEMANA = trimAtNestedMarker(sections.DIA_SEMANA || "", [
    /(?:^|\n)\s*===\s*MES\s*:/i,
    /(?:^|\n)\s*===\s*MES\s*===/i,
    /(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i,
  ]);

  // MES must not contain RECOMENDACOES
  sections.MES = trimAtNestedMarker(sections.MES || "", [
    /(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i,
  ]);

  if (!Object.keys(sections).some((key) => sections[key]?.trim())) {
    sections.GERAL = normalized;
  }

  return sections;
}

function parseTimedBlocks(text: string, marker: "HORA" | "DIA" | "MES"): TimedBlock[] {
  const normalized = normalizeBlockText(text);
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
    const fb = /(?:^|\n)\s*(\d{1,2}:\d{2})\s*\n([\s\S]*?)(?=\n\s*\d{1,2}:\d{2}\s*\n|$)/g;
    while ((match = fb.exec(normalized)) !== null) {
      blocks.push({ label: normalizeTitle(match[1]), content: stripTags(match[2]) });
    }
  }

  if (!blocks.length && marker === "DIA") {
    const dayPattern = WEEKDAY_ORDER.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const fb = new RegExp(`(?:^|\\n)\\s*(${dayPattern})\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:${dayPattern})\\s*\\n|$)`, "gi");
    while ((match = fb.exec(normalized)) !== null) {
      blocks.push({ label: normalizeTitle(match[1]), content: stripTags(match[2]) });
    }
  }

  if (!blocks.length && marker === "MES") {
    const monthPattern = MONTH_ORDER.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const fb = new RegExp(`(?:^|\\n)\\s*(${monthPattern})\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:${monthPattern})\\s*\\n|$)`, "gi");
    while ((match = fb.exec(normalized)) !== null) {
      blocks.push({ label: normalizeTitle(match[1]), content: stripTags(match[2]) });
    }
  }

  return blocks.length ? blocks : [{ label: "", content: stripTags(normalized) }];
}

function sortBlocks(blocks: TimedBlock[], order: readonly string[]): TimedBlock[] {
  const map = new Map(order.map((item, i) => [item, i]));
  return [...blocks].sort((a, b) => {
    const iA = map.get(a.label) ?? Number.MAX_SAFE_INTEGER;
    const iB = map.get(b.label) ?? Number.MAX_SAFE_INTEGER;
    return iA !== iB ? iA - iB : a.label.localeCompare(b.label, "pt-BR");
  });
}

function parseRecommendations(text: string): RecBlock[] {
  const clean = stripTags(text);
  if (!clean) return [];
  const parts = clean.split(/(?:^|\n)\s*(?:PROBLEMA\s+\d+|Problema\s+\d+)\s*[:\-]?\s*/).map((p) => p.trim()).filter(Boolean);
  return parts.map((part) => {
    const block: RecBlock = { title: "", problema: "", causa: "", acao: "", responsavel: "", impacto: "" };
    const lines = part.split("\n").map((l) => l.trim()).filter(Boolean);
    let activeField: keyof RecBlock = "title";
    for (const line of lines) {
      const n = line.replace(/^[-•]\s*/, "");
      const lower = n.toLowerCase();
      if (lower.startsWith("problema:")) { block.problema = n.replace(/^[^:]+:\s*/, ""); activeField = "problema"; }
      else if (lower.startsWith("causa provável:") || lower.startsWith("causa provavel:") || lower.startsWith("causa:")) { block.causa = n.replace(/^[^:]+:\s*/, ""); activeField = "causa"; }
      else if (lower.startsWith("ação recomendada:") || lower.startsWith("acao recomendada:") || lower.startsWith("ação:") || lower.startsWith("acao:")) { block.acao = n.replace(/^[^:]+:\s*/, ""); activeField = "acao"; }
      else if (lower.startsWith("responsável:") || lower.startsWith("responsavel:")) { block.responsavel = n.replace(/^[^:]+:\s*/, ""); activeField = "responsavel"; }
      else if (lower.startsWith("impacto esperado:") || lower.startsWith("impacto:")) { block.impacto = n.replace(/^[^:]+:\s*/, ""); activeField = "impacto"; }
      else if (!block.title) block.title = n;
      else block[activeField] = [block[activeField], n].filter(Boolean).join(" ").trim();
    }
    if (!block.title) block.title = block.problema || "Problema crítico";
    return block;
  });
}

/* ═══════════════════════════════════════════════════════════
   LEGEND COMPUTATION — respects visual stack order
   ═══════════════════════════════════════════════════════════ */

function computeLegendItems(
  rows: Array<{ [key: string]: any }>,
  legendOrder: readonly string[],
  stackOrder: readonly string[],
  keepZero = true
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
      percent: grandTotal > 0 ? toPercent((Number(totals.get(desc) || 0) / grandTotal) * 100) : 0,
    }))
    .filter((item) => keepZero || item.percent > 0);
}

function computeSimpleLegendItems(
  items: Array<{ name: string; value?: number; percent?: number }>,
  order: readonly string[],
  colorMap: Record<string, string>,
  keepZero = true
): LegendItem[] {
  const itemMap = new Map(items.map((i) => [i.name, i]));
  const total = items.reduce((s, i) => s + Number(i.value || 0), 0);
  return order
    .map((name) => {
      const item = itemMap.get(name);
      const percent = item?.percent != null ? toPercent(Number(item.percent)) : total > 0 ? toPercent((Number(item?.value || 0) / total) * 100) : 0;
      return { name, color: colorMap[name] || "#6B7280", percent };
    })
    .filter((item) => keepZero || item.percent > 0);
}

function estimateChartHeight(dimensions: ChartDimensions, dimKey: string, width: number): number {
  const dim = dimensions[dimKey];
  if (!dim?.width || !dim?.height) return Math.min(width * 0.58, MAX_CHART_H);
  return Math.min(width * (dim.height / dim.width), MAX_CHART_H);
}

/* ═══════════════════════════════════════════════════════════
   MODEL BUILDER — validates all data before rendering
   ═══════════════════════════════════════════════════════════ */

function buildModel(data: PDFReportData, analysis: AnalysisSections) {
  // Legend uses REVERSED order (top of stack first) to match visual
  const contractLegend = computeLegendItems(data.byObra, LEGEND_ORDER_FULL, STACK_ORDER_FULL, true);
  const specialtyLegend = computeLegendItems(data.bySpecialty, LEGEND_ORDER, STACK_ORDER, true);
  const hourLegend = computeLegendItems(data.byTimeHorario || [], LEGEND_ORDER, STACK_ORDER, true);
  const weekLegend = computeLegendItems(data.byTimeDiaSemana || [], LEGEND_ORDER, STACK_ORDER, true);
  const monthLegend = computeLegendItems(data.byTimeMes || [], LEGEND_ORDER, STACK_ORDER, true);
  const categoryLegend = computeSimpleLegendItems(data.categoryTotals, DONUT_ORDER, CATEGORY_COLORS, true);
  const npeLegend = computeSimpleLegendItems(data.externalCausas, ["Causas Naturais", "Aguardando Liberações"], DESC_COLORS, true);
  const hourBlocks = sortBlocks(parseTimedBlocks(analysis.HORARIO || "", "HORA"), HOUR_ORDER);
  const weekdayBlocks = sortBlocks(parseTimedBlocks(analysis.DIA_SEMANA || "", "DIA"), WEEKDAY_ORDER);
  const monthBlocks = sortBlocks(parseTimedBlocks(analysis.MES || "", "MES"), MONTH_ORDER);
  const recommendations = parseRecommendations(analysis.RECOMENDACOES || analysis.GERAL || "");

  return { contractLegend, specialtyLegend, hourLegend, weekLegend, monthLegend, categoryLegend, npeLegend, hourBlocks, weekdayBlocks, monthBlocks, recommendations };
}

/* ═══════════════════════════════════════════════════════════
   MAIN PDF GENERATOR
   ═══════════════════════════════════════════════════════════ */

export function generatePDFReport(data: PDFReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const images = data.chartImages || {};
  const dims = data.chartDimensions || {};
  const analysis = parseAnalysis(data.aiAnalysis);
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");
  const model = buildModel(data, analysis);

  let curY = MARGIN;

  /* ── page management ── */
  const newPage = () => {
    doc.addPage("a4", "portrait");
    doc.setFillColor(...C.pageBg);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    curY = MARGIN;
  };

  const ensureSpace = (h: number) => {
    if (curY + h > MAX_Y) newPage();
  };

  /* ── drawing primitives ── */
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

  const drawAnalysisBox = (text: string) => {
    const clean = stripTags(text);
    if (!clean) return;

    const paragraphs = clean.split("\n").map((l) => l.trim()).filter(Boolean);
    const bodyW = CONTENT_W - 14;
    const wrapped: string[] = [];
    paragraphs.forEach((p, i) => {
      const lines = doc.splitTextToSize(p, bodyW) as string[];
      wrapped.push(...lines);
      if (i < paragraphs.length - 1) wrapped.push("");
    });

    const boxH = Math.max(12, wrapped.length * 4 + 6);
    ensureSpace(boxH + 2);

    doc.setFillColor(...C.analysisBg);
    doc.roundedRect(MARGIN, curY, CONTENT_W, boxH, 1.5, 1.5, "F");
    doc.setFillColor(...C.sectionBg);
    doc.rect(MARGIN, curY, 2, boxH, "F");

    let ty = curY + 5;
    doc.setFontSize(9);
    for (const line of wrapped) {
      if (!line) { ty += 1.5; continue; }
      const ci = line.indexOf(":");
      if (ci > 0 && ci < 40) {
        const prefix = line.slice(0, ci + 1);
        const rest = line.slice(ci + 1).trimStart();
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.sectionBg);
        doc.text(prefix, MARGIN + 6, ty);
        const pw = doc.getTextWidth(prefix);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textDark);
        doc.text(rest, MARGIN + 6 + pw + 1, ty);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textDark);
        doc.text(line, MARGIN + 6, ty);
      }
      ty += 4;
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
      const lines = doc.splitTextToSize(label, textW - 5) as string[];
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
    doc.setFont("helvetica", "normal");
    doc.setFontSize(LEGEND_FONT_PT);
    const tW = LEGEND_W - 10;
    let h = 0;
    for (const item of items) {
      const lines = doc.splitTextToSize(`${item.name} — ${fmtPct(item.percent)}`, tW - 5) as string[];
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

  /* ══════════════════════════════════════════════════════════
     BLOCK RENDERERS — enforce TITLE → CHART → LEGEND → ANALYSIS
     ══════════════════════════════════════════════════════════ */

  /** Standard section: title → chart(70%) + legend(30%) → analysis */
  const renderBlock = (title: string, img: string | undefined, dimKey: string, legend: LegendItem[], analysisText?: string) => {
    const chartH = estimateChartHeight(dims, dimKey, legend.length ? CHART_W : CONTENT_W);
    const legendH = legend.length ? measureLegendH(legend) : 0;
    const rowH = Math.max(chartH, legendH);
    ensureSpace(12 + rowH + 12);

    // 1. TITLE
    sectionHeader(title);

    // 2. CHART + 3. LEGEND (side by side)
    const rowStart = curY;
    const ch = drawChart(img, dimKey, legend.length ? CHART_W : CONTENT_W);
    const lh = legend.length ? drawLegend(legend, MARGIN + CHART_W, rowStart) : 0;
    curY = rowStart + Math.max(ch, lh) + 3;

    // 4. ANALYSIS
    if (analysisText?.trim()) drawAnalysisBox(analysisText);
  };

  /** Section with per-item analysis blocks (hours, weekdays) */
  const renderBlockWithSubs = (title: string, img: string | undefined, dimKey: string, legend: LegendItem[], blocks: TimedBlock[]) => {
    const chartH = estimateChartHeight(dims, dimKey, legend.length ? CHART_W : CONTENT_W);
    const legendH = legend.length ? measureLegendH(legend) : 0;
    const rowH = Math.max(chartH, legendH);
    ensureSpace(12 + rowH + 12);

    // 1. TITLE
    sectionHeader(title);

    // 2. CHART + 3. LEGEND
    const rowStart = curY;
    const ch = drawChart(img, dimKey, legend.length ? CHART_W : CONTENT_W);
    const lh = legend.length ? drawLegend(legend, MARGIN + CHART_W, rowStart) : 0;
    curY = rowStart + Math.max(ch, lh) + 3;

    // 4. ANALYSIS (per block, each with sub-header)
    blocks.forEach((b) => {
      if (b.label) subHeader(b.label);
      if (b.content?.trim()) drawAnalysisBox(b.content);
    });
  };

  /** Pareto section: title → chart(100%) → analysis — NO legend */
  const renderPareto = (title: string, img: string | undefined, dimKey: string, analysisText?: string) => {
    const chartH = estimateChartHeight(dims, dimKey, CONTENT_W);
    ensureSpace(12 + chartH + 12);

    // 1. TITLE
    sectionHeader(title);

    // 2. CHART (full width, no legend)
    const ch = drawChart(img, dimKey, CONTENT_W);
    curY += ch + 3;

    // 3. ANALYSIS
    if (analysisText?.trim()) drawAnalysisBox(analysisText);
  };

  /* ══════════════════════════════════════════════════════════
     RENDER SEQUENCE — strict order, no blank pages
     ══════════════════════════════════════════════════════════ */

  // ─── PAGE 1: COVER (draw on the initial page jsPDF already created) ───
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

  // ─── SECTION 2: KPI CARDS ───
  sectionHeader("Indicadores Principais");
  const kpis = [
    { label: "Total de Amostras", value: `${data.totalAmostras}`, color: C.blue },
    { label: "Produtividade", value: fmtPct(data.produtivoPct), color: C.green },
    { label: "Suplementar", value: fmtPct(data.suplementarPct), color: C.amber },
    { label: "Não Produtivo", value: fmtPct(data.naoProdutivoPct), color: C.red },
    { label: "NPE (Externo)", value: fmtPct(data.externoPct), color: C.orange },
  ];
  const kpiGap = 3;
  const kpiW = (CONTENT_W - kpiGap * 4) / 5;
  kpis.forEach((kpi, i) => {
    const x = MARGIN + i * (kpiW + kpiGap);
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

  // Executive summary
  drawAnalysisBox(analysis.RESUMO || analysis.GERAL || "Diagnóstico geral da obra indisponível para este período.");

  // ─── SECTION 3: Visão Geral por Contrato ───
  renderBlock("Visão Geral por Contrato", images.contrato, "contrato", model.contractLegend, analysis.CONTRATO);

  // ─── SECTION 4: Distribuição por Categoria ───
  renderBlock("Distribuição por Categoria", images.categoria, "categoria", model.categoryLegend, analysis.CATEGORIA);

  // ─── SECTION 5: Pareto por Categorias ───
  renderPareto("Top Causas — Pareto por Categorias", images.paretoCategoria, "paretoCategoria", analysis.PARETO);

  // ─── SECTION 6: Pareto por Especialidades ───
  renderPareto("Top Causas — Pareto por Especialidades", images.paretoEspecialidade, "paretoEspecialidade", analysis.PARETO_ESPECIALIDADE);

  // ─── SECTION 7: Produtividade por Especialidade ───
  renderBlock("Produtividade por Especialidade", images.especialidade, "especialidade", model.specialtyLegend, analysis.ESPECIALIDADE);

  // ─── SECTION 8: Causas Externas de Parada ───
  renderBlock("Causas Externas de Parada (NPE)", images.externas, "externas", model.npeLegend, analysis.EXTERNO);

  // ─── SECTION 9: Produtividade por Horário ───
  if (images.tempoHorario) {
    renderBlockWithSubs("Produtividade por Horário", images.tempoHorario, "tempoHorario", model.hourLegend, model.hourBlocks);
  }

  // ─── SECTION 10: Produtividade por Dia da Semana ───
  if (images.tempoDiaSemana) {
    renderBlockWithSubs("Produtividade por Dia da Semana", images.tempoDiaSemana, "tempoDiaSemana", model.weekLegend, model.weekdayBlocks);
  }

  // ─── SECTION 11: Produtividade por Mês ───
  renderBlockWithSubs("Produtividade por Mês", images.tempoMes, "tempoMes", model.monthLegend, model.monthBlocks);

  // ─── SECTION 12: Conclusões e Recomendações ───
  sectionHeader("Conclusões e Recomendações");
  if (model.recommendations.length) {
    model.recommendations.forEach((item, index) => {
      const fields = [
        { label: "PROBLEMA", value: item.problema },
        { label: "CAUSA PROVÁVEL", value: item.causa },
        { label: "AÇÃO RECOMENDADA", value: item.acao },
        { label: "RESPONSÁVEL", value: item.responsavel },
        { label: "IMPACTO ESPERADO", value: item.impacto },
      ].filter((f) => f.value?.trim());

      let blockH = 12;
      fields.forEach((f) => {
        const lines = doc.splitTextToSize(f.value, CONTENT_W - 16) as string[];
        blockH += 5 + lines.length * 3.6;
      });

      ensureSpace(blockH + 6);
      doc.setFillColor(...C.sectionBgDark);
      doc.roundedRect(MARGIN + 1, curY, CONTENT_W - 2, 8, 1.6, 1.6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...C.white);
      doc.text(`PROBLEMA ${index + 1} — ${item.title}`, MARGIN + 5, curY + 5.2);
      curY += 10;

      fields.forEach((f) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...C.sectionBg);
        doc.text(f.label, MARGIN + 5, curY + 3.5);
        curY += 5;
        const lines = doc.splitTextToSize(f.value, CONTENT_W - 16) as string[];
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...C.textDark);
        doc.text(lines, MARGIN + 9, curY + 3);
        curY += lines.length * 3.6 + 2;
      });
      curY += 2;
    });
  } else {
    drawAnalysisBox(analysis.RECOMENDACOES || analysis.GERAL || "Sem recomendações estruturadas para este período.");
  }

  // ─── FOOTER (all pages) ───
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textMuted);
    doc.text(`ProdControl — Página ${p} de ${totalPages}`, MARGIN, PAGE_H - 8);
    doc.text(dateStr, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  doc.save(`relatorio-produtividade_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
}
