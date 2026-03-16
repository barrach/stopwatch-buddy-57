import jsPDF from "jspdf";
import { format } from "date-fns";
import type { ChartImages, ChartDimensions } from "./chartCapture";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const CANONICAL_ORDER_FULL: string[] = [
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
];

const CANONICAL_ORDER = CANONICAL_ORDER_FULL.filter(d => d !== "Causas Naturais");

const DESC_COLORS: Record<string, string> = {
  "Trabalhando": "#2563EB",
  "Planejando": "#60A5FA",
  "Aguardando Ferramenta ou Material": "#4ADE80",
  "Transitando no local de trabalho - com ferramenta": "#22C55E",
  "Transitando no local de trabalho - sem ferramenta": "#16A34A",
  "Transitando fora do local de trabalho - com ferramenta": "#65A30D",
  "Transitando fora do local de trabalho - sem ferramenta": "#84CC16",
  "Assistindo": "#15803D",
  "Aguardando Liberações": "#FFFFFF",
  "Pessoal": "#EF4444",
  "Ocioso": "#DC2626",
  "Causas Naturais": "#F97316",
};

type RGB = [number, number, number];

const C = {
  headerBg: [15, 23, 42] as RGB,
  sectionBg: [23, 80, 97] as RGB,
  white: [255, 255, 255] as RGB,
  pageBg: [255, 255, 255] as RGB,
  textDark: [30, 30, 30] as RGB,
  textGray: [100, 100, 100] as RGB,
  textLight: [130, 130, 130] as RGB,
  cardBg: [245, 245, 245] as RGB,
  cardBorder: [220, 220, 220] as RGB,
  accentBlue: [59, 130, 246] as RGB,
  accentGreen: [22, 163, 74] as RGB,
  accentAmber: [245, 158, 11] as RGB,
  accentRed: [220, 38, 38] as RGB,
  analysisBorder: [23, 80, 97] as RGB,
  analysisBg: [240, 245, 247] as RGB,
};

// ═══════════════════════════════════════════════════════════════
// PARSERS
// ═══════════════════════════════════════════════════════════════

interface AnalysisSections { [key: string]: string; }

function parseAnalysis(aiText: string): AnalysisSections {
  const sections: AnalysisSections = {};
  if (!aiText) return sections;
  const regex = /===\s*([A-Z_]+)\s*===\s*\n([\s\S]*?)(?=\n===\s*[A-Z_]+\s*===|$)/g;
  let m;
  while ((m = regex.exec(aiText)) !== null) sections[m[1].trim()] = m[2].trim();
  if (!Object.keys(sections).length) sections["GERAL"] = aiText;
  return sections;
}

