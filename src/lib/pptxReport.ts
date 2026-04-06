import PptxGenJS from "pptxgenjs";
import { format } from "date-fns";
import type { PDFReportData } from "./pdfReport";
import type { ChartImages, ChartDimensions } from "./chartCapture";

// ── Color palette matching PDF (Azul Oceano #1F4E79) ────────────────────
const T = {
  ocean: "1F4E79",
  white: "FFFFFF",
  pageBg: "FFFFFF",
  cardBg: "F8FAFC",
  textDark: "1F2937",
  textMuted: "6B7280",
  border: "D1D5DB",
  green: "16A34A",
  amber: "F59E0B",
  red: "DC2626",
  orange: "F97316",
  blue: "2563EB",
};

const DESC_COLORS: Record<string, string> = {
  Trabalhando: "2563EB",
  Planejando: "60A5FA",
  "Aguardando Ferramenta ou Material": "4ADE80",
  "Transitando no local de trabalho - com ferramenta": "22C55E",
  "Transitando no local de trabalho - sem ferramenta": "16A34A",
  "Transitando fora do local de trabalho - com ferramenta": "65A30D",
  "Transitando fora do local de trabalho - sem ferramenta": "84CC16",
  "Assistindo / Stand By": "15803D",
  Pessoal: "EF4444",
  Ocioso: "DC2626",
  "Aguardando Liberação de PT": "34D399",
  "Interferências Operacionais": "C8A882",
  "Fatores Climáticos e Consequências": "F97316",
};

const STACK_ORDER_FULL = [
  "Trabalhando", "Planejando", "Aguardando Ferramenta ou Material",
  "Transitando no local de trabalho - com ferramenta",
  "Transitando no local de trabalho - sem ferramenta",
  "Transitando fora do local de trabalho - com ferramenta",
  "Transitando fora do local de trabalho - sem ferramenta",
  "Assistindo / Stand By", "Aguardando Liberação de PT",
  "Pessoal", "Ocioso", "Interferências Operacionais",
  "Fatores Climáticos e Consequências",
] as const;

const LEGEND_ORDER_FULL = [...STACK_ORDER_FULL].reverse();

// ── Analysis parsing helpers ────────────────────────────────────────────

interface AnalysisSections { [key: string]: string; }

function parseAnalysis(aiText: string): AnalysisSections {
  const sections: AnalysisSections = {};
  if (!aiText) return sections;
  const normalized = aiText.replace(/\r\n/g, "\n").trim();

  const topLevelRegex = /(?:^|\n)\s*===\s*(RESUMO|CONTRATO|CATEGORIA|PARETO(?:_ESPECIALIDADE|_FUNCAO)?|ESPECIALIDADE|FUNCAO|NAO_PRODUTIVO|EXTERNO|HORARIO|DIA_SEMANA|MES|RECOMENDACOES)\s*===\s*\n/gi;
  const markers = [...normalized.matchAll(topLevelRegex)].map(m => ({
    key: m[1].trim().toUpperCase(),
    start: m.index ?? 0,
    contentStart: (m.index ?? 0) + m[0].length,
  }));

  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i];
    const next = markers[i + 1];
    sections[cur.key] = normalized.slice(cur.contentStart, next?.start ?? normalized.length).trim();
  }

  // Fallback inferred sections
  const extractInferred = (text: string, startPat: RegExp, endPats: RegExp[]): string => {
    const start = text.search(startPat);
    if (start < 0) return "";
    const slice = text.slice(start);
    const ends = endPats.map(p => slice.search(p)).filter(i => i >= 0);
    const end = ends.length ? Math.min(...ends) : slice.length;
    return slice.slice(0, end).trim();
  };

  if (!sections.HORARIO) sections.HORARIO = extractInferred(normalized, /(?:^|\n)\s*===\s*HORA\s*:/i, [/(?:^|\n)\s*===\s*DIA/i, /(?:^|\n)\s*===\s*MES/i, /(?:^|\n)\s*===\s*RECOMENDACOES/i]);
  if (!sections.DIA_SEMANA) sections.DIA_SEMANA = extractInferred(normalized, /(?:^|\n)\s*===\s*DIA\s*:/i, [/(?:^|\n)\s*===\s*MES/i, /(?:^|\n)\s*===\s*RECOMENDACOES/i]);
  if (!sections.MES) sections.MES = extractInferred(normalized, /(?:^|\n)\s*===\s*MES\s*:/i, [/(?:^|\n)\s*===\s*RECOMENDACOES/i]);

  if (!Object.keys(sections).some(k => sections[k]?.trim())) sections.GERAL = normalized;
  return sections;
}

