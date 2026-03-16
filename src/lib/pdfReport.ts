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

// ── Canonical order (bottom→top of stack) ──
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

// ── Description colors (same as Dashboard) ──
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

// ── Theme colors ──
const C = {
  headerBg: [15, 23, 42] as [number, number, number],
  sectionBg: [23, 80, 97] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  pageBg: [255, 255, 255] as [number, number, number],
  textDark: [30, 30, 30] as [number, number, number],
  textGray: [100, 100, 100] as [number, number, number],
  textLight: [130, 130, 130] as [number, number, number],
  cardBg: [245, 245, 245] as [number, number, number],
  cardBorder: [220, 220, 220] as [number, number, number],
  accentBlue: [59, 130, 246] as [number, number, number],
  accentGreen: [22, 163, 74] as [number, number, number],
  accentAmber: [245, 158, 11] as [number, number, number],
  accentRed: [220, 38, 38] as [number, number, number],
  analysisBorder: [23, 80, 97] as [number, number, number],
  analysisBg: [240, 245, 247] as [number, number, number],
};

interface AnalysisSections { [key: string]: string; }

interface RecBlock {
  title: string;
  problema: string;
  causa: string;
  acao: string;
  responsavel: string;
  impacto: string;
}

function parseRecommendationBlocks(text: string): RecBlock[] {
  const blocks: RecBlock[] = [];
  const parts = text.split(/(?:^|\n)\s*(?:\*\*)?Problema\s*\d+\s*(?:[-—:]\s*)?/i).filter(p => p.trim());
  for (const part of parts) {
    const lines = part.split("\n").map(l => l.trim()).filter(Boolean);
    const block: RecBlock = { title: "", problema: "", causa: "", acao: "", responsavel: "", impacto: "" };
    let currentField = "title";
    for (const line of lines) {
      const clean = line.replace(/\*\*/g, "").replace(/^[-•]\s*/, "");
      const lower = clean.toLowerCase();
      if (lower.startsWith("problema:") || lower.startsWith("problema :")) {
        block.problema = clean.replace(/^[^:]+:\s*/, ""); currentField = "problema";
      } else if (lower.startsWith("causa prov") || lower.startsWith("causa:")) {
        block.causa = clean.replace(/^[^:]+:\s*/, ""); currentField = "causa";
      } else if (lower.startsWith("ação recomendada") || lower.startsWith("acao recomendada") || lower.startsWith("ação:")) {
        block.acao = clean.replace(/^[^:]+:\s*/, ""); currentField = "acao";
      } else if (lower.startsWith("responsável") || lower.startsWith("responsavel")) {
        block.responsavel = clean.replace(/^[^:]+:\s*/, ""); currentField = "responsavel";
      } else if (lower.startsWith("impacto esperado") || lower.startsWith("impacto:")) {
        block.impacto = clean.replace(/^[^:]+:\s*/, ""); currentField = "impacto";
      } else if (!block.title && currentField === "title") {
        block.title = clean.replace(/^[-—]\s*/, "").trim();
      } else {
        if (currentField === "problema") block.problema += " " + clean;
        else if (currentField === "causa") block.causa += " " + clean;
        else if (currentField === "acao") block.acao += " " + clean;
        else if (currentField === "responsavel") block.responsavel += " " + clean;
        else if (currentField === "impacto") block.impacto += " " + clean;
      }
    }
    if (block.title || block.problema) {
      if (!block.title) block.title = block.problema.substring(0, 40);
      blocks.push(block);
    }
  }
  return blocks;
}

function parseAnalysis(aiText: string): AnalysisSections {
  const sections: AnalysisSections = {};
  if (!aiText) return sections;
  const regex = /===\s*([A-Z_]+)\s*===\s*\n([\s\S]*?)(?=\n===\s*[A-Z_]+\s*===|$)/g;
  let m;
  while ((m = regex.exec(aiText)) !== null) sections[m[1].trim()] = m[2].trim();
  if (!Object.keys(sections).length) sections["GERAL"] = aiText;
  return sections;
}

const normalizeInternalTitle = (rawName: string): string => {
  return rawName
    .replace(/^={2,}\s*(?:DIA|HORA)\s*[:]\s*/i, "")
    .replace(/\s*={2,}\s*$/i, "")
    .replace(/^(?:Dia|Hora|HORA|DIA)\s*[-—:.\s]\s*/i, "")
    .replace(/^(?:Dia|Hora)\s+/i, "")
    .trim();
};

