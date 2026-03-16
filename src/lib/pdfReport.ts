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

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

const HOUR_ORDER = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];
const WEEKDAY_ORDER = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];

const C = {
  headerBg: [15, 23, 42] as RGB,
  sectionBg: [23, 80, 97] as RGB,
  subBg: [14, 64, 74] as RGB,
  white: [255, 255, 255] as RGB,
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
};

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14; // margin
const W = PAGE_W - M * 2; // content width
const MAX_Y = PAGE_H - 14;

/* ═══════════════════════════════════════════════════════════
   AI TEXT PARSING
   ═══════════════════════════════════════════════════════════ */

interface Sections { [key: string]: string }
interface TimedBlock { label: string; content: string }
interface RecBlock { title: string; problema: string; causa: string; acao: string; responsavel: string; impacto: string }

function parseSections(ai: string): Sections {
  const s: Sections = {};
  if (!ai?.trim()) return s;
  const rx = /===\s*([A-Z_]+)\s*===\s*\n([\s\S]*?)(?=\n===\s*[A-Z_]+\s*===|$)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(ai)) !== null) s[m[1].trim()] = m[2].trim();
  if (!Object.keys(s).length) s.GERAL = ai.trim();
  return s;
}

function clean(t: string): string {
  return t
    .replace(/===\s*[A-Z_]+\s*:?\s*[^=\n]*===/gi, "")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseTimedBlocks(text: string, marker: "HORA" | "DIA"): TimedBlock[] {
  const t = (text || "").replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  const blocks: TimedBlock[] = [];

  // Try strict ===MARKER:value=== format
  const rx = new RegExp(
    `(?:^|\\n)\\s*===\\s*${marker}\\s*:\\s*([^=\\n]+?)\\s*===\\s*\\n([\\s\\S]*?)(?=\\n\\s*===\\s*${marker}\\s*:|$)`, "gi"
  );
  let m: RegExpExecArray | null;
  while ((m = rx.exec(t)) !== null) {
    blocks.push({ label: m[1].replace(/\*\*/g, "").trim(), content: clean(m[2]) });
  }

  // Fallback for hours: "08:00\n..."
  if (!blocks.length && marker === "HORA") {
    const fb = /(?:^|\n)\s*(\d{1,2}:\d{2})\s*\n([\s\S]*?)(?=\n\s*\d{1,2}:\d{2}\s*\n|$)/g;
    while ((m = fb.exec(t)) !== null) blocks.push({ label: m[1].trim(), content: clean(m[2]) });
  }

  // Fallback for days
  if (!blocks.length && marker === "DIA") {
    const days = WEEKDAY_ORDER.map(d => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const fb = new RegExp(`(?:^|\\n)\\s*(${days})\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:${days})\\s*\\n|$)`, "gi");
    while ((m = fb.exec(t)) !== null) blocks.push({ label: m[1].trim(), content: clean(m[2]) });
  }

  return blocks.length ? blocks : [{ label: "", content: clean(t) }];
}

function sortBlocks(blocks: TimedBlock[], order: string[]): TimedBlock[] {
  const idx = new Map(order.map((v, i) => [v, i]));
  return [...blocks].sort((a, b) => (idx.get(a.label) ?? 999) - (idx.get(b.label) ?? 999));
}

function parseRecommendations(text: string): RecBlock[] {
  const c = clean(text);
  if (!c) return [];
  const parts = c.split(/(?:^|\n)\s*(?:PROBLEMA\s+\d+|Problema\s+\d+)\s*[:\-]?\s*/).map(p => p.trim()).filter(Boolean);
  return parts.map(part => {
    const b: RecBlock = { title: "", problema: "", causa: "", acao: "", responsavel: "", impacto: "" };
    const lines = part.split("\n").map(l => l.trim()).filter(Boolean);
    let field: keyof RecBlock = "title";
    for (const line of lines) {
      const n = line.replace(/^[-•]\s*/, "");
      const lo = n.toLowerCase();
      if (lo.startsWith("problema:")) { b.problema = n.replace(/^[^:]+:\s*/, ""); field = "problema"; }
      else if (lo.match(/^causa\s*(prov[áa]vel)?:/)) { b.causa = n.replace(/^[^:]+:\s*/, ""); field = "causa"; }
      else if (lo.match(/^a[çc][ãa]o\s*(recomendada)?:/)) { b.acao = n.replace(/^[^:]+:\s*/, ""); field = "acao"; }
      else if (lo.match(/^respons[áa]vel:/)) { b.responsavel = n.replace(/^[^:]+:\s*/, ""); field = "responsavel"; }
      else if (lo.match(/^impacto\s*(esperado)?:/)) { b.impacto = n.replace(/^[^:]+:\s*/, ""); field = "impacto"; }
      else if (!b.title) b.title = n;
      else b[field] = [b[field], n].filter(Boolean).join(" ");
    }
    if (!b.title) b.title = b.problema || "Problema crítico";
    return b;
  });
}

/* ═══════════════════════════════════════════════════════════
   PDF GENERATOR
   ═══════════════════════════════════════════════════════════ */

export function generatePDFReport(data: PDFReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const imgs = data.chartImages || {};
  const dims = data.chartDimensions || {};
  const sections = parseSections(data.aiAnalysis);
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");
  let y = M;

  // ── Helpers ──
  const newPage = () => { doc.addPage(); y = M; };
  const ensure = (h: number) => { if (y + h > MAX_Y) newPage(); };

  const fmtPct = (v: number) => `${(v || 0).toFixed(1)}%`;

  /** Green section title bar */
  const title = (text: string) => {
    ensure(14);
    doc.setFillColor(...C.sectionBg);
    doc.roundedRect(M, y, W, 10, 1.8, 1.8, "F");
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...C.white);
    doc.text(text, M + 5, y + 6.7);
    y += 13;
  };

  /** Dark sub-header bar (for hours / days) */
  const subTitle = (text: string) => {
    if (!text) return;
    ensure(11);
    doc.setFillColor(...C.subBg);
    doc.roundedRect(M + 1, y, W - 2, 8, 1.6, 1.6, "F");
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...C.white);
    doc.text(text, M + 5, y + 5.2);
    y += 10;
  };

  /** Embed a chart image proportioned to fit page width */
  const drawImage = (img: string | undefined, dimKey: string) => {
    if (!img) return;
    const d = dims[dimKey];
    const ratio = d?.width && d?.height ? d.height / d.width : 0.5;
    const imgW = W;
    const imgH = Math.min(imgW * ratio, 140); // cap height
    ensure(imgH + 4);
    doc.addImage(img, "PNG", M, y, imgW, imgH);
    y += imgH + 3;
  };

  /** Analysis text box with left accent bar */
  const analysis = (text: string) => {
    const c = clean(text);
    if (!c) return;
    const paras = c.split("\n").map(l => l.trim()).filter(Boolean);
    const bodyW = W - 14;
    const lines: string[] = [];
    paras.forEach((p, i) => {
      lines.push(...(doc.splitTextToSize(p, bodyW) as string[]));
      if (i < paras.length - 1) lines.push("");
    });
    const boxH = Math.max(10, lines.length * 4 + 6);
    ensure(boxH + 3);

    doc.setFillColor(...C.analysisBg);
    doc.roundedRect(M, y, W, boxH, 1.5, 1.5, "F");
    doc.setFillColor(...C.sectionBg);
    doc.rect(M, y, 2, boxH, "F");

    let ty = y + 5;
    doc.setFontSize(9);
    for (const line of lines) {
      if (!line) { ty += 1.5; continue; }
      const ci = line.indexOf(":");
      if (ci > 0 && ci < 40) {
        doc.setFont("helvetica", "bold").setTextColor(...C.sectionBg);
        const prefix = line.slice(0, ci + 1);
        doc.text(prefix, M + 6, ty);
        const pw = doc.getTextWidth(prefix);
        doc.setFont("helvetica", "normal").setTextColor(...C.textDark);
        doc.text(line.slice(ci + 1).trimStart(), M + 6 + pw + 1, ty);
      } else {
        doc.setFont("helvetica", "normal").setTextColor(...C.textDark);
        doc.text(line, M + 6, ty);
      }
      ty += 4;
    }
    y += boxH + 3;
  };

  /** Standard block: Title → Image → Analysis */
  const block = (titleText: string, img: string | undefined, dimKey: string, analysisText?: string) => {
    title(titleText);
    drawImage(img, dimKey);
    if (analysisText?.trim()) analysis(analysisText);
  };

  /** Block with per-item sub-analyses (hours, days) */
  const blockWithSubs = (titleText: string, img: string | undefined, dimKey: string, blocks: TimedBlock[]) => {
    title(titleText);
    drawImage(img, dimKey);
    for (const b of blocks) {
      if (b.label) subTitle(b.label);
      if (b.content?.trim()) analysis(b.content);
    }
  };

  /* ══════════════════════════════════════════════════════════
     RENDER SEQUENCE
     ══════════════════════════════════════════════════════════ */

  // ── COVER (on initial page) ──
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, PAGE_W, 50, "F");
  doc.setTextColor(...C.white).setFont("helvetica", "bold").setFontSize(24);
  doc.text("ProdControl", M, 21);
  doc.setFontSize(14);
  doc.text("Relatório de Produtividade", M, 31);
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(`Contrato: ${data.obra || "Todos os Contratos"}`, M, 41);
  doc.text(`Período: ${data.periodo}`, M, 47);
  doc.text(`Gerado em: ${dateStr}`, PAGE_W - M, 47, { align: "right" });
  y = 58;

  // ── KPI CARDS ──
  title("Indicadores Principais");
  const kpis = [
    { label: "Total Amostras", value: `${data.totalAmostras}`, color: C.blue },
    { label: "Produtividade", value: fmtPct(data.produtivoPct), color: C.green },
    { label: "Suplementar", value: fmtPct(data.suplementarPct), color: C.amber },
    { label: "Não Produtivo", value: fmtPct(data.naoProdutivoPct), color: C.red },
    { label: "NPE (Externo)", value: fmtPct(data.externoPct), color: C.orange },
  ];
  const kGap = 3;
  const kW = (W - kGap * 4) / 5;
  kpis.forEach((k, i) => {
    const x = M + i * (kW + kGap);
    doc.setFillColor(...C.cardBg).setDrawColor(...C.border);
    doc.roundedRect(x, y, kW, 22, 1.2, 1.2, "FD");
    doc.setFillColor(...k.color);
    doc.rect(x, y, kW, 1.5, "F");
    doc.setTextColor(...k.color).setFont("helvetica", "bold").setFontSize(15);
    doc.text(k.value, x + 3.5, y + 10.5);
    doc.setTextColor(...C.textMuted).setFont("helvetica", "normal").setFontSize(8.2);
    doc.text(k.label, x + 3.5, y + 17.5);
  });
  y += 25;
  analysis(sections.RESUMO || sections.GERAL || "Diagnóstico geral indisponível.");

  // ── SECTIONS ──
  block("Visão Geral por Contrato", imgs.contrato, "contrato", sections.CONTRATO);
  block("Distribuição por Categoria", imgs.categoria, "categoria", sections.CATEGORIA);
  block("Top Causas — Pareto por Categorias", imgs.paretoCategoria, "paretoCategoria", sections.PARETO);
  block("Top Causas — Pareto por Especialidades", imgs.paretoEspecialidade, "paretoEspecialidade", sections.PARETO_ESPECIALIDADE);
  block("Produtividade por Especialidade", imgs.especialidade, "especialidade", sections.ESPECIALIDADE);
  block("Causas Externas de Parada (NPE)", imgs.externas, "externas", sections.EXTERNO);

  // Hourly — per-hour sub-analyses
  if (imgs.tempoHorario) {
    const hourBlocks = sortBlocks(parseTimedBlocks(sections.HORARIO || "", "HORA"), HOUR_ORDER);
    blockWithSubs("Produtividade por Horário", imgs.tempoHorario, "tempoHorario", hourBlocks);
  }

  // Day of week — per-day sub-analyses
  if (imgs.tempoDiaSemana) {
    const dayBlocks = sortBlocks(parseTimedBlocks(sections.DIA_SEMANA || "", "DIA"), WEEKDAY_ORDER);
    blockWithSubs("Produtividade por Dia da Semana", imgs.tempoDiaSemana, "tempoDiaSemana", dayBlocks);
  }

  // Month
  block("Produtividade por Mês", imgs.tempoMes, "tempoMes", sections.MES);

  // ── RECOMMENDATIONS ──
  title("Conclusões e Recomendações");
  const recs = parseRecommendations(sections.RECOMENDACOES || sections.GERAL || "");
  if (recs.length) {
    recs.forEach((item, idx) => {
      const fields = [
        { label: "PROBLEMA", value: item.problema },
        { label: "CAUSA PROVÁVEL", value: item.causa },
        { label: "AÇÃO RECOMENDADA", value: item.acao },
        { label: "RESPONSÁVEL", value: item.responsavel },
        { label: "IMPACTO ESPERADO", value: item.impacto },
      ].filter(f => f.value?.trim());

      let bH = 12;
      fields.forEach(f => {
        bH += 5 + (doc.splitTextToSize(f.value, W - 16) as string[]).length * 3.6;
      });
      ensure(bH + 6);

      doc.setFillColor(...C.subBg);
      doc.roundedRect(M + 1, y, W - 2, 8, 1.6, 1.6, "F");
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...C.white);
      doc.text(`PROBLEMA ${idx + 1} — ${item.title}`, M + 5, y + 5.2);
      y += 10;

      fields.forEach(f => {
        doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...C.sectionBg);
        doc.text(f.label, M + 5, y + 3.5);
        y += 5;
        const lines = doc.splitTextToSize(f.value, W - 16) as string[];
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...C.textDark);
        doc.text(lines, M + 9, y + 3);
        y += lines.length * 3.6 + 2;
      });
      y += 2;
    });
  } else {
    analysis(sections.RECOMENDACOES || sections.GERAL || "Sem recomendações para este período.");
  }

  // ── FOOTER (all pages) ──
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...C.textMuted);
    doc.text(`ProdControl — Página ${p} de ${total}`, M, PAGE_H - 8);
    doc.text(dateStr, PAGE_W - M, PAGE_H - 8, { align: "right" });
  }

  doc.save(`relatorio-produtividade_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
}
