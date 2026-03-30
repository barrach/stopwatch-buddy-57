import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import type { SavedReport } from "@/components/SavedReportsList";
import { CANONICAL_ORDER_FULL, DESCRIPTION_COLORS } from "@/lib/chartConstants";

type RGB = [number, number, number];

const C = {
  headerBg: [15, 23, 42] as RGB,
  ocean: [31, 78, 121] as RGB,
  white: [255, 255, 255] as RGB,
  textDark: [31, 41, 55] as RGB,
  textMuted: [107, 114, 128] as RGB,
  border: [209, 213, 219] as RGB,
  cardBg: [248, 250, 252] as RGB,
  green: [22, 163, 74] as RGB,
  red: [220, 38, 38] as RGB,
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MAX_Y = PAGE_H - 14;

function hexToRgb(hex: string): RGB {
  const v = hex.replace("#", "");
  return [parseInt(v.substring(0, 2), 16), parseInt(v.substring(2, 4), 16), parseInt(v.substring(4, 6), 16)];
}

function fmtPct(p: number): string {
  return `${Number(p || 0).toFixed(1)}%`;
}

function periodLabel(r: SavedReport): string {
  return r.date_mode === "single" ? r.data_unica || "" : `${r.data_inicio} até ${r.data_fim}`;
}

function getProductivity(snapshot: any): Record<string, number> {
  const data = snapshot?.byObra || [];
  if (data.length === 0) return {};
  const result: Record<string, number> = {};
  for (const desc of CANONICAL_ORDER_FULL) {
    const vals = data.map((d: any) => d[desc] || 0);
    result[desc] = vals.reduce((s: number, v: number) => s + v, 0) / vals.length;
  }
  return result;
}

const GROUP_MAP: Record<string, string[]> = {
  "Produtivo": ["Trabalhando", "Planejando"],
  "Suplementar": [
    "Aguardando Ferramenta ou Material", "Assistindo / Stand By",
    "Aguardando Liberação de PT",
    "Transitando no local de trabalho - com ferramenta", "Transitando no local de trabalho - sem ferramenta",
    "Transitando fora do local de trabalho - com ferramenta", "Transitando fora do local de trabalho - sem ferramenta",
  ],
  "Não Produtivo": ["Pessoal", "Ocioso"],
  "Não Produtivo Externo": ["Interferências Operacionais", "Fatores Climáticos e Consequências"],
};

function computeGrouped(prod: Record<string, number>): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const [group, descs] of Object.entries(GROUP_MAP)) {
    raw[group] = descs.reduce((s, d) => s + (prod[d] || 0), 0);
  }
  const total = Object.values(raw).reduce((s, v) => s + v, 0);
  if (total <= 0) return raw;
  const scaled = Object.entries(raw).map(([k, v]) => ({
    key: k, exact: (v / total) * 100,
    floored: Math.floor((v / total) * 100 * 10) / 10,
  }));
  const flooredSum = scaled.reduce((s, e) => s + Math.round(e.floored * 10), 0);
  const remainder = 1000 - flooredSum;
  const sorted = [...scaled].sort((a, b) => (b.exact - b.floored) - (a.exact - a.floored));
  for (let i = 0; i < remainder && i < sorted.length; i++) {
    sorted[i].floored = Math.round((sorted[i].floored + 0.1) * 10) / 10;
  }
  const result: Record<string, number> = {};
  for (const e of scaled) result[e.key] = e.floored;
  return result;
}

// ── Chart capture helper ──
async function captureElementById(id: string): Promise<string | null> {
  const el = document.getElementById(id);
  if (!el) return null;
  try {
    // Temporarily remove truncation and overflow hidden so all text is visible
    const truncatedEls = el.querySelectorAll('.truncate');
    truncatedEls.forEach((te) => {
      (te as HTMLElement).style.overflow = 'visible';
      (te as HTMLElement).style.textOverflow = 'unset';
      (te as HTMLElement).style.whiteSpace = 'normal';
    });

    // Boost saturation/contrast for PDF output
    const origFilter = (el as HTMLElement).style.filter;
    (el as HTMLElement).style.filter = 'saturate(1.35) contrast(1.1)';

    const canvas = await html2canvas(el, {
      backgroundColor: "#FFFFFF",
      scale: 4,
      logging: false,
      useCORS: true,
      allowTaint: true,
      scrollX: 0,
      scrollY: -window.scrollY,
    });

    // Restore styles
    (el as HTMLElement).style.filter = origFilter;
    truncatedEls.forEach((te) => {
      (te as HTMLElement).style.overflow = '';
      (te as HTMLElement).style.textOverflow = '';
      (te as HTMLElement).style.whiteSpace = '';
    });

    return canvas.toDataURL("image/png", 1.0);
  } catch (e) {
    console.warn(`Failed to capture #${id}:`, e);
    return null;
  }
}