function stripTags(text: string): string {
  return text
    .replace(/===\s*([A-Z_]+)\s*:?\s*([^=\n]*)===/gi, (_, _marker, value) => {
      const clean = String(value || "").trim();
      return clean ? `\n${clean}\n` : "\n";
    })
    .replace(/\*\*/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTitle(raw: string): string {
  return raw
    .replace(/^={2,}\s*(?:DIA|HORA|MES)\s*:\s*/i, "")
    .replace(/\*\*/g, "")
    .replace(/^Dia\s*[:\-]\s*/i, "")
    .replace(/^Hora\s*[:\-]\s*/i, "")
    .replace(/^M[eê]s\s*[:\-]\s*/i, "")
    .replace(/:$/g, "")
    .trim();
}

interface TimedBlock { label: string; content: string; }
interface RecBlock { title: string; problema: string; causa: string; acao: string; responsavel: string; impacto: string; }

const WEEKDAY_ORDER = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"] as const;
const MONTH_ORDER = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;
const HOUR_ORDER = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"] as const;

function parseTimedBlocks(text: string, marker: "HORA" | "DIA" | "MES"): TimedBlock[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const blocks: TimedBlock[] = [];

  const strictRegex = new RegExp(`(?:^|\\n)\\s*===\\s*${marker}\\s*:\\s*([^=\\n]+?)\\s*===\\s*\\n([\\s\\S]*?)(?=\\n\\s*===\\s*${marker}\\s*:|$)`, "gi");
  let m: RegExpExecArray | null;
  while ((m = strictRegex.exec(normalized)) !== null) blocks.push({ label: normalizeTitle(m[1]), content: stripTags(m[2]) });

  if (!blocks.length && marker === "HORA") {
    const fb = /(?:^|\n)\s*(\d{1,2}:\d{2})\s*\n([\s\S]*?)(?=\n\s*\d{1,2}:\d{2}\s*\n|$)/g;
    while ((m = fb.exec(normalized)) !== null) blocks.push({ label: normalizeTitle(m[1]), content: stripTags(m[2]) });
  }
  if (!blocks.length && marker === "DIA") {
    const dayPattern = WEEKDAY_ORDER.map(d => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const fb = new RegExp(`(?:^|\\n)\\s*(${dayPattern})\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:${dayPattern})\\s*\\n|$)`, "gi");
    while ((m = fb.exec(normalized)) !== null) blocks.push({ label: normalizeTitle(m[1]), content: stripTags(m[2]) });
  }
  if (!blocks.length && marker === "MES") {
    const monthPattern = MONTH_ORDER.map(mo => mo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const fb = new RegExp(`(?:^|\\n)\\s*(${monthPattern})\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:${monthPattern})\\s*\\n|$)`, "gi");
    while ((m = fb.exec(normalized)) !== null) blocks.push({ label: normalizeTitle(m[1]), content: stripTags(m[2]) });
  }

  return blocks.length ? blocks : normalized.trim() ? [{ label: "", content: stripTags(normalized) }] : [];
}

function sortBlocks(blocks: TimedBlock[], order: readonly string[]): TimedBlock[] {
  const orderMap = new Map(order.map((item, i) => [item, i]));
  return [...blocks].sort((a, b) => (orderMap.get(a.label) ?? 999) - (orderMap.get(b.label) ?? 999));
}

function parseRecommendations(text: string): RecBlock[] {
  const clean = stripTags(text);
  if (!clean) return [];
  const parts = clean.split(/(?:^|\n)\s*(?:PROBLEMA\s+\d+|Problema\s+\d+)\s*[:\-—]?\s*/).map(p => p.trim()).filter(Boolean);

  return parts.map(part => {
    const block: RecBlock = { title: "", problema: "", causa: "", acao: "", responsavel: "", impacto: "" };
    const lines = part.split("\n").map(l => l.trim()).filter(Boolean);
    let active: keyof RecBlock = "title";
    for (const rawLine of lines) {
      const line = rawLine.replace(/^[-•]\s*/, "");
      const lower = line.toLowerCase();
      if (lower.startsWith("problema:")) { block.problema = line.replace(/^[^:]+:\s*/, ""); active = "problema"; }
      else if (lower.startsWith("causa prov") || lower.startsWith("causa:")) { block.causa = line.replace(/^[^:]+:\s*/, ""); active = "causa"; }
      else if (lower.startsWith("ação recomendada") || lower.startsWith("acao recomendada") || lower.startsWith("ação:")) { block.acao = line.replace(/^[^:]+:\s*/, ""); active = "acao"; }
      else if (lower.startsWith("responsável") || lower.startsWith("responsavel")) { block.responsavel = line.replace(/^[^:]+:\s*/, ""); active = "responsavel"; }
      else if (lower.startsWith("impacto esperado") || lower.startsWith("impacto:")) { block.impacto = line.replace(/^[^:]+:\s*/, ""); active = "impacto"; }
      else if (!block.title) block.title = line;
      else block[active] = [block[active], line].filter(Boolean).join(" ").trim();
    }
    if (!block.title) block.title = block.problema || "Problema crítico";
    return block;
  });
}

// ── Legend computation ───────────────────────────────────────────────────

interface LegendItem { name: string; color: string; percent: number; }

function computeLegendItems(rows: Array<Record<string, any>>, legendOrder: readonly string[], stackOrder: readonly string[]): LegendItem[] {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const desc of stackOrder) {
    let sum = 0;
    for (const row of rows) {
      const rk = `raw_${desc}`;
      if (rk in row) sum += Number(row[rk] || 0);
      else if (desc in row) sum += ((Number(row[desc]) || 0) / 100) * (Number(row.total) || 0);
    }
    totals.set(desc, sum);
    grand += sum;
  }
  return legendOrder.map(desc => ({
    name: desc,
    color: DESC_COLORS[desc] || "6B7280",
    percent: grand > 0 ? Number(((totals.get(desc) || 0) / grand * 100).toFixed(1)) : 0,
  })).filter(i => i.percent > 0);
}

function fmtPct(v: number): string { return `${Number((v || 0).toFixed(1))}%`; }

// ── Word-wrap utility ───────────────────────────────────────────────────

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur.length + 1 + w.length) > maxChars) { lines.push(cur); cur = w; }
    else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── Slide helpers (white background, ocean blue headers) ────────────────

function makeBg(slide: PptxGenJS.Slide) {
  slide.background = { color: T.pageBg };
}

function addPageFooter(slide: PptxGenJS.Slide, pageNum: number, totalPages: number, dateStr: string) {
  slide.addText(`ProdControl — Slide ${pageNum} de ${totalPages}`, {
    x: 0.4, y: 7.15, w: 6, h: 0.25,
    fontSize: 7, color: T.textMuted, fontFace: "Calibri",
  });
  slide.addText(dateStr, {
    x: 7, y: 7.15, w: 6, h: 0.25,
    fontSize: 7, color: T.textMuted, fontFace: "Calibri", align: "right",
  });
}

function addSectionHeader(slide: PptxGenJS.Slide, title: string, y: number): number {
  slide.addShape("roundRect" as any, {
    x: 0.4, y, w: 12.5, h: 0.55,
    fill: { color: T.ocean },
    rectRadius: 0.08,
  });
  slide.addText(title, {
    x: 0.6, y, w: 12.1, h: 0.55,
    fontSize: 16, bold: true, color: T.white, fontFace: "Calibri", valign: "middle",
  });
  return y + 0.65;
}

function addSubHeader(slide: PptxGenJS.Slide, title: string, y: number): number {
  const clean = normalizeTitle(title).replace(/:$/g, "");
  if (!clean) return y;
  slide.addShape("roundRect" as any, {
    x: 0.5, y, w: 12.3, h: 0.45,
    fill: { color: T.ocean },
    rectRadius: 0.06,
  });
  slide.addText(clean, {
    x: 0.7, y, w: 11.9, h: 0.45,
    fontSize: 13, bold: true, color: T.white, fontFace: "Calibri", valign: "middle",
  });
  return y + 0.55;
}

/** Render structured analysis text (Diagnóstico / Interpretação / Ação / Impacto) */
function addAnalysisBlock(slide: PptxGenJS.Slide, text: string, y: number, maxH: number): number {
  if (!text?.trim()) return y;

  const cleaned = stripTags(text);
  const lines = cleaned.split("\n").filter(l => l.trim());
  const textParts: PptxGenJS.TextProps[] = [];

  const labelPatterns = [
    { re: /^diagnóstico\s*:/i, label: "Diagnóstico" },
    { re: /^interpretação\s+operacional\s*:/i, label: "Interpretação Operacional" },
    { re: /^ação\s+recomendada\s*:/i, label: "Ação Recomendada" },
    { re: /^impacto\s+esperado\s*:/i, label: "Impacto Esperado" },
    { re: /^responsável[^:]*:/i, label: "Responsável" },
  ];

  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-•]\s*/, "");
    let matched = false;

    for (const lp of labelPatterns) {
      if (lp.re.test(trimmed)) {
        const body = trimmed.replace(lp.re, "").trim();
        // Label
        textParts.push({
          text: lp.label + "\n",
          options: { fontSize: 10, bold: true, color: T.ocean, fontFace: "Calibri" },
        });
        if (body) {
          textParts.push({
            text: body + "\n\n",
            options: { fontSize: 10, color: T.textDark, fontFace: "Calibri" },
          });
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      textParts.push({
        text: trimmed + "\n",
        options: { fontSize: 10, color: T.textDark, fontFace: "Calibri" },
      });
    }
  }

  if (!textParts.length) return y;

  // Analysis box with left blue bar
  const boxH = Math.min(maxH, Math.max(0.8, textParts.length * 0.18 + 0.3));
  slide.addShape("roundRect" as any, {
    x: 0.5, y, w: 12.3, h: boxH,
    fill: { color: T.cardBg },
    rectRadius: 0.06,
  });
  slide.addShape("rect" as any, {
    x: 0.5, y, w: 0.08, h: boxH,
    fill: { color: T.ocean },
  });

  slide.addText(textParts, {
    x: 0.75, y: y + 0.05, w: 11.8, h: boxH - 0.1,
    valign: "top", fontFace: "Calibri", lineSpacingMultiple: 1.15,
    autoFit: true,
  });

  return y + boxH + 0.15;
}

