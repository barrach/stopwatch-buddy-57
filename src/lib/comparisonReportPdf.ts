import jsPDF from "jspdf";
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

function generateInsights(prodA: Record<string, number>, prodB: Record<string, number>, reportA: SavedReport, reportB: SavedReport): string[] {
  const insights: string[] = [];
  const sA = reportA.snapshot as any;
  const sB = reportB.snapshot as any;

  // Trabalhando
  const trabDiff = (prodB["Trabalhando"] || 0) - (prodA["Trabalhando"] || 0);
  if (Math.abs(trabDiff) >= 1) {
    if (trabDiff > 0) {
      insights.push(`Aumento de +${trabDiff.toFixed(1)}% em "Trabalhando" indica ganho de produtividade no período B.`);
    } else {
      insights.push(`Redução de ${trabDiff.toFixed(1)}% em "Trabalhando" sugere queda de produtividade no período B.`);
    }
  }

  // Deslocamento (sum of transit categories)
  const transitCats = CANONICAL_ORDER_FULL.filter(c => c.startsWith("Transitando"));
  const transitA = transitCats.reduce((s, c) => s + (prodA[c] || 0), 0);
  const transitB = transitCats.reduce((s, c) => s + (prodB[c] || 0), 0);
  const transitDiff = transitB - transitA;
  if (Math.abs(transitDiff) >= 1) {
    if (transitDiff < 0) {
      insights.push(`Redução de ${Math.abs(transitDiff).toFixed(1)}% em deslocamento sugere melhoria logística.`);
    } else {
      insights.push(`Aumento de +${transitDiff.toFixed(1)}% em deslocamento pode indicar problemas de layout ou logística.`);
    }
  }

  // Planejando
  const planDiff = (prodB["Planejando"] || 0) - (prodA["Planejando"] || 0);
  if (Math.abs(planDiff) >= 1) {
    if (planDiff > 0) {
      insights.push(`Aumento de +${planDiff.toFixed(1)}% em "Planejando" pode indicar maior complexidade das atividades.`);
    } else {
      insights.push(`Redução de ${Math.abs(planDiff).toFixed(1)}% em "Planejando" sugere melhor preparação prévia.`);
    }
  }

  // Ocioso
  const ocDiff = (prodB["Ocioso"] || 0) - (prodA["Ocioso"] || 0);
  if (Math.abs(ocDiff) >= 1) {
    if (ocDiff > 0) {
      insights.push(`Aumento de +${ocDiff.toFixed(1)}% em "Ocioso" requer atenção da supervisão.`);
    } else {
      insights.push(`Redução de ${Math.abs(ocDiff).toFixed(1)}% em "Ocioso" é um indicador positivo de engajamento.`);
    }
  }

  // NPE
  const npeCats = ["Interferências Operacionais", "Fatores Climáticos e Consequências"];
  const npeA = npeCats.reduce((s, c) => s + (prodA[c] || 0), 0);
  const npeB = npeCats.reduce((s, c) => s + (prodB[c] || 0), 0);
  const npeDiff = npeB - npeA;
  if (Math.abs(npeDiff) >= 0.5) {
    if (npeDiff > 0) {
      insights.push(`Aumento de +${npeDiff.toFixed(1)}% em causas externas (NPE) no período B.`);
    } else {
      insights.push(`Redução de ${Math.abs(npeDiff).toFixed(1)}% em causas externas (NPE) no período B.`);
    }
  }

  // Measurement volume warning
  const measA = sA?.summary?.totalMeasurements || 0;
  const measB = sB?.summary?.totalMeasurements || 0;
  if (measA > 0 && measB > 0) {
    const ratio = Math.min(measA, measB) / Math.max(measA, measB);
    if (ratio < 0.5) {
      insights.push(`Grande diferença no volume de medições (${Math.round(measA)} vs ${Math.round(measB)}) pode reduzir confiabilidade da comparação.`);
    }
  }

  if (insights.length === 0) {
    insights.push("Os indicadores entre os dois períodos são muito similares, sem variações significativas.");
  }

  return insights;
}