export async function generateComparisonPDF(reportA: SavedReport, reportB: SavedReport, _container?: HTMLElement | null) {
  // ── 1. Capture chart sections from DOM ──
  const chartIds = [
    "comp-summary", "comp-kpis",
    "comp-byObra", "comp-bySpecialty", "comp-byHorario",
    "comp-byDiaSemana", "comp-byMes", "comp-pareto", "comp-external",
  ];

  const captures: Record<string, string> = {};
  for (const id of chartIds) {
    const img = await captureElementById(id);
    if (img) captures[id] = img;
  }

  // ── 2. Build PDF ──
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");

  const sA = reportA.snapshot as any;
  const sB = reportB.snapshot as any;
  const prodA = getProductivity(sA);
  const prodB = getProductivity(sB);
  const groupedA = computeGrouped(prodA);
  const groupedB = computeGrouped(prodB);

  let curY = MARGIN;
  const newPage = () => { doc.addPage(); curY = MARGIN; };
  const ensureSpace = (h: number) => { if (curY + h > MAX_Y) newPage(); };

  const sectionHeader = (title: string) => {
    ensureSpace(14);
    doc.setFillColor(...C.ocean);
    doc.roundedRect(MARGIN, curY, CONTENT_W, 10, 1.8, 1.8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...C.white);
    doc.text(title, MARGIN + 5, curY + 6.7);
    curY += 14;
  };

  const addCapturedImage = (id: string, maxH: number = 120) => {
    const imgData = captures[id];
    if (!imgData) return;
    const imgW = CONTENT_W;
    const el = document.getElementById(id);
    let imgH = maxH;
    if (el) {
      const ratio = el.scrollHeight / el.scrollWidth;
      imgH = Math.min(imgW * ratio, maxH);
    }
    ensureSpace(imgH + 4);
    doc.addImage(imgData, "PNG", MARGIN, curY, imgW, imgH);
    curY += imgH + 6;
  };

  const renderDeltaRow = (name: string, valA: number, valB: number, cols: number[]) => {
    const diff = valB - valA;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C.textDark);
    doc.text(name, cols[0], curY);
    doc.text(fmtPct(valA), cols[1], curY);
    doc.text(fmtPct(valB), cols[2], curY);
    if (Math.abs(diff) < 0.1) {
      doc.setTextColor(...C.textMuted);
      doc.text("=", cols[3], curY);
    } else if (diff > 0) {
      doc.setTextColor(...C.green);
      doc.text(`+${diff.toFixed(1)}%`, cols[3], curY);
    } else {
      doc.setTextColor(...C.red);
      doc.text(`${diff.toFixed(1)}%`, cols[3], curY);
    }
    curY += 6;
  };

  // ═══ BLOCO 1 — CAPA ═══
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, PAGE_W, 55, "F");
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("ProdControl", MARGIN, 21);
  doc.setFontSize(14);
  doc.text("Comparação de Relatórios", MARGIN, 33);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Contrato: ${reportA.obra_nome}`, MARGIN, 43);
  doc.text(`Gerado em: ${dateStr}`, PAGE_W - MARGIN, 43, { align: "right" });
  curY = 63;

  // ═══ BLOCO 2 — RESUMO ═══
  sectionHeader("Resumo dos Relatórios");
  if (captures["comp-summary"]) {
    addCapturedImage("comp-summary", 60);
  } else {
    const colW = (CONTENT_W - 6) / 2;
    const drawCard = (label: string, report: SavedReport, x: number) => {
      const s = report.snapshot as any;
      const y0 = curY;
      doc.setFillColor(...C.cardBg);
      doc.roundedRect(x, y0, colW, 38, 2, 2, "F");
      doc.setDrawColor(...C.border);
      doc.roundedRect(x, y0, colW, 38, 2, 2, "S");
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...C.ocean);
      doc.text(label, x + 4, y0 + 7);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...C.textDark);
      doc.text(`Contrato: ${report.obra_nome}`, x + 4, y0 + 14);
      doc.text(`Período: ${periodLabel(report)}`, x + 4, y0 + 20);
      doc.text(`Dias analisados: ${s.summary?.totalDays ?? "—"}`, x + 4, y0 + 32);
      doc.text(`Total de medições: ${s.summary?.totalMeasurements != null ? Math.round(s.summary.totalMeasurements) : "—"}`, x + 4, y0 + 38);
    };
    drawCard("Relatório A", reportA, MARGIN);
    drawCard("Relatório B", reportB, MARGIN + colW + 6);
    curY += 44;
  }

  // ═══ BLOCO 3 — INDICADORES PRINCIPAIS ═══
  sectionHeader("Indicadores Principais");
  const cols = [MARGIN + 2, MARGIN + 95, MARGIN + 120, MARGIN + 150];
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...C.textDark);
  doc.text("Indicador", cols[0], curY);
  doc.text("Relatório A", cols[1], curY);
  doc.text("Relatório B", cols[2], curY);
  doc.text("Diferença", cols[3], curY);
  curY += 3;
  doc.setDrawColor(...C.border);
  doc.line(MARGIN, curY, MARGIN + CONTENT_W, curY);
  curY += 5;

  for (const cat of Object.keys(GROUP_MAP)) {
    renderDeltaRow(cat, groupedA[cat] || 0, groupedB[cat] || 0, cols);
  }
  curY += 4;

  // ═══ BLOCO 4 — COMPARAÇÃO DETALHADA ═══
  sectionHeader("Comparação Detalhada");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...C.textDark);
  doc.text("Categoria", cols[0], curY);
  doc.text("A (%)", cols[1], curY);
  doc.text("B (%)", cols[2], curY);
  doc.text("Diferença", cols[3], curY);
  curY += 3;
  doc.setDrawColor(...C.border);
  doc.line(MARGIN, curY, MARGIN + CONTENT_W, curY);
  curY += 4;

  for (const cat of CANONICAL_ORDER_FULL) {
    const a = prodA[cat] || 0;
    const b = prodB[cat] || 0;
    if (a === 0 && b === 0) continue;
    ensureSpace(7);
    const diff = b - a;
    const color = hexToRgb(DESCRIPTION_COLORS[cat] || "#6B7280");
    doc.setFillColor(...color);
    doc.circle(cols[0] + 1.5, curY - 1, 1.3, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...C.textDark);
    doc.text(cat.length > 55 ? cat.substring(0, 55) + "…" : cat, cols[0] + 5, curY);
    doc.text(fmtPct(a), cols[1], curY);
    doc.text(fmtPct(b), cols[2], curY);
    if (Math.abs(diff) < 0.1) { doc.setTextColor(...C.textMuted); doc.text("=", cols[3], curY); }
    else if (diff > 0) { doc.setTextColor(...C.green); doc.text(`+${diff.toFixed(1)}%`, cols[3], curY); }
    else { doc.setTextColor(...C.red); doc.text(`${diff.toFixed(1)}%`, cols[3], curY); }
    curY += 5.5;
  }
  curY += 4;

  // ═══ BLOCO 5 — GRÁFICOS CAPTURADOS ═══
  const chartSections = [
    { id: "comp-byObra", title: "Visão Geral por Contrato" },
    { id: "comp-bySpecialty", title: "Produtividade por Especialidade" },
    { id: "comp-byHorario", title: "Produtividade por Horário" },
    { id: "comp-byDiaSemana", title: "Produtividade por Dia da Semana" },
    { id: "comp-byMes", title: "Produtividade por Mês" },
    { id: "comp-pareto", title: "Top Causas (Pareto)" },
    { id: "comp-external", title: "Causas Externas de Parada (NPE)" },
  ];

  for (const { id, title } of chartSections) {
    if (!captures[id]) continue;
    newPage();
    sectionHeader(title);
    addCapturedImage(id, MAX_Y - curY - 10);
  }

  // ═══ FOOTER ═══
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textMuted);
    doc.text(`ProdControl — Comparação de Relatórios — ${dateStr}`, MARGIN, PAGE_H - 6);
    doc.text(`Página ${p} de ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 6, { align: "right" });
  }

  const fileName = `Comparacao_Relatorios_${reportA.obra_nome.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`;
  doc.save(fileName);
}
