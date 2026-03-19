import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { PDF_OCEAN_RGB, buildStyledPdfLines, countStyledPdfLines } from "./pdfTextFormatting";

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
  onProgress?: (step: string) => void;
}

type RGB = [number, number, number];
type TimedBlock = { label: string; content: string };
type AnalysisSections = Record<string, string>;
type RecommendationBlock = { title: string; problema: string; causa: string; acao: string; responsavel: string; impacto: string };

const STACK_ORDER_FULL = [
  "Trabalhando", "Planejando", "Aguardando Ferramenta ou Material",
  "Transitando no local de trabalho - com ferramenta",
  "Transitando no local de trabalho - sem ferramenta",
  "Transitando fora do local de trabalho - com ferramenta",
  "Transitando fora do local de trabalho - sem ferramenta",
  "Assistindo / Stand By", "Aguardando Liberação de PT",
  "Pessoal", "Ocioso",
  "Interferências Operacionais", "Fatores Climáticos e Consequências",
] as const;

const HOUR_ORDER = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"] as const;
const WEEKDAY_ORDER = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"] as const;
const MONTH_ORDER = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;

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
const ANALYSIS_LINE_H = 4.5;

function toPercent(value: number): number { return Number((value || 0).toFixed(1)); }
function fmtPct(value: number): string { return `${toPercent(value).toFixed(1)}%`; }

function normalizeTitle(raw: string): string {
  return raw.replace(/^={2,}\s*(?:DIA|HORA|MES)\s*:\s*/i, "").replace(/^\*\*/g, "").replace(/\*\*$/g, "").replace(/^Dia\s*[:\-]\s*/i, "").replace(/^Hora\s*[:\-]\s*/i, "").replace(/^M[eê]s\s*[:\-]\s*/i, "").trim();
}

function stripTags(text: string): string {
  return text
    .replace(/===\s*([A-Z_]+)\s*:?\s*([^=\n]*)===/gi, (_, marker, value) => {
      const clean = String(value || "").trim();
      return clean ? `\n${marker}: ${clean}\n` : "\n";
    })
    .replace(/\*\*/g, "").replace(/<[^>]+>/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "").replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "").replace(/[\u{200D}]/gu, "")
    .replace(/Ø=Ý4/g, "Crítico").replace(/[&]\s*þ/g, "Acima do ideal")
    .replace(/:([A-ZÀ-Úa-zà-ú])/g, ": $1").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeBlockText(text: string): string { return text.replace(/\r\n/g, "\n").trim(); }