/** Render a structured recommendation block with labeled fields */
function addRecBlock(slide: PptxGenJS.Slide, block: RecBlock, y: number): number {
  const fields = [
    { label: "Diagnóstico", value: block.problema, color: T.ocean },
    { label: "Interpretação Operacional", value: block.causa, color: T.ocean },
    { label: "Ação Recomendada", value: block.acao, color: T.green },
    { label: "Responsável", value: block.responsavel, color: T.ocean },
    { label: "Impacto Esperado", value: block.impacto, color: T.green },
  ].filter(f => f.value?.trim());

  const parts: PptxGenJS.TextProps[] = [];
  for (const f of fields) {
    parts.push({
      text: f.label + "\n",
      options: { fontSize: 11, bold: true, color: f.color, fontFace: "Calibri" },
    });
    parts.push({
      text: f.value + "\n\n",
      options: { fontSize: 10, color: T.textDark, fontFace: "Calibri" },
    });
  }

  const boxH = Math.min(5.5, Math.max(1.5, fields.length * 0.9));
  slide.addShape("roundRect" as any, {
    x: 0.5, y, w: 12.3, h: boxH,
    fill: { color: T.cardBg },
    rectRadius: 0.06,
  });
  slide.addShape("rect" as any, {
    x: 0.5, y, w: 0.08, h: boxH,
    fill: { color: T.ocean },
  });
  slide.addText(parts, {
    x: 0.75, y: y + 0.08, w: 11.8, h: boxH - 0.16,
    valign: "top", fontFace: "Calibri", lineSpacingMultiple: 1.15,
    autoFit: true,
  });

  return y + boxH + 0.15;
}