const stripInternalTags = (text: string): string => {
  return text
    .replace(/===\s*HORA\s*:\s*(.*?)\s*===/gi, "$1")
    .replace(/===\s*DIA\s*:\s*(.*?)\s*===/gi, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

function parseDayBlocks(text: string): Array<{ day: string; content: string }> {
  const blocks: Array<{ day: string; content: string }> = [];
  const normalized = text.replace(/\r\n/g, "\n");
  const regex = /(?:^|\n)\s*===\s*DIA\s*:\s*([^=\n]+?)\s*===\s*\n([\s\S]*?)(?=\n\s*===\s*DIA\s*:|$)/gi;
  let m;
  while ((m = regex.exec(normalized)) !== null) {
    blocks.push({ day: normalizeInternalTitle(m[1]), content: stripInternalTags(m[2]) });
  }
  if (blocks.length === 0 && normalized.trim()) {
    blocks.push({ day: "", content: stripInternalTags(normalized) });
  }
  return blocks;
}

function parseHourBlocks(text: string): Array<{ hour: string; content: string }> {
  const blocks: Array<{ hour: string; content: string }> = [];
  const normalized = text.replace(/\r\n/g, "\n");
  const regex = /(?:^|\n)\s*===\s*HORA\s*:\s*([^=\n]+?)\s*===\s*\n([\s\S]*?)(?=\n\s*===\s*HORA\s*:|$)/gi;
  let m;
  while ((m = regex.exec(normalized)) !== null) {
    blocks.push({ hour: normalizeInternalTitle(m[1]), content: stripInternalTags(m[2]) });
  }
  if (blocks.length === 0 && normalized.trim()) {
    blocks.push({ hour: "", content: stripInternalTags(normalized) });
  }
  return blocks;
}

/** Hex color to RGB array */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

/** Compute average percentages across all rows for each description */
function computeLegendData(
  rows: Array<{ [key: string]: any }>,
  descriptions: string[]
): Array<{ name: string; color: string; percent: number }> {
  if (rows.length === 0) return [];
  
  // Sum raw values across all rows to get overall percentages
  const totals: Record<string, number> = {};
  let grandTotal = 0;
  
  for (const desc of descriptions) {
    let sum = 0;
    for (const row of rows) {
      // Use raw values if available, otherwise use percentage * total to reconstruct
      const rawKey = `raw_${desc}`;
      if (rawKey in row) {
        sum += row[rawKey] || 0;
      } else {
        // Rows have percentage values and total
        sum += ((row[desc] || 0) / 100) * (row.total || 0);
      }
    }
    totals[desc] = sum;
    grandTotal += sum;
  }
  
  return descriptions
    .map(name => ({
      name,
      color: DESC_COLORS[name] || "#6B7280",
      percent: grandTotal > 0 ? +((totals[name] / grandTotal) * 100).toFixed(1) : 0,
    }))
    .filter(item => item.percent > 0);
}

// ═══════════════════════════════════════
// Main PDF Generator
// ═══════════════════════════════════════
export function generatePDFReport(data: PDFReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const margin = 20;
  const contentW = W - margin * 2; // 170mm
  const maxChartH = 100;
  let pageNum = 0;
  let curY = 0;
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");

  const images = data.chartImages || {};
  const dims = data.chartDimensions || {};
  const analysis = parseAnalysis(data.aiAnalysis);

  // ── Layout helpers ──
  const addNewPage = () => {
    if (pageNum > 0) doc.addPage("a4", "portrait");
    pageNum++;
    doc.setFillColor(...C.pageBg);
    doc.rect(0, 0, W, H, "F");
  };

  const ensureSpace = (needed: number) => {
    if (curY + needed > H - 15) {
      addNewPage();
      curY = 14;
    }
  };

  const drawSectionHeader = (title: string) => {
    ensureSpace(14);
    curY += 4;
    doc.setFillColor(...C.sectionBg);
    doc.roundedRect(margin, curY, contentW, 10, 1, 1, "F");
    doc.setFontSize(12);
    doc.setTextColor(...C.white);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin + 4, curY + 7);
    curY += 12;
  };

  const drawSubHeader = (title: string) => {
    const cleanName = normalizeInternalTitle(title);
    ensureSpace(14);
    curY += 3;
    doc.setFillColor(...C.sectionBg);
    doc.roundedRect(margin + 2, curY, contentW - 4, 8, 1, 1, "F");
    doc.setFontSize(10);
    doc.setTextColor(...C.white);
    doc.setFont("helvetica", "bold");
    doc.text(cleanName, margin + 6, curY + 5.5);
    curY += 10;
  };

  const drawAnalysisBox = (text: string) => {
    const sanitizedText = stripInternalTags(text || "");
    if (!sanitizedText) return;
    const lines = sanitizedText.split("\n").filter(l => l.trim());
    const paragraphs: string[] = [];
    for (const line of lines) {
      const cleaned = line.trim().replace(/^[-•]\s*/, "").replace(/\*\*/g, "");
      if (cleaned) paragraphs.push(cleaned);
    }

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    const maxTextW = contentW - 12;
    const wrappedParagraphs: string[][] = [];
    for (const p of paragraphs) {
      wrappedParagraphs.push(doc.splitTextToSize(p, maxTextW));
    }

    const lineH = 4;
    const paraGap = 2;
    const boxPadTop = 5;
    const boxPadBot = 3;
    let isFirstChunk = true;

    const allLines: Array<{ text: string; gapAfter: number }> = [];
    for (let pi = 0; pi < wrappedParagraphs.length; pi++) {
      const wp = wrappedParagraphs[pi];
      for (let li = 0; li < wp.length; li++) {
        allLines.push({ text: wp[li], gapAfter: li === wp.length - 1 ? paraGap : 0 });
      }
    }

    let lineIdx = 0;
    while (lineIdx < allLines.length) {
      const availH = H - 15 - curY;
      if (availH < 16) {
        addNewPage();
        curY = 14;
      }

      const chunkStartY = curY;
      let chunkY = curY + (isFirstChunk ? boxPadTop : 3);
      const chunkLines: Array<{ text: string; y: number }> = [];

      while (lineIdx < allLines.length) {
        const needed = lineH + allLines[lineIdx].gapAfter;
        if (chunkY + needed > H - 15) break;
        chunkLines.push({ text: allLines[lineIdx].text, y: chunkY });
        chunkY += needed;
        lineIdx++;
      }

      if (chunkLines.length === 0) {
        chunkLines.push({ text: allLines[lineIdx].text, y: chunkY });
        chunkY += lineH + allLines[lineIdx].gapAfter;
        lineIdx++;
      }

      const chunkH = chunkY - chunkStartY + boxPadBot;

      doc.setFillColor(...C.analysisBg);
      doc.roundedRect(margin, chunkStartY, contentW, chunkH, 1, 1, "F");
      doc.setFillColor(...C.analysisBorder);
      doc.rect(margin, chunkStartY, 2, chunkH, "F");

      doc.setFontSize(8.5);
      for (const cl of chunkLines) {
        const colonIdx = cl.text.indexOf(":");
        if (colonIdx > 0 && colonIdx < 60) {
          const boldPart = cl.text.substring(0, colonIdx + 1);
          const normalPart = cl.text.substring(colonIdx + 1);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...C.sectionBg);
          doc.text(boldPart, margin + 6, cl.y);
          const boldW = doc.getTextWidth(boldPart);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textDark);
          doc.text(normalPart, margin + 6 + boldW, cl.y);
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textDark);
          doc.text(cl.text, margin + 6, cl.y);
        }
      }

      curY = chunkStartY + chunkH + 2;
      isFirstChunk = false;
    }
  };

  /** Draw chart image preserving aspect ratio */
  const drawChart = (chartImage: string | undefined, dimKey: string, legendW: number = 0): { chartW: number; chartH: number } => {
    if (!chartImage) return { chartW: 0, chartH: 0 };
    const dim = dims[dimKey];
    const availableW = contentW - legendW;
    let chartW = availableW;
    let chartH: number;

    if (dim && dim.width > 0) {
      const aspectRatio = dim.height / dim.width;
      chartH = chartW * aspectRatio;
      if (chartH > maxChartH) {
        chartH = maxChartH;
        chartW = chartH / aspectRatio;
      }
    } else {
      chartH = availableW * 0.55;
    }

    try {
      const xOffset = margin;
      doc.addImage(chartImage, "PNG", xOffset, curY, chartW, chartH);
    } catch (e) {
      console.warn("Failed to add chart image:", e);
    }
    return { chartW, chartH };
  };

  /** Draw legend next to chart — readable size */
  const drawLegend = (
    legendItems: Array<{ name: string; color: string; percent: number }>,
    chartX: number,
    chartY: number,
    chartH: number,
    legendW: number
  ) => {
    if (legendItems.length === 0) return;
    const x = chartX + 3;
    const maxItems = legendItems.length;
    const itemH = Math.min(5.5, Math.max(3.5, (chartH - 6) / maxItems));
    const fontSize = Math.min(7.5, Math.max(5.5, itemH * 0.8));
    let y = chartY + 2;

    for (const item of legendItems) {
      // Color swatch
      const rgb = hexToRgb(item.color);
      const isWhite = item.color.toUpperCase() === "#FFFFFF";
      const swatchH = Math.min(3.5, itemH - 1);
      const swatchW = 4;
      
      doc.setFillColor(...rgb);
      if (isWhite) {
        doc.setDrawColor(200, 200, 200);
        doc.roundedRect(x, y, swatchW, swatchH, 0.4, 0.4, "FD");
      } else {
        doc.roundedRect(x, y, swatchW, swatchH, 0.4, 0.4, "F");
      }

      // Percentage right-aligned first to know space
      const pctText = `${item.percent}%`;
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.textDark);
      const pctW = doc.getTextWidth(pctText);
      doc.text(pctText, chartX + legendW - pctW - 1, y + swatchH - 0.3);

      // Name text
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.textDark);
      const maxNameW = legendW - swatchW - pctW - 10;
      let displayText = item.name;
      while (doc.getTextWidth(displayText) > maxNameW && displayText.length > 8) {
        displayText = displayText.substring(0, displayText.length - 2) + "…";
      }
      doc.text(displayText, x + swatchW + 1.5, y + swatchH - 0.3);

      y += itemH;
    }
  };

  /** Main chart section: Title → Chart+Legend → Analysis */
  const drawChartWithLegend = (
    title: string,
    chartImage: string | undefined,
    analysisText: string | undefined,
    dimKey: string,
    legendItems: Array<{ name: string; color: string; percent: number }>
  ) => {
    // Estimate chart height
    const dim = dims[dimKey];
    const hasLegend = legendItems.length > 0;
    const legendW = hasLegend ? 70 : 0;
    const chartAvailW = contentW - legendW;
    let estChartH = chartAvailW * 0.55;
    if (dim && dim.width > 0) {
      const ar = dim.height / dim.width;
      estChartH = Math.min(chartAvailW * ar, maxChartH);
    }
    
    const totalNeeded = 12 + estChartH + 4;
    if (curY + totalNeeded > H - 15) {
      addNewPage();
      curY = 14;
    }

    drawSectionHeader(title);

    // Chart + Legend side by side
    const chartStartY = curY;
    const { chartW, chartH } = drawChart(chartImage, dimKey, legendW);

    if (hasLegend && chartH > 0) {
      drawLegend(legendItems, margin + chartW, chartStartY, chartH, legendW);
    }

    if (chartH > 0) {
      curY = chartStartY + chartH + 4;
    }

    // Analysis after chart
    if (analysisText) drawAnalysisBox(analysisText);
  };

  /** Chart section with individual sub-blocks (hours/days) */
  const drawChartWithBlocks = (
    title: string,
    chartImage: string | undefined,
    dimKey: string,
    legendItems: Array<{ name: string; color: string; percent: number }>,
    blocks: Array<{ label: string; content: string }>
  ) => {
    const dim = dims[dimKey];
    const hasLegend = legendItems.length > 0;
    const legendW = hasLegend ? 70 : 0;
    const chartAvailW = contentW - legendW;
    let estChartH = chartAvailW * 0.55;
    if (dim && dim.width > 0) {
      const ar = dim.height / dim.width;
      estChartH = Math.min(chartAvailW * ar, maxChartH);
    }

    const totalNeeded = 12 + estChartH + 4;
    if (curY + totalNeeded > H - 15) {
      addNewPage();
      curY = 14;
    }

    drawSectionHeader(title);

    const chartStartY = curY;
    const { chartW, chartH } = drawChart(chartImage, dimKey, legendW);

    if (hasLegend && chartH > 0) {
      drawLegend(legendItems, margin + chartW, chartStartY, chartH, legendW);
    }

    if (chartH > 0) {
      curY = chartStartY + chartH + 4;
    }

    // Individual blocks AFTER chart
    for (const block of blocks) {
      if (block.label) drawSubHeader(block.label);
      drawAnalysisBox(block.content);
      curY += 2;
    }
  };

  // ═══════════════════════════════════════
  // 1. Header
  // ═══════════════════════════════════════
  addNewPage();
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, W, 32, "F");
  doc.setFontSize(22);
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.text("ProdControl — Relatório de Produtividade", margin, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Contrato: ${data.obra || "Todos os Contratos"} | Período: ${data.periodo}`, margin, 22);
  doc.setFontSize(8);
  doc.text(`Gerado em: ${dateStr}`, margin, 28);
  curY = 38;

  // ═══════════════════════════════════════
  // 2. KPIs
  // ═══════════════════════════════════════
  drawSectionHeader("Indicadores Principais");

  const kpis = [
    { label: "Total de Amostras", value: String(data.totalAmostras), color: C.accentBlue },
    { label: "Produtividade", value: `${data.produtivoPct}%`, color: C.accentGreen },
    { label: "Suplementar", value: `${data.suplementarPct}%`, color: C.accentAmber },
    { label: "Não Produtivo", value: `${data.naoProdutivoPct}%`, color: C.accentRed },
    { label: "NPE (Externo)", value: `${data.externoPct}%`, color: [139, 92, 246] as [number, number, number] },
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
  curY += 26;

  if (analysis["RESUMO"]) drawAnalysisBox(analysis["RESUMO"]);

  // ═══════════════════════════════════════
  // Compute legend data for each chart type
  // ═══════════════════════════════════════
  const legendContrato = computeLegendData(data.byObra, CANONICAL_ORDER_FULL);
  const legendEspecialidade = computeLegendData(data.bySpecialty, CANONICAL_ORDER);
  const legendHorario = data.byTimeHorario ? computeLegendData(data.byTimeHorario, CANONICAL_ORDER) : [];
  const legendDiaSemana = data.byTimeDiaSemana ? computeLegendData(data.byTimeDiaSemana, CANONICAL_ORDER) : [];
  const legendMes = data.byTimeMes ? computeLegendData(data.byTimeMes, CANONICAL_ORDER) : [];

  // Pareto legend: each category with its color and percent
  const legendPareto: Array<{ name: string; color: string; percent: number }> = data.nonprodCausas
    .filter(c => c.percent > 0)
    .map(c => ({
      name: c.name,
      color: DESC_COLORS[c.name] || "#6B7280",
      percent: c.percent,
    }));

  // NPE legend: each external cause with its color and percent
  const legendExternas: Array<{ name: string; color: string; percent: number }> = data.externalCausas
    .filter(c => c.percent > 0)
    .map(c => ({
      name: c.name,
      color: DESC_COLORS[c.name] || "#F97316",
      percent: c.percent,
    }));

  // ═══════════════════════════════════════
  // 3. Visão Geral por Contrato
  // ═══════════════════════════════════════
  drawChartWithLegend(
    "Visão Geral por Contrato",
    images.contrato,
    analysis["CONTRATO"],
    "contrato",
    legendContrato
  );

  // ═══════════════════════════════════════
  // 4. Distribuição por Categoria
  // ═══════════════════════════════════════
  drawChartWithLegend(
    "Distribuição por Categoria",
    images.categoria,
    analysis["CATEGORIA"],
    "categoria",
    [] // Pie chart — legend embedded in chart image
  );

  // ═══════════════════════════════════════
  // 5. Top Causas — Pareto por Categorias
  // ═══════════════════════════════════════
  drawChartWithLegend(
    "Top Causas — Pareto por Categorias",
    images.paretoCategoria,
    analysis["PARETO"],
    "paretoCategoria",
    legendPareto
  );

  // ═══════════════════════════════════════
  // 6. Top Causas — Pareto por Especialidades
  // ═══════════════════════════════════════
  drawChartWithLegend(
    "Top Causas — Pareto por Especialidades",
    images.paretoEspecialidade,
    analysis["PARETO_ESPECIALIDADE"],
    "paretoEspecialidade",
    []
  );

  // ═══════════════════════════════════════
  // 7. Produtividade por Especialidade
  // ═══════════════════════════════════════
  drawChartWithLegend(
    "Produtividade por Especialidade",
    images.especialidade,
    analysis["ESPECIALIDADE"],
    "especialidade",
    legendEspecialidade
  );

  // ═══════════════════════════════════════
  // 8. Causas Externas de Parada (NPE)
  // ═══════════════════════════════════════
  drawChartWithLegend(
    "Causas Externas de Parada (NPE)",
    images.externas,
    analysis["EXTERNO"],
    "externas",
    legendExternas
  );

  // ═══════════════════════════════════════
  // 9. Produtividade por Horário
  // ═══════════════════════════════════════
  if (images.tempoHorario) {
    const hourText = analysis["HORARIO"] || "";
    const hourBlocks = parseHourBlocks(hourText);
    drawChartWithBlocks(
      "Produtividade por Horário",
      images.tempoHorario,
      "tempoHorario",
      legendHorario,
      hourBlocks.map(b => ({ label: b.hour, content: b.content }))
    );
  }

  // ═══════════════════════════════════════
  // 10. Produtividade por Dia da Semana
  // ═══════════════════════════════════════
  if (images.tempoDiaSemana) {
    const dayText = analysis["DIA_SEMANA"] || "";
    const dayBlocks = parseDayBlocks(dayText);
    drawChartWithBlocks(
      "Produtividade por Dia da Semana",
      images.tempoDiaSemana,
      "tempoDiaSemana",
      legendDiaSemana,
      dayBlocks.map(b => ({ label: b.day, content: b.content }))
    );
  }

  // ═══════════════════════════════════════
  // 11. Produtividade por Mês
  // ═══════════════════════════════════════
  drawChartWithLegend(
    "Produtividade por Mês",
    images.tempoMes,
    analysis["MES"],
    "tempoMes",
    legendMes
  );

  // ═══════════════════════════════════════
  // 12. Conclusões e Recomendações
  // ═══════════════════════════════════════
  const recText = analysis["RECOMENDACOES"] || analysis["GERAL"] || "";
  if (recText) {
    const recBlocks = parseRecommendationBlocks(recText);
    if (recBlocks.length > 0) {
      // Estimate first block height to keep title + first block together
      const firstBlock = recBlocks[0];
      const firstFields = [
        { label: `PROBLEMA 1 — ${firstBlock.title}`, value: firstBlock.problema },
        { label: "CAUSA PROVÁVEL", value: firstBlock.causa },
        { label: "AÇÃO RECOMENDADA", value: firstBlock.acao },
        { label: "RESPONSÁVEL", value: firstBlock.responsavel },
        { label: "IMPACTO ESPERADO", value: firstBlock.impacto },
      ];
      let firstBlockH = 16;
      for (const f of firstFields) {
        if (!f.value) continue;
        const lines = doc.splitTextToSize(f.value, contentW - 16);
        firstBlockH += 5 + lines.length * 3.5 + 2;
      }
      const minNeeded = Math.min(firstBlockH, 80);
      ensureSpace(minNeeded);

      drawSectionHeader("Conclusões e Recomendações");

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
          curY += 4;
        }

        doc.setFillColor(...C.sectionBg);
        doc.roundedRect(margin + 2, curY, contentW - 4, 8, 1, 1, "F");
        doc.setFontSize(10);
        doc.setTextColor(...C.white);
        doc.setFont("helvetica", "bold");
        doc.text(`PROBLEMA ${bi + 1} — ${block.title}`, margin + 6, curY + 5.5);
        curY += 10;

        for (const f of fields) {
          if (!f.value) continue;
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...C.sectionBg);
          doc.text(f.label, margin + 6, curY + 4);
          curY += 5;

          doc.setFontSize(8.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textDark);
          const wrapped = doc.splitTextToSize(f.value, contentW - 16);
          doc.text(wrapped, margin + 10, curY + 3);
          curY += wrapped.length * 3.5 + 3;
        }
        curY += 4;
      }
    } else {
      drawSectionHeader("Conclusões e Recomendações");
      drawAnalysisBox(recText);
    }
  }

  // ═══════════════════════════════════════
  // Footer on all pages
  // ═══════════════════════════════════════
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