function stripTags(text: string): string {
  return text
    .replace(/===\s*HORA\s*:\s*(.*?)\s*===/gi, "$1")
    .replace(/===\s*DIA\s*:\s*(.*?)\s*===/gi, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTitle(raw: string): string {
  return raw
    .replace(/^={2,}\s*(?:DIA|HORA)\s*[:]\s*/i, "")
    .replace(/\s*={2,}\s*$/i, "")
    .replace(/^(?:Dia|Hora|HORA|DIA)\s*[-—:.\s]\s*/i, "")
    .replace(/^(?:Dia|Hora)\s+/i, "")
    .trim();
}

function parseTimedBlocks(text: string, marker: "HORA" | "DIA"): Array<{ label: string; content: string }> {
  const blocks: Array<{ label: string; content: string }> = [];
  const normalized = text.replace(/\r\n/g, "\n");

  // Try === MARKER: value === format
  const regex = new RegExp(
    `(?:^|\\n)\\s*===\\s*${marker}\\s*:\\s*([^=\\n]+?)\\s*===\\s*\\n([\\s\\S]*?)(?=\\n\\s*===\\s*${marker}\\s*:|$)`,
    "gi"
  );
  let m;
  while ((m = regex.exec(normalized)) !== null) {
    blocks.push({ label: normalizeTitle(m[1]), content: stripTags(m[2]) });
  }

  // Fallback for hours: **XX:00** patterns
  if (blocks.length === 0 && marker === "HORA") {
    const hourRegex = /(?:^|\n)\s*\*?\*?(\d{1,2}:\d{2})\*?\*?\s*\n([\s\S]*?)(?=\n\s*\*?\*?\d{1,2}:\d{2}\*?\*?\s*\n|$)/gi;
    while ((m = hourRegex.exec(normalized)) !== null) {
      blocks.push({ label: m[1].trim(), content: stripTags(m[2]) });
    }
  }

  if (blocks.length === 0 && normalized.trim()) {
    blocks.push({ label: "", content: stripTags(normalized) });
  }
  return blocks;
}

interface RecBlock {
  title: string;
  problema: string;
  causa: string;
  acao: string;
  responsavel: string;
  impacto: string;
}

function parseRecommendations(text: string): RecBlock[] {
  const blocks: RecBlock[] = [];
  const parts = text.split(/(?:^|\n)\s*(?:\*\*)?Problema\s*\d+\s*(?:[-—:]\s*)?/i).filter(p => p.trim());
  for (const part of parts) {
    const lines = part.split("\n").map(l => l.trim()).filter(Boolean);
    const block: RecBlock = { title: "", problema: "", causa: "", acao: "", responsavel: "", impacto: "" };
    let field = "title";
    for (const line of lines) {
      const clean = line.replace(/\*\*/g, "").replace(/^[-•]\s*/, "");
      const lower = clean.toLowerCase();
      if (lower.startsWith("problema:") || lower.startsWith("problema :")) {
        block.problema = clean.replace(/^[^:]+:\s*/, ""); field = "problema";
      } else if (lower.startsWith("causa prov") || lower.startsWith("causa:")) {
        block.causa = clean.replace(/^[^:]+:\s*/, ""); field = "causa";
      } else if (lower.startsWith("ação recomendada") || lower.startsWith("acao recomendada") || lower.startsWith("ação:")) {
        block.acao = clean.replace(/^[^:]+:\s*/, ""); field = "acao";
      } else if (lower.startsWith("responsável") || lower.startsWith("responsavel")) {
        block.responsavel = clean.replace(/^[^:]+:\s*/, ""); field = "responsavel";
      } else if (lower.startsWith("impacto esperado") || lower.startsWith("impacto:")) {
        block.impacto = clean.replace(/^[^:]+:\s*/, ""); field = "impacto";
      } else if (!block.title && field === "title") {
        block.title = clean.replace(/^[-—]\s*/, "").trim();
      } else {
        (block as any)[field] += " " + clean;
      }
    }
    if (block.title || block.problema) {
      if (!block.title) block.title = block.problema.substring(0, 40);
      blocks.push(block);
    }
  }
  return blocks;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

function computeLegendItems(
  rows: Array<{ [key: string]: any }>,
  descriptions: string[]
): Array<{ name: string; color: string; percent: number }> {
  if (rows.length === 0) return [];
  const totals: Record<string, number> = {};
  let grand = 0;
  for (const desc of descriptions) {
    let sum = 0;
    for (const row of rows) {
      const rawKey = `raw_${desc}`;
      if (rawKey in row) sum += row[rawKey] || 0;
      else sum += ((row[desc] || 0) / 100) * (row.total || 0);
    }
    totals[desc] = sum;
    grand += sum;
  }
  return descriptions
    .map(name => ({
      name,
      color: DESC_COLORS[name] || "#6B7280",
      percent: grand > 0 ? +((totals[name] / grand) * 100).toFixed(1) : 0,
    }))
    .filter(item => item.percent > 0);
}

// ═══════════════════════════════════════════════════════════════
// MAIN GENERATOR — REBUILT FROM SCRATCH
// ═══════════════════════════════════════════════════════════════

export function generatePDFReport(data: PDFReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const margin = 14;
  const contentW = W - margin * 2; // 182mm
  const bottomMargin = 14;
  const maxY = H - bottomMargin;
  const maxChartH = 105;
  let pageNum = 0;
  let curY = 0;
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");

  const imgs = data.chartImages || {};
  const dims = data.chartDimensions || {};
  const analysis = parseAnalysis(data.aiAnalysis);

  // 70% chart / 30% legend
  const CHART_W = contentW * 0.70;
  const LEGEND_W = contentW * 0.30;

  // ─── Page management ───
  const newPage = () => {
    if (pageNum > 0) doc.addPage("a4", "portrait");
    pageNum++;
    doc.setFillColor(...C.pageBg);
    doc.rect(0, 0, W, H, "F");
  };

  const ensureSpace = (needed: number) => {
    if (curY + needed > maxY) {
      newPage();
      curY = 14;
    }
  };

  // ─── Section header (dark teal bar, white text) ───
  const sectionHeader = (title: string) => {
    ensureSpace(14);
    curY += 3;
    doc.setFillColor(...C.sectionBg);
    doc.roundedRect(margin, curY, contentW, 10, 1.5, 1.5, "F");
    doc.setFontSize(12);
    doc.setTextColor(...C.white);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin + 5, curY + 7);
    curY += 12;
  };

  // ─── Sub-header (same teal bar, smaller, for hours/days/months) ───
  const subHeader = (title: string) => {
    const clean = normalizeTitle(title);
    if (!clean) return;
    ensureSpace(11);
    curY += 2;
    doc.setFillColor(...C.sectionBg);
    doc.roundedRect(margin + 2, curY, contentW - 4, 8, 1, 1, "F");
    doc.setFontSize(10);
    doc.setTextColor(...C.white);
    doc.setFont("helvetica", "bold");
    doc.text(clean, margin + 6, curY + 5.5);
    curY += 10;
  };

  // ─── Analysis box (left teal border, light bg) ───
  const analysisBox = (text: string) => {
    const clean = stripTags(text || "");
    if (!clean) return;
    const lines = clean.split("\n").filter(l => l.trim());
    const paragraphs: string[] = [];
    for (const line of lines) {
      const c = line.trim().replace(/^[-•]\s*/, "").replace(/\*\*/g, "");
      if (c) paragraphs.push(c);
    }

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const textW = contentW - 14;

    const allLines: Array<{ text: string; gap: number }> = [];
    for (let pi = 0; pi < paragraphs.length; pi++) {
      const wrapped = doc.splitTextToSize(paragraphs[pi], textW) as string[];
      for (let li = 0; li < wrapped.length; li++) {
        allLines.push({ text: wrapped[li], gap: li === wrapped.length - 1 ? 2 : 0 });
      }
    }

    const lineH = 4.2;
    const padTop = 5;
    const padBot = 4;
    let idx = 0;
    let first = true;

    while (idx < allLines.length) {
      if (curY + 16 > maxY) { newPage(); curY = 14; }
      const startY = curY;
      let drawY = curY + (first ? padTop : 3);
      const chunk: Array<{ text: string; y: number }> = [];

      while (idx < allLines.length) {
        const need = lineH + allLines[idx].gap;
        if (drawY + need > maxY) break;
        chunk.push({ text: allLines[idx].text, y: drawY });
        drawY += need;
        idx++;
      }
      if (chunk.length === 0 && idx < allLines.length) {
        chunk.push({ text: allLines[idx].text, y: drawY });
        drawY += lineH;
        idx++;
      }

      const boxH = drawY - startY + padBot;
      doc.setFillColor(...C.analysisBg);
      doc.roundedRect(margin, startY, contentW, boxH, 1, 1, "F");
      doc.setFillColor(...C.analysisBorder);
      doc.rect(margin, startY, 2, boxH, "F");

      doc.setFontSize(9);
      for (const cl of chunk) {
        const colonIdx = cl.text.indexOf(":");
        if (colonIdx > 0 && colonIdx < 50) {
          const bold = cl.text.substring(0, colonIdx + 1);
          const rest = cl.text.substring(colonIdx + 1);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...C.sectionBg);
          doc.text(bold, margin + 6, cl.y);
          const bw = doc.getTextWidth(bold);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textDark);
          doc.text(rest, margin + 6 + bw, cl.y);
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textDark);
          doc.text(cl.text, margin + 6, cl.y);
        }
      }
      curY = startY + boxH + 1;
      first = false;
    }
  };

  // ─── Draw chart image (returns rendered height) ───
  const drawChartImage = (img: string | undefined, dimKey: string, width: number): number => {
    if (!img) return 0;
    const dim = dims[dimKey];
    let cW = width;
    let cH: number;
    if (dim && dim.width > 0) {
      const ar = dim.height / dim.width;
      cH = cW * ar;
      if (cH > maxChartH) { cH = maxChartH; cW = cH / ar; }
    } else {
      cH = width * 0.55;
    }
    try {
      doc.addImage(img, "PNG", margin, curY, cW, cH);
    } catch (e) {
      console.warn("Chart image error:", e);
      return 0;
    }
    return cH;
  };

  // ─── Draw legend (right side, readable fonts ≥12px ≈ 4.2pt) ───
  const drawLegend = (
    items: Array<{ name: string; color: string; percent: number }>,
    x: number,
    y: number,
    chartH: number
  ) => {
    if (items.length === 0) return;
    const lx = x + 4;
    const availW = LEGEND_W - 8;
    const count = items.length;

    // Compute item height to fill chart area, min 5.5mm
    const itemH = Math.max(5.5, Math.min(8, (chartH - 2) / count));
    // Font: target ~4.5pt (≈12px), min 3.8pt
    const fontSize = Math.max(3.8, Math.min(4.5, itemH * 0.65));
    const swatchSize = Math.min(3.5, itemH - 1.5);

    let ly = y + 1;
    for (const item of items) {
      if (ly + itemH > y + chartH + 1) break;

      const rgb = hexToRgb(item.color);
      const isWhite = item.color.toUpperCase() === "#FFFFFF";

      // Color swatch
      doc.setFillColor(...rgb);
      if (isWhite) {
        doc.setDrawColor(200, 200, 200);
        doc.roundedRect(lx, ly + 0.5, swatchSize, swatchSize, 0.4, 0.4, "FD");
      } else {
        doc.roundedRect(lx, ly + 0.5, swatchSize, swatchSize, 0.4, 0.4, "F");
      }

      // Percentage (right-aligned, bold)
      const pctText = `${item.percent}%`;
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.textDark);
      const pctW = doc.getTextWidth(pctText);
      const rightEdge = x + LEGEND_W - 3;
      doc.text(pctText, rightEdge - pctW, ly + swatchSize + 0.3);

      // Name (left of percentage)
      doc.setFont("helvetica", "normal");
      if (isWhite) {
        doc.setTextColor(156, 163, 175);
      } else {
        doc.setTextColor(...C.textDark);
      }
      const nameMaxW = availW - swatchSize - pctW - 8;
      let displayName = item.name;
      while (doc.getTextWidth(displayName) > nameMaxW && displayName.length > 5) {
        displayName = displayName.substring(0, displayName.length - 2) + "…";
      }
      doc.text(displayName, lx + swatchSize + 2, ly + swatchSize + 0.3);

      ly += itemH;
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // COMPOSITE RENDERERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Standard section: TITLE → CHART (70%) + LEGEND (30%) → ANALYSIS
   */
  const renderSection = (
    title: string,
    chartImg: string | undefined,
    dimKey: string,
    legendItems: Array<{ name: string; color: string; percent: number }>,
    analysisText: string | undefined
  ) => {
    const hasLegend = legendItems.length > 0;
    const chartW = hasLegend ? CHART_W : contentW;

    // Estimate chart height for page-break check
    const dim = dims[dimKey];
    let estH = chartW * 0.55;
    if (dim && dim.width > 0) {
      estH = Math.min(chartW * (dim.height / dim.width), maxChartH);
    }

    // Ensure title + chart fit on same page
    ensureSpace(14 + estH);

    // 1. TITLE
    sectionHeader(title);

    // 2. CHART + LEGEND
    const chartStartY = curY;
    const chartH = drawChartImage(chartImg, dimKey, chartW);
    if (hasLegend && chartH > 0) {
      drawLegend(legendItems, margin + chartW, chartStartY, chartH);
    }
    if (chartH > 0) curY = chartStartY + chartH + 3;

    // 3. ANALYSIS
    if (analysisText) analysisBox(analysisText);
  };

  /**
   * Section with per-item blocks (hours/days): TITLE → CHART + LEGEND → BLOCKS
   */
  const renderSectionWithBlocks = (
    title: string,
    chartImg: string | undefined,
    dimKey: string,
    legendItems: Array<{ name: string; color: string; percent: number }>,
    blocks: Array<{ label: string; content: string }>
  ) => {
    const hasLegend = legendItems.length > 0;
    const chartW = hasLegend ? CHART_W : contentW;

    const dim = dims[dimKey];
    let estH = chartW * 0.55;
    if (dim && dim.width > 0) {
      estH = Math.min(chartW * (dim.height / dim.width), maxChartH);
    }

    ensureSpace(14 + estH);

    // 1. TITLE
    sectionHeader(title);

    // 2. CHART + LEGEND
    const chartStartY = curY;
    const chartH = drawChartImage(chartImg, dimKey, chartW);
    if (hasLegend && chartH > 0) {
      drawLegend(legendItems, margin + chartW, chartStartY, chartH);
    }
    if (chartH > 0) curY = chartStartY + chartH + 3;

    // 3. BLOCKS (each with sub-header + analysis)
    for (const block of blocks) {
      if (block.label) subHeader(block.label);
      analysisBox(block.content);
      curY += 1;
    }
  };

  /**
   * Pareto section: TITLE → CHART (full width, no side legend) → ANALYSIS
   * Pareto charts show name + % on each bar, so no side legend needed.
   */
  const renderParetoSection = (
    title: string,
    chartImg: string | undefined,
    dimKey: string,
    analysisText: string | undefined
  ) => {
    renderSection(title, chartImg, dimKey, [], analysisText);
  };

  // ═══════════════════════════════════════════════════════════════
  // COMPUTE ALL LEGENDS UP FRONT
  // ═══════════════════════════════════════════════════════════════

  const legendContrato = computeLegendItems(data.byObra, CANONICAL_ORDER_FULL);
  const legendEspecialidade = computeLegendItems(data.bySpecialty, CANONICAL_ORDER);
  const legendHorario = data.byTimeHorario ? computeLegendItems(data.byTimeHorario, CANONICAL_ORDER) : [];
  const legendDiaSemana = data.byTimeDiaSemana ? computeLegendItems(data.byTimeDiaSemana, CANONICAL_ORDER) : [];
  const legendMes = data.byTimeMes ? computeLegendItems(data.byTimeMes, CANONICAL_ORDER) : [];

  const legendExternas: Array<{ name: string; color: string; percent: number }> = data.externalCausas
    .filter(c => c.percent > 0)
    .map(c => ({
      name: c.name,
      color: DESC_COLORS[c.name] || "#F97316",
      percent: c.percent,
    }));

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1 — COVER PAGE
  // ═══════════════════════════════════════════════════════════════

  newPage();
  // Dark header bar
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, W, 50, "F");

  doc.setFontSize(24);
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.text("ProdControl", margin, 20);
  doc.setFontSize(14);
  doc.text("Relatório de Produtividade", margin, 30);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Contrato: ${data.obra || "Todos os Contratos"}`, margin, 40);
  doc.text(`Período: ${data.periodo}`, margin, 46);

  doc.setFontSize(9);
  doc.setTextColor(...C.textLight);
  doc.text(`Gerado em: ${dateStr}`, W - margin, 46, { align: "right" });

  curY = 56;

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2 — KPIs
  // ═══════════════════════════════════════════════════════════════

  sectionHeader("Indicadores Principais");

  const kpis = [
    { label: "Total de Amostras", value: String(data.totalAmostras), color: C.accentBlue },
    { label: "Produtividade", value: `${data.produtivoPct}%`, color: C.accentGreen },
    { label: "Suplementar", value: `${data.suplementarPct}%`, color: C.accentAmber },
    { label: "Não Produtivo", value: `${data.naoProdutivoPct}%`, color: C.accentRed },
    { label: "NPE (Externo)", value: `${data.externoPct}%`, color: [139, 92, 246] as RGB },
  ];

  const kpiW = (contentW - 12) / 5;
  kpis.forEach((kpi, i) => {
    const x = margin + i * (kpiW + 3);
    doc.setFillColor(...C.cardBg);
    doc.setDrawColor(...C.cardBorder);
    doc.roundedRect(x, curY, kpiW, 22, 1, 1, "FD");
    doc.setFillColor(...kpi.color);
    doc.rect(x, curY, kpiW, 1.5, "F");
    doc.setFontSize(16);
    doc.setTextColor(...kpi.color);
    doc.setFont("helvetica", "bold");
    doc.text(kpi.value, x + 4, curY + 11);
    doc.setFontSize(8);
    doc.setTextColor(...C.textGray);
    doc.setFont("helvetica", "normal");
    doc.text(kpi.label, x + 4, curY + 18);
  });
  curY += 25;

  // Executive summary
  if (analysis["RESUMO"]) analysisBox(analysis["RESUMO"]);

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3 — Visão Geral por Contrato
  // ═══════════════════════════════════════════════════════════════

  renderSection(
    "Visão Geral por Contrato",
    imgs.contrato,
    "contrato",
    legendContrato,
    analysis["CONTRATO"]
  );

  // ═══════════════════════════════════════════════════════════════
  // SECTION 4 — Distribuição por Categoria (donut — legend in chart)
  // ═══════════════════════════════════════════════════════════════

  renderSection(
    "Distribuição por Categoria",
    imgs.categoria,
    "categoria",
    [], // pie/donut chart has labels embedded
    analysis["CATEGORIA"]
  );

  // ═══════════════════════════════════════════════════════════════
  // SECTION 5 — Pareto por Categorias (no side legend)
  // ═══════════════════════════════════════════════════════════════

  renderParetoSection(
    "Top Causas — Pareto por Categorias",
    imgs.paretoCategoria,
    "paretoCategoria",
    analysis["PARETO"]
  );

  // ═══════════════════════════════════════════════════════════════
  // SECTION 6 — Pareto por Especialidades (no side legend)
  // ═══════════════════════════════════════════════════════════════

  renderParetoSection(
    "Top Causas — Pareto por Especialidades",
    imgs.paretoEspecialidade,
    "paretoEspecialidade",
    analysis["PARETO_ESPECIALIDADE"]
  );

  // ═══════════════════════════════════════════════════════════════
  // SECTION 7 — Produtividade por Especialidade
  // ═══════════════════════════════════════════════════════════════

  renderSection(
    "Produtividade por Especialidade",
    imgs.especialidade,
    "especialidade",
    legendEspecialidade,
    analysis["ESPECIALIDADE"]
  );

  // ═══════════════════════════════════════════════════════════════
  // SECTION 8 — Causas Externas de Parada (NPE)
  // ═══════════════════════════════════════════════════════════════

  renderSection(
    "Causas Externas de Parada (NPE)",
    imgs.externas,
    "externas",
    legendExternas,
    analysis["EXTERNO"]
  );

  // ═══════════════════════════════════════════════════════════════
  // SECTION 9 — Produtividade por Horário (chart THEN hour blocks)
  // ═══════════════════════════════════════════════════════════════

  if (imgs.tempoHorario) {
    const hourText = analysis["HORARIO"] || "";
    const hourBlocks = parseTimedBlocks(hourText, "HORA");
    renderSectionWithBlocks(
      "Produtividade por Horário",
      imgs.tempoHorario,
      "tempoHorario",
      legendHorario,
      hourBlocks
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 10 — Produtividade por Dia da Semana
  // ═══════════════════════════════════════════════════════════════

  if (imgs.tempoDiaSemana) {
    const dayText = analysis["DIA_SEMANA"] || "";
    const dayBlocks = parseTimedBlocks(dayText, "DIA");
    renderSectionWithBlocks(
      "Produtividade por Dia da Semana",
      imgs.tempoDiaSemana,
      "tempoDiaSemana",
      legendDiaSemana,
      dayBlocks
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 11 — Produtividade por Mês
  // ═══════════════════════════════════════════════════════════════

  renderSection(
    "Produtividade por Mês",
    imgs.tempoMes,
    "tempoMes",
    legendMes,
    analysis["MES"]
  );

  // ═══════════════════════════════════════════════════════════════
  // SECTION 12 — Conclusões e Recomendações
  // ═══════════════════════════════════════════════════════════════

  const recText = analysis["RECOMENDACOES"] || analysis["GERAL"] || "";
  if (recText) {
    const recBlocks = parseRecommendations(recText);
    if (recBlocks.length > 0) {
      // Estimate first block height so header + first block stay together
      const firstFields = [
        { label: "PROBLEMA", value: recBlocks[0].problema },
        { label: "CAUSA PROVÁVEL", value: recBlocks[0].causa },
        { label: "AÇÃO RECOMENDADA", value: recBlocks[0].acao },
        { label: "RESPONSÁVEL", value: recBlocks[0].responsavel },
        { label: "IMPACTO ESPERADO", value: recBlocks[0].impacto },
      ];
      let firstH = 16;
      for (const f of firstFields) {
        if (!f.value) continue;
        const lines = doc.splitTextToSize(f.value, contentW - 16);
        firstH += 5 + lines.length * 3.5 + 2;
      }
      ensureSpace(Math.min(firstH, 80));

      sectionHeader("Conclusões e Recomendações");

      for (let bi = 0; bi < recBlocks.length; bi++) {
        const block = recBlocks[bi];
        const fields = [
          { label: "PROBLEMA", value: block.problema },
          { label: "CAUSA PROVÁVEL", value: block.causa },
          { label: "AÇÃO RECOMENDADA", value: block.acao },
          { label: "RESPONSÁVEL", value: block.responsavel },
          { label: "IMPACTO ESPERADO", value: block.impacto },
        ];

        let blockH = 14;
        for (const f of fields) {
          if (!f.value) continue;
          const lines = doc.splitTextToSize(f.value, contentW - 16);
          blockH += 5 + lines.length * 3.5 + 2;
        }
        ensureSpace(blockH + 8);

        if (bi > 0) {
          doc.setDrawColor(...C.cardBorder);
          doc.line(margin + 4, curY, margin + contentW - 4, curY);
          curY += 3;
        }

        // Problem header bar
        doc.setFillColor(...C.sectionBg);
        doc.roundedRect(margin + 2, curY, contentW - 4, 8, 1, 1, "F");
        doc.setFontSize(10);
        doc.setTextColor(...C.white);
        doc.setFont("helvetica", "bold");
        doc.text(`PROBLEMA ${bi + 1} — ${block.title}`, margin + 6, curY + 5.5);
        curY += 10;

        for (const f of fields) {
          if (!f.value) continue;
          doc.setFontSize(8.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...C.sectionBg);
          doc.text(f.label, margin + 6, curY + 4);
          curY += 5;

          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textDark);
          const wrapped = doc.splitTextToSize(f.value, contentW - 16);
          doc.text(wrapped, margin + 10, curY + 3);
          curY += wrapped.length * 3.8 + 3;
        }
        curY += 3;
      }
    } else {
      sectionHeader("Conclusões e Recomendações");
      analysisBox(recText);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FOOTER on all pages
  // ═══════════════════════════════════════════════════════════════

  const totalPages = pageNum;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...C.textLight);
    doc.setFont("helvetica", "normal");
    doc.text(`ProdControl — Página ${i} de ${totalPages}`, margin, H - 8);
    doc.text(dateStr, W - margin, H - 8, { align: "right" });
  }

  doc.save(`relatorio-produtividade_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
}