function getFirstMatchIndex(text: string, patterns: RegExp[]): number {
  const indexes = patterns.map((p) => text.search(p)).filter((i) => i >= 0);
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
  const markers = [...normalized.matchAll(topLevelRegex)].map((m) => ({ key: m[1].trim().toUpperCase(), start: m.index ?? 0, contentStart: (m.index ?? 0) + m[0].length }));

  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i];
    const next = markers[i + 1];
    sections[cur.key] = normalized.slice(cur.contentStart, next?.start ?? normalized.length).trim();
  }

  if (!sections.HORARIO) sections.HORARIO = extractInferredSection(normalized, /(?:^|\n)\s*===\s*HORA\s*:/i, [/(?:^|\n)\s*===\s*DIA_SEMANA\s*===/i, /(?:^|\n)\s*===\s*DIA\s*:/i, /(?:^|\n)\s*===\s*MES\s*===/i, /(?:^|\n)\s*===\s*MES\s*:/i, /(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i]);
  if (!sections.DIA_SEMANA) sections.DIA_SEMANA = extractInferredSection(normalized, /(?:^|\n)\s*===\s*DIA\s*:/i, [/(?:^|\n)\s*===\s*MES\s*===/i, /(?:^|\n)\s*===\s*MES\s*:/i, /(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i]);
  if (!sections.MES) sections.MES = extractInferredSection(normalized, /(?:^|\n)\s*===\s*MES\s*:/i, [/(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i]);

  sections.EXTERNO = trimAtNestedMarker(sections.EXTERNO || "", [/(?:^|\n)\s*===\s*HORA\s*:/i, /(?:^|\n)\s*===\s*DIA\s*:/i, /(?:^|\n)\s*===\s*MES\s*:/i, /(?:^|\n)\s*===\s*HORARIO\s*===/i, /(?:^|\n)\s*===\s*DIA_SEMANA\s*===/i, /(?:^|\n)\s*===\s*MES\s*===/i]);
  sections.HORARIO = trimAtNestedMarker(sections.HORARIO || "", [/(?:^|\n)\s*===\s*DIA\s*:/i, /(?:^|\n)\s*===\s*DIA_SEMANA\s*===/i, /(?:^|\n)\s*===\s*MES\s*:/i, /(?:^|\n)\s*===\s*MES\s*===/i, /(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i]);
  sections.DIA_SEMANA = trimAtNestedMarker(sections.DIA_SEMANA || "", [/(?:^|\n)\s*===\s*MES\s*:/i, /(?:^|\n)\s*===\s*MES\s*===/i, /(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i]);
  sections.MES = trimAtNestedMarker(sections.MES || "", [/(?:^|\n)\s*===\s*RECOMENDACOES\s*===/i]);

  if (!Object.keys(sections).some((k) => sections[k]?.trim())) sections.GERAL = normalized;
  return sections;
}

function parseTimedBlocks(text: string, marker: "HORA" | "DIA" | "MES"): TimedBlock[] {
  const normalized = normalizeBlockText(text);
  if (!normalized) return [];
  const blocks: TimedBlock[] = [];
  const strictRegex = new RegExp(`(?:^|\\n)\\s*===\\s*${marker}\\s*:\\s*([^=\\n]+?)\\s*===\\s*\\n([\\s\\S]*?)(?=\\n\\s*===\\s*${marker}\\s*:|$)`, "gi");
  let match: RegExpExecArray | null;
  while ((match = strictRegex.exec(normalized)) !== null) blocks.push({ label: normalizeTitle(match[1]), content: stripTags(match[2]) });
  if (!blocks.length && marker === "HORA") {
    const fb = /(?:^|\n)\s*(\d{1,2}:\d{2})\s*\n([\s\S]*?)(?=\n\s*\d{1,2}:\d{2}\s*\n|$)/g;
    while ((match = fb.exec(normalized)) !== null) blocks.push({ label: normalizeTitle(match[1]), content: stripTags(match[2]) });
  }
  if (!blocks.length && marker === "DIA") {
    const dayPattern = WEEKDAY_ORDER.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const fb = new RegExp(`(?:^|\\n)\\s*(${dayPattern})\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:${dayPattern})\\s*\\n|$)`, "gi");
    while ((match = fb.exec(normalized)) !== null) blocks.push({ label: normalizeTitle(match[1]), content: stripTags(match[2]) });
  }
  if (!blocks.length && marker === "MES") {
    const monthPattern = MONTH_ORDER.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const fb = new RegExp(`(?:^|\\n)\\s*(${monthPattern})\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:${monthPattern})\\s*\\n|$)`, "gi");
    while ((match = fb.exec(normalized)) !== null) blocks.push({ label: normalizeTitle(match[1]), content: stripTags(match[2]) });
  }
  return blocks.length ? blocks : [{ label: "", content: stripTags(normalized) }];
}

function sortBlocks(blocks: TimedBlock[], order: readonly string[]): TimedBlock[] {
  const orderMap = new Map(order.map((item, i) => [item, i]));
  return [...blocks].sort((a, b) => (orderMap.get(a.label) ?? 9999) - (orderMap.get(b.label) ?? 9999));
}

function parseRecommendations(text: string): RecommendationBlock[] {
  const clean = stripTags(text);
  if (!clean) return [];
  const parts = clean.split(/(?:^|\n)\s*(?:PROBLEMA\s+\d+|Problema\s+\d+)\s*[:\-—]?\s*/).map((p) => p.trim()).filter(Boolean);
  return parts.map((part) => {
    const block: RecommendationBlock = { title: "", problema: "", causa: "", acao: "", responsavel: "", impacto: "" };
    const lines = part.split("\n").map((l) => l.trim()).filter(Boolean);
    let activeField: keyof RecommendationBlock = "title";
    for (const rawLine of lines) {
      const line = rawLine.replace(/^[-•]\s*/, "");
      const lower = line.toLowerCase();
      if (lower.startsWith("problema:")) { block.problema = line.replace(/^[^:]+:\s*/, ""); activeField = "problema"; }
      else if (lower.startsWith("causa provável:") || lower.startsWith("causa provavel:") || lower.startsWith("causa:")) { block.causa = line.replace(/^[^:]+:\s*/, ""); activeField = "causa"; }
      else if (lower.startsWith("ação recomendada:") || lower.startsWith("acao recomendada:") || lower.startsWith("ação:") || lower.startsWith("acao:")) { block.acao = line.replace(/^[^:]+:\s*/, ""); activeField = "acao"; }
      else if (lower.startsWith("responsável:") || lower.startsWith("responsavel:")) { block.responsavel = line.replace(/^[^:]+:\s*/, ""); activeField = "responsavel"; }
      else if (lower.startsWith("impacto esperado:") || lower.startsWith("impacto:")) { block.impacto = line.replace(/^[^:]+:\s*/, ""); activeField = "impacto"; }
      else if (!block.title) block.title = line;
      else block[activeField] = [block[activeField], line].filter(Boolean).join(" ").trim();
    }
    if (!block.title) block.title = block.problema || "Problema crítico";
    return block;
  });
}

// ══════════════════════════════════════════════════════════
// ██  PDF — TEXT + DATA TABLES ONLY (no charts, no canvas) ██
// ══════════════════════════════════════════════════════════

export async function generatePDFReport(data: PDFReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const analysis = parseAnalysis(data.aiAnalysis);
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");
  const recommendations = parseRecommendations(analysis.RECOMENDACOES || analysis.GERAL || "");
  const progress = data.onProgress || (() => {});
  const hourBlocks = sortBlocks(parseTimedBlocks(analysis.HORARIO || "", "HORA"), [...HOUR_ORDER]);
  const weekdayBlocks = sortBlocks(parseTimedBlocks(analysis.DIA_SEMANA || "", "DIA"), [...WEEKDAY_ORDER]);
  const monthBlocks = sortBlocks(parseTimedBlocks(analysis.MES || "", "MES"), [...MONTH_ORDER]);

  let curY = MARGIN;

  const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

  const newPage = () => {
    doc.addPage("a4", "portrait");
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

  // ── Data table helper using jspdf-autotable ──
  const drawDataTable = (head: string[][], body: string[][], startY: number): number => {
    autoTable(doc, {
      head,
      body,
      startY,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 8, cellPadding: 2, textColor: C.textDark as any, lineColor: C.border as any, lineWidth: 0.2 },
      headStyles: { fillColor: C.sectionBg as any, textColor: C.white as any, fontStyle: "bold", fontSize: 8.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      theme: "grid",
    });
    return (doc as any).lastAutoTable?.finalY || startY + 20;
  };

  // Helper: build percentage rows for stacked data
  const buildStackedRows = (rows: Array<{ [key: string]: any }>, labelKey: string): { head: string[][]; body: string[][] } => {
    // Show only descriptions that have data
    const activeDescs = STACK_ORDER_FULL.filter((desc) =>
      rows.some((r) => (r[desc] || 0) > 0)
    );
    const head = [[labelKey, ...activeDescs.map((d) => d.length > 20 ? d.substring(0, 18) + "…" : d)]];
    const body = rows.map((r) => [
      r[labelKey] || r.name || r.time || "",
      ...activeDescs.map((desc) => {
        const val = r[desc] || 0;
        return val > 0 ? `${val}%` : "-";
      }),
    ]);
    return { head, body };
  };

  const buildRecommendationText = (item: RecommendationBlock, index: number) => {
    return [
      item.title ? `Problema crítico ${index + 1}: ${item.title}` : "",
      item.problema ? `1. Diagnóstico: ${item.problema}` : "",
      item.causa ? `2. Interpretação operacional: ${item.causa}` : "",
      item.acao ? `3. Ação recomendada: ${item.acao}` : "",
      item.responsavel ? `4. Responsável: ${item.responsavel}` : "",
      item.impacto ? `5. Impacto esperado: ${item.impacto}` : "",
    ].filter(Boolean).join("\n");
  };

  // ══════════════════════════════════════════════════════════
  // ██  PDF CONSTRUCTION — Text + Tables only               ██
  // ══════════════════════════════════════════════════════════

  progress("Gerando dados...");
  await yieldToMain();

  // ── Cover ──
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

  // ── KPIs ──
  progress("Montando indicadores...");
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
    const kx = MARGIN + index * (kpiWidth + kpiGap);
    doc.setFillColor(...C.cardBg);
    doc.setDrawColor(...C.border);
    doc.roundedRect(kx, curY, kpiWidth, 22, 1.2, 1.2, "FD");
    doc.setFillColor(...kpi.color);
    doc.rect(kx, curY, kpiWidth, 1.5, "F");
    doc.setTextColor(...kpi.color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(kpi.value, kx + 3.5, curY + 10.5);
    doc.setTextColor(...C.textMuted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.text(kpi.label, kx + 3.5, curY + 17.5);
  });
  curY += 25;
  drawAnalysisBox(analysis.RESUMO || analysis.GERAL || "Diagnóstico geral indisponível para este período.");

  // ── Section: Visão Geral por Contrato ──
  progress("Montando tabelas...");
  await yieldToMain();

  if (data.byObra.length > 0) {
    ensureSpace(30);
    sectionHeader("Visão Geral por Contrato");
    const { head, body } = buildStackedRows(data.byObra, "Contrato");
    curY = drawDataTable(head, body, curY);
    curY += 2;
    if (analysis.CONTRATO?.trim()) drawAnalysisBox(analysis.CONTRATO);
  }

  await yieldToMain();

  // ── Section: Distribuição por Categoria ──
  if (data.categoryTotals.length > 0) {
    ensureSpace(30);
    sectionHeader("Distribuição por Categoria");
    const totalCat = data.categoryTotals.reduce((s, c) => s + c.value, 0);
    const catHead = [["Categoria", "Quantidade", "%"]];
    const catBody = data.categoryTotals.map((c) => [
      c.name,
      `${c.value}`,
      totalCat > 0 ? `${((c.value / totalCat) * 100).toFixed(1)}%` : "0%",
    ]);
    curY = drawDataTable(catHead, catBody, curY);
    curY += 2;
    if (analysis.CATEGORIA?.trim()) drawAnalysisBox(analysis.CATEGORIA);
  }

  await yieldToMain();

  // ── Section: Pareto ──
  if (data.nonprodCausas.length > 0) {
    ensureSpace(30);
    sectionHeader("Top Causas — Pareto");
    const paretoSorted = [...data.nonprodCausas].sort((a, b) => b.value - a.value).slice(0, 10);
    let cumPercent = 0;
    const paretoHead = [["Causa", "Qtd", "%", "% Acumulado"]];
    const paretoBody = paretoSorted.map((c) => {
      cumPercent += c.percent;
      return [c.name, `${c.value}`, `${c.percent.toFixed(1)}%`, `${cumPercent.toFixed(1)}%`];
    });
    curY = drawDataTable(paretoHead, paretoBody, curY);
    curY += 2;
    if (analysis.PARETO?.trim()) drawAnalysisBox(analysis.PARETO);
  }

  await yieldToMain();

  // ── Section: Especialidade ──
  if (data.bySpecialty.length > 0) {
    ensureSpace(30);
    sectionHeader("Produtividade por Especialidade");
    const { head, body } = buildStackedRows(data.bySpecialty, "Especialidade");
    curY = drawDataTable(head, body, curY);
    curY += 2;
    if (analysis.ESPECIALIDADE?.trim()) drawAnalysisBox(analysis.ESPECIALIDADE);
  }

  await yieldToMain();

  // ── Section: Causas Externas ──
  if (data.externalCausas.length > 0) {
    ensureSpace(30);
    sectionHeader("Causas Externas de Parada (NPE)");
    const extHead = [["Causa", "Quantidade", "%"]];
    const extBody = data.externalCausas.map((c) => [c.name, `${c.value}`, `${c.percent.toFixed(1)}%`]);
    curY = drawDataTable(extHead, extBody, curY);
    curY += 2;
    if (analysis.EXTERNO?.trim()) drawAnalysisBox(analysis.EXTERNO);
  }

  await yieldToMain();

  // ── Section: Por Horário ──
  if (data.byTimeHorario && data.byTimeHorario.length > 0) {
    ensureSpace(30);
    sectionHeader("Produtividade por Horário");
    const { head, body } = buildStackedRows(data.byTimeHorario, "Horário");
    curY = drawDataTable(head, body, curY);
    curY += 2;
    for (const block of hourBlocks) {
      if (block.label) subHeader(block.label);
      if (block.content?.trim()) drawAnalysisBox(block.content);
    }
  }

  await yieldToMain();

  // ── Section: Por Dia da Semana ──
  if (data.byTimeDiaSemana && data.byTimeDiaSemana.length > 0) {
    ensureSpace(30);
    sectionHeader("Produtividade por Dia da Semana");
    const { head, body } = buildStackedRows(data.byTimeDiaSemana, "Dia");
    curY = drawDataTable(head, body, curY);
    curY += 2;
    for (const block of weekdayBlocks) {
      if (block.label) subHeader(block.label);
      if (block.content?.trim()) drawAnalysisBox(block.content);
    }
  }

  await yieldToMain();

  // ── Section: Por Mês ──
  if (data.byTimeMes && data.byTimeMes.length > 0) {
    ensureSpace(30);
    sectionHeader("Produtividade por Mês");
    const { head, body } = buildStackedRows(data.byTimeMes, "Mês");
    curY = drawDataTable(head, body, curY);
    curY += 2;
    for (const block of monthBlocks) {
      if (block.label) subHeader(block.label);
      if (block.content?.trim()) drawAnalysisBox(block.content);
    }
  }

  // ── Recommendations ──
  progress("Finalizando PDF...");
  await yieldToMain();
  sectionHeader("Conclusões e Recomendações");
  if (recommendations.length) {
    recommendations.forEach((item, index) => drawAnalysisBox(buildRecommendationText(item, index)));
  } else {
    drawAnalysisBox(analysis.RECOMENDACOES || analysis.GERAL || "Sem recomendações estruturadas para este período.");
  }

  // ── Page numbers ──
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