export function generateComparisonPDF(reportA: SavedReport, reportB: SavedReport) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");

  const sA = reportA.snapshot as any;
  const sB = reportB.snapshot as any;
  const prodA = getProductivity(sA);
  const prodB = getProductivity(sB);

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

  // ═══ BLOCO 1 — CABEÇALHO / CAPA ═══
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

  // ═══ BLOCO 2 — RESUMO DOS RELATÓRIOS ═══
  sectionHeader("Resumo dos Relatórios");

  const colW = (CONTENT_W - 6) / 2;

  const drawReportCard = (label: string, report: SavedReport, x: number) => {
    const s = report.snapshot as any;
    const y0 = curY;
    doc.setFillColor(...C.cardBg);
    doc.roundedRect(x, y0, colW, 38, 2, 2, "F");
    doc.setDrawColor(...C.border);
    doc.roundedRect(x, y0, colW, 38, 2, 2, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...C.ocean);
    doc.text(label, x + 4, y0 + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...C.textDark);
    doc.text(`Contrato: ${report.obra_nome}`, x + 4, y0 + 14);
    doc.text(`Período: ${periodLabel(report)}`, x + 4, y0 + 20);
    if (report.especialidade_nome) {
      doc.text(`Especialidade: ${report.especialidade_nome}`, x + 4, y0 + 26);
    }
    doc.text(`Dias analisados: ${s.summary?.totalDays ?? "—"}`, x + 4, y0 + 32);
    doc.text(`Total de medições: ${s.summary?.totalMeasurements != null ? Math.round(s.summary.totalMeasurements) : "—"}`, x + 4, y0 + 38);
  };

  drawReportCard("Relatório A", reportA, MARGIN);
  drawReportCard("Relatório B", reportB, MARGIN + colW + 6);
  curY += 44;

  // ═══ BLOCO 3 — INDICADORES PRINCIPAIS ═══
  sectionHeader("Indicadores Principais");

  const mainCats = ["Trabalhando", "Planejando", "Deslocamento"];
  // Compute "Deslocamento" as sum of transit
  const transitCats = CANONICAL_ORDER_FULL.filter(c => c.startsWith("Transitando"));
  const deslocA = transitCats.reduce((s, c) => s + (prodA[c] || 0), 0);
  const deslocB = transitCats.reduce((s, c) => s + (prodB[c] || 0), 0);

  // Table header
  const cols = [MARGIN + 2, MARGIN + 60, MARGIN + 100, MARGIN + 140];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C.textDark);
  doc.text("Indicador", cols[0], curY);
  doc.text("Relatório A", cols[1], curY);
  doc.text("Relatório B", cols[2], curY);
  doc.text("Diferença", cols[3], curY);
  curY += 3;
  doc.setDrawColor(...C.border);
  doc.line(MARGIN, curY, MARGIN + CONTENT_W, curY);
  curY += 5;

  const renderMainRow = (name: string, valA: number, valB: number) => {
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

  renderMainRow("Trabalhando", prodA["Trabalhando"] || 0, prodB["Trabalhando"] || 0);
  renderMainRow("Planejando", prodA["Planejando"] || 0, prodB["Planejando"] || 0);
  renderMainRow("Deslocamento", deslocA, deslocB);
  curY += 4;

  // ═══ BLOCO 4 — COMPARAÇÃO DETALHADA ═══
  sectionHeader("Comparação Detalhada");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C.textDark);
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

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textDark);
    const displayCat = cat.length > 45 ? cat.substring(0, 45) + "…" : cat;
    doc.text(displayCat, cols[0] + 5, curY);
    doc.text(fmtPct(a), cols[1], curY);
    doc.text(fmtPct(b), cols[2], curY);

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
    curY += 5.5;
  }
  curY += 4;

  // ═══ BLOCO 5 — ANÁLISE VISUAL (BARRAS COMPARATIVAS) ═══
  ensureSpace(20);
  sectionHeader("Análise Visual Comparativa");

  const barMaxW = CONTENT_W - 50;
  const relevantCats = CANONICAL_ORDER_FULL.filter(c => (prodA[c] || 0) > 0.5 || (prodB[c] || 0) > 0.5);

  for (const cat of relevantCats) {
    ensureSpace(16);
    const a = prodA[cat] || 0;
    const b = prodB[cat] || 0;
    const maxVal = Math.max(a, b, 1);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.textDark);
    const displayCat = cat.length > 40 ? cat.substring(0, 40) + "…" : cat;
    doc.text(displayCat, MARGIN + 2, curY);
    curY += 3;

    const barX = MARGIN + 10;
    const color = hexToRgb(DESCRIPTION_COLORS[cat] || "#6B7280");

    // Bar A
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textMuted);
    doc.text("A", MARGIN + 2, curY + 2.5);
    const barWa = (a / maxVal) * barMaxW;
    doc.setFillColor(...color);
    doc.roundedRect(barX, curY, Math.max(barWa, 0.5), 3, 0.8, 0.8, "F");
    doc.setTextColor(...C.textDark);
    doc.text(fmtPct(a), barX + barWa + 2, curY + 2.5);
    curY += 5;

    // Bar B (slightly lighter)
    doc.setTextColor(...C.textMuted);
    doc.text("B", MARGIN + 2, curY + 2.5);
    const barWb = (b / maxVal) * barMaxW;
    doc.setFillColor(Math.min(color[0] + 40, 255), Math.min(color[1] + 40, 255), Math.min(color[2] + 40, 255));
    doc.roundedRect(barX, curY, Math.max(barWb, 0.5), 3, 0.8, 0.8, "F");
    doc.setTextColor(...C.textDark);
    doc.text(fmtPct(b), barX + barWb + 2, curY + 2.5);
    curY += 7;
  }

  // ═══ BLOCO 6 — OBSERVAÇÕES AUTOMÁTICAS ═══
  newPage();
  sectionHeader("Observações e Insights");

  const insights = generateInsights(prodA, prodB, reportA, reportB);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C.textDark);

  for (let i = 0; i < insights.length; i++) {
    ensureSpace(14);
    const text = insights[i];
    const lines = doc.splitTextToSize(text, CONTENT_W - 16);

    // Bullet
    doc.setFillColor(...C.ocean);
    doc.circle(MARGIN + 4, curY + 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.white);
    doc.text(String(i + 1), MARGIN + 3, curY + 2.5);

    // Text
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C.textDark);
    for (let j = 0; j < lines.length; j++) {
      doc.text(lines[j], MARGIN + 10, curY + 2 + j * 4.5);
    }
    curY += lines.length * 4.5 + 5;
  }

  // ═══ FOOTER on all pages ═══
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.textMuted);
    doc.text(`ProdControl — Comparação de Relatórios — ${dateStr}`, MARGIN, PAGE_H - 6);
    doc.text(`Página ${p} de ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 6, { align: "right" });
  }

  const fileName = `Comparacao_Relatorios_${reportA.obra_nome.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`;
  doc.save(fileName);
}