/** Draw a legend table for chart slides */
function addLegendTable(slide: PptxGenJS.Slide, items: LegendItem[], x: number, y: number, w: number, h: number) {
  if (!items.length) return;

  const rows: PptxGenJS.TableRow[] = items.map(item => ([
    {
      text: "",
      options: {
        fill: { color: item.color },
        border: [{ type: "none" as const }, { type: "none" as const }, { type: "none" as const }, { type: "none" as const }],
      },
    },
    {
      text: `${item.name} — ${fmtPct(item.percent)}`,
      options: {
        fontSize: 7.5,
        color: T.textDark,
        fontFace: "Calibri",
        border: [{ type: "none" as const }, { type: "none" as const }, { type: "none" as const }, { type: "none" as const }],
      },
    },
  ]));

  slide.addTable(rows, {
    x, y, w, h,
    colW: [0.18, w - 0.18],
    rowH: Math.min(0.28, h / items.length),
    margin: [1, 2, 1, 4],
    border: { type: "none" },
    autoPage: false,
  });
}

// ── Main export function ────────────────────────────────────────────────

export function generatePPTXReport(data: PDFReportData) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "MEGASTEAM";
  pptx.subject = "Relatório de Produtividade";
  pptx.title = `Relatório - ${data.obra}`;

  const analysis = parseAnalysis(data.aiAnalysis);
  const images = (data as any).chartImages as ChartImages || {};
  const dims = (data as any).chartDimensions as ChartDimensions || {};
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");
  const slides: PptxGenJS.Slide[] = [];
  const recommendations = parseRecommendations(analysis.RECOMENDACOES || analysis.GERAL || "");

  const contractLegend = computeLegendItems(data.byObra, LEGEND_ORDER_FULL, [...STACK_ORDER_FULL], );
  const specialtyLegend = computeLegendItems(data.bySpecialty, LEGEND_ORDER_FULL, [...STACK_ORDER_FULL]);
  const hourLegend = computeLegendItems(data.byTimeHorario || [], LEGEND_ORDER_FULL, [...STACK_ORDER_FULL]);
  const weekLegend = computeLegendItems(data.byTimeDiaSemana || [], LEGEND_ORDER_FULL, [...STACK_ORDER_FULL]);
  const monthLegend = computeLegendItems(data.byTimeMes || [], LEGEND_ORDER_FULL, [...STACK_ORDER_FULL]);

  const npeLegend: LegendItem[] = data.externalCausas.map(c => ({
    name: c.name, color: DESC_COLORS[c.name] || "6B7280", percent: Number((c.percent || 0).toFixed(1)),
  })).filter(i => i.percent > 0);

  const catLegend: LegendItem[] = (data.categoryTotals || []).map(c => ({
    name: c.name,
    color: ({ Produtivo: "2563EB", Suplementar: "16A34A", "Não Produtivo": "DC2626", "Não Produtivo Externo": "F97316" })[c.name] || "6B7280",
    percent: Number(((c.value / Math.max(1, data.categoryTotals.reduce((s, x) => s + x.value, 0))) * 100).toFixed(1)),
  })).filter(i => i.percent > 0);

  const hourBlocks = sortBlocks(parseTimedBlocks(analysis.HORARIO || "", "HORA"), HOUR_ORDER);
  const weekdayBlocks = sortBlocks(parseTimedBlocks(analysis.DIA_SEMANA || "", "DIA"), WEEKDAY_ORDER);
  const monthBlocks = sortBlocks(parseTimedBlocks(analysis.MES || "", "MES"), MONTH_ORDER);

  // ── SLIDE 1: Cover (dark header like PDF page 1) ──────────────────────
  const s1 = pptx.addSlide();
  s1.background = { color: T.pageBg };
  s1.addShape("rect" as any, { x: 0, y: 0, w: 13.33, h: 3.2, fill: { color: "0F172A" } });
  s1.addText("ProdControl", {
    x: 0.6, y: 0.4, w: 8, h: 0.7,
    fontSize: 28, bold: true, color: T.white, fontFace: "Calibri",
  });
  s1.addText("Relatório de Produtividade", {
    x: 0.6, y: 1.2, w: 10, h: 0.6,
    fontSize: 20, bold: true, color: T.white, fontFace: "Calibri",
  });
  s1.addText(`Contrato: ${data.obra || "Todos os Contratos"}`, {
    x: 0.6, y: 2.0, w: 8, h: 0.4,
    fontSize: 13, color: "94A3B8", fontFace: "Calibri",
  });
  s1.addText(`Período analisado: ${data.periodo}`, {
    x: 0.6, y: 2.4, w: 6, h: 0.35,
    fontSize: 11, color: "94A3B8", fontFace: "Calibri",
  });
  s1.addText(`Data de geração: ${dateStr}`, {
    x: 8, y: 2.4, w: 5, h: 0.35,
    fontSize: 11, color: "94A3B8", fontFace: "Calibri", align: "right",
  });

  // KPI section on cover
  let y1 = 3.6;
  y1 = addSectionHeader(s1, "Indicadores Principais", y1);
  const kpis = [
    { label: "Total de Amostras", value: String(Math.round(data.totalAmostras)), color: T.ocean },
    { label: "Produtividade", value: fmtPct(data.produtivoPct), color: T.green },
    { label: "Suplementar", value: fmtPct(data.suplementarPct), color: T.amber },
    { label: "Não Produtivo", value: fmtPct(data.naoProdutivoPct), color: T.red },
    { label: "NPE (Externo)", value: fmtPct(data.externoPct), color: T.orange },
  ];
  const kpiW = 2.3;
  const kpiGap = 0.2;
  kpis.forEach((kpi, i) => {
    const kx = 0.5 + i * (kpiW + kpiGap);
    s1.addShape("roundRect" as any, {
      x: kx, y: y1, w: kpiW, h: 1.3,
      fill: { color: T.cardBg },
      line: { color: T.border, width: 0.5 },
      rectRadius: 0.06,
    });
    s1.addShape("rect" as any, { x: kx, y: y1, w: kpiW, h: 0.08, fill: { color: kpi.color } });
    s1.addText(kpi.value, {
      x: kx + 0.2, y: y1 + 0.1, w: kpiW - 0.4, h: 0.7,
      fontSize: 22, bold: true, color: kpi.color, fontFace: "Calibri", valign: "middle",
    });
    s1.addText(kpi.label, {
      x: kx + 0.2, y: y1 + 0.8, w: kpiW - 0.4, h: 0.4,
      fontSize: 8, color: T.textMuted, fontFace: "Calibri",
    });
  });
  y1 += 1.5;

  // Summary analysis
  y1 = addAnalysisBlock(s1, analysis.RESUMO || analysis.GERAL || "", y1, 2.0);

  s1.addText("MEGASTEAM", {
    x: 0.5, y: 6.8, w: 4, h: 0.3,
    fontSize: 11, bold: true, color: T.ocean, fontFace: "Calibri",
  });
  slides.push(s1);

  // ── Helper: standard chart slide (chart + legend + analysis) ──────────
  function addChartPage(title: string, chartImage: string | undefined, dimKey: string, legend: LegendItem[], analysisText?: string) {
    const slide = pptx.addSlide();
    makeBg(slide);
    let cy = 0.3;
    cy = addSectionHeader(slide, title, cy);

    if (chartImage) {
      const chartW = legend.length ? 8.5 : 12.3;
      const dim = dims[dimKey];
      let chartH = 4.5;
      if (dim?.width > 0) {
        chartH = Math.min(4.8, chartW * (dim.height / dim.width));
      }

      slide.addImage({ data: chartImage, x: 0.5, y: cy, w: chartW, h: chartH });

      if (legend.length) {
        addLegendTable(slide, legend, 9.2, cy, 3.8, chartH);
      }
      cy += chartH + 0.2;
    }

    if (analysisText?.trim()) {
      cy = addAnalysisBlock(slide, analysisText, cy, 7.0 - cy);
    }

    slides.push(slide);
  }

  // ── Helper: timed analysis slides (Horário / Dia / Mês) ──────────────
  function addTimedChartPage(title: string, chartImage: string | undefined, dimKey: string, legend: LegendItem[], blocks: TimedBlock[]) {
    // First slide: chart + legend
    addChartPage(title, chartImage, dimKey, legend);

    // Subsequent slides: one per time block (or multiple on one slide)
    let curSlide: PptxGenJS.Slide | null = null;
    let cy = 7.5; // force new slide

    for (const block of blocks) {
      if (!block.label && !block.content?.trim()) continue;

      // Estimate block height
      const blockH = 0.55 + Math.min(3.5, (block.content?.split("\n").filter(l => l.trim()).length || 1) * 0.22 + 0.3);

      if (cy + blockH > 6.8 || !curSlide) {
        curSlide = pptx.addSlide();
        makeBg(curSlide);
        cy = 0.3;
      }

      if (block.label) {
        cy = addSubHeader(curSlide, block.label, cy);
      }
      if (block.content?.trim()) {
        cy = addAnalysisBlock(curSlide, block.content, cy, 6.8 - cy);
      }

      if (curSlide && !slides.includes(curSlide)) slides.push(curSlide);
    }

    // Ensure last slide is added
    if (curSlide && !slides.includes(curSlide)) slides.push(curSlide);
  }

  // ── SLIDE 2: Visão Geral por Contrato ─────────────────────────────────
  addChartPage("Visão Geral por Contrato", images.contrato, "contrato", contractLegend, analysis.CONTRATO);

  // ── SLIDE 3: Distribuição por Categoria ───────────────────────────────
  addChartPage("Distribuição por Categoria", images.categoria, "categoria", catLegend, analysis.CATEGORIA);

  // ── SLIDE 4: Pareto ───────────────────────────────────────────────────
  addChartPage("Top Causas — Pareto por Categorias", images.paretoCategoria, "paretoCategoria", [], analysis.PARETO);

  // ── SLIDE 5-6: Especialidade ──────────────────────────────────────────
  {
    const specText = analysis.ESPECIALIDADE || "";
    // First slide: chart + legend
    addChartPage("Produtividade por Especialidade", images.especialidade, "especialidade", specialtyLegend);

    // Parse specialty blocks and render each as header + analysis
    const specBlocks = specText.split(/(?=Melhor\s+especialidade|Especialidade\s+(?:intermedi[aá]ria|cr[ií]tica))/i).filter(b => b.trim());
    if (specBlocks.length > 1 || /Melhor\s+especialidade/i.test(specText)) {
      let curSlide: PptxGenJS.Slide | null = null;
      let cy = 7.5;

      for (const block of specBlocks) {
        const headerMatch = block.match(/^(Melhor\s+especialidade|Especialidade\s+intermedi[aá]ria|Especialidade\s+cr[ií]tica)\s*:\s*(.*)$/im);
        if (headerMatch) {
          let headerTitle = headerMatch[1].trim();
          headerTitle = headerTitle.replace(/intermedi[aá]ria/i, "Intermediária").replace(/cr[ií]tica/i, "Crítica");
          if (/^melhor/i.test(headerTitle)) headerTitle = "Melhor Especialidade";
          else if (/intermediária/i.test(headerTitle)) headerTitle = "Especialidade Intermediária";
          else if (/crítica/i.test(headerTitle)) headerTitle = "Especialidade Crítica";

          const valuePart = headerMatch[2]?.trim() || "";
          const bodyStart = block.indexOf(headerMatch[0]) + headerMatch[0].length;
          const bodyText = block.slice(bodyStart).trim();
          const fullTitle = valuePart ? `${headerTitle} — ${valuePart}` : headerTitle;

          const blockH = 0.55 + Math.min(4, (bodyText.split("\n").filter(l => l.trim()).length || 1) * 0.22 + 0.3);
          if (cy + blockH > 6.8 || !curSlide) {
            curSlide = pptx.addSlide();
            makeBg(curSlide);
            cy = 0.3;
          }

          cy = addSubHeader(curSlide, fullTitle, cy);
          if (bodyText) cy = addAnalysisBlock(curSlide, bodyText, cy, 6.8 - cy);

          if (!slides.includes(curSlide)) slides.push(curSlide);
        } else if (block.trim()) {
          if (cy + 1.5 > 6.8 || !curSlide) {
            curSlide = pptx.addSlide();
            makeBg(curSlide);
            cy = 0.3;
          }
          cy = addAnalysisBlock(curSlide, block, cy, 6.8 - cy);
          if (curSlide && !slides.includes(curSlide)) slides.push(curSlide);
        }
      }
      if (curSlide && !slides.includes(curSlide)) slides.push(curSlide);
    } else if (specText.trim()) {
      // Single analysis block on new slide
      const specSlide = pptx.addSlide();
      makeBg(specSlide);
      addAnalysisBlock(specSlide, specText, 0.3, 6.8);
      slides.push(specSlide);
    }
  }

  // ── SLIDE: Causas Externas (NPE) ──────────────────────────────────────
  addChartPage("Causas Externas de Parada (NPE)", images.externas, "externas", npeLegend, analysis.EXTERNO);

  // ── SLIDES: Produtividade por Horário ─────────────────────────────────
  addTimedChartPage("Produtividade por Horário", images.tempoHorario, "tempoHorario", hourLegend, hourBlocks);

  // ── SLIDES: Produtividade por Dia da Semana ───────────────────────────
  addTimedChartPage("Produtividade por Dia da Semana", images.tempoDiaSemana, "tempoDiaSemana", weekLegend, weekdayBlocks);

  // ── SLIDES: Produtividade por Mês ─────────────────────────────────────
  addTimedChartPage("Produtividade por Mês", images.tempoMes, "tempoMes", monthLegend, monthBlocks);

  // ── SLIDES: Conclusões e Recomendações ────────────────────────────────
  if (recommendations.length) {
    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      const title = rec.title || `Problema ${i + 1}`;
      const slide = pptx.addSlide();
      makeBg(slide);
      let cy = 0.3;

      if (i === 0) {
        cy = addSectionHeader(slide, "Conclusões e Recomendações", cy);
      }

      cy = addSubHeader(slide, `Problema Crítico ${i + 1} — ${title}`, cy);
      cy = addRecBlock(slide, rec, cy);
      slides.push(slide);
    }
  } else {
    const recSlide = pptx.addSlide();
    makeBg(recSlide);
    let cy = addSectionHeader(recSlide, "Conclusões e Recomendações", 0.3);
    addAnalysisBlock(recSlide, analysis.RECOMENDACOES || analysis.GERAL || "Sem recomendações para este período.", cy, 6.0);
    slides.push(recSlide);
  }

  // ── Footer on all slides ──────────────────────────────────────────────
  slides.forEach((s, i) => addPageFooter(s, i + 1, slides.length, dateStr));

  pptx.writeFile({ fileName: `apresentacao-produtividade_${format(new Date(), "yyyy-MM-dd_HHmm")}.pptx` });
}
