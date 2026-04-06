import jsPDF from "jspdf";
import { format } from "date-fns";
import type { SavedReport } from "@/components/SavedReportsList";
import { PDF_OCEAN_RGB, wrapTextByWords } from "./pdfTextFormatting";
import { CANONICAL_ORDER_FULL, DESCRIPTION_COLORS } from "./chartConstants";
import { normalizeToHundred } from "./hourlyAverageCalc";

type RGB = [number, number, number];

const C = {
  headerBg: [15, 23, 42] as RGB,
  sectionBg: [...PDF_OCEAN_RGB] as RGB,
  white: [255, 255, 255] as RGB,
  textDark: [31, 41, 55] as RGB,
  textMuted: [107, 114, 128] as RGB,
  border: [209, 213, 219] as RGB,
  cardBg: [248, 250, 252] as RGB,
  blue: [...PDF_OCEAN_RGB] as RGB,
  green: [22, 163, 74] as RGB,
  amber: [245, 158, 11] as RGB,
  red: [220, 38, 38] as RGB,
  orange: [249, 115, 22] as RGB,
};

const DESC_COLORS: Record<string, string> = { ...DESCRIPTION_COLORS };

const STACK_ORDER = [...CANONICAL_ORDER_FULL];
const LEGEND_ORDER = [...CANONICAL_ORDER_FULL].reverse();

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

// ── Normalize snapshot rows to 100% ──
function normalizeRows(rows: any[], xKey: string): any[] {
  if (!rows || rows.length === 0) return [];
  return rows.map(row => {
    const keys = STACK_ORDER.filter(d => row[d] !== undefined && row[d] !== null);
    if (keys.length === 0) return row;
    const rawValues = keys.map(d => Number(row[d]) || 0);
    const sum = rawValues.reduce((s, v) => s + v, 0);
    if (sum <= 0) return row;
    const normalized = normalizeToHundred(keys, rawValues);
    const newRow: any = { [xKey]: row[xKey], total: row.total };
    for (const d of STACK_ORDER) {
      newRow[d] = normalized[d] ?? row[d] ?? 0;
    }
    return newRow;
  });
}

// ── Compute legend from rows ──
function computeLegend(rows: any[]): Array<{ name: string; color: string; percent: number }> {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const desc of STACK_ORDER) {
    let sum = 0;
    for (const row of rows) {
      sum += ((Number(row[desc]) || 0) / 100) * (Number(row.total) || 0);
    }
    totals.set(desc, sum);
    grand += sum;
  }
  return LEGEND_ORDER
    .map(desc => ({
      name: desc,
      color: DESC_COLORS[desc] || "#6B7280",
      percent: grand > 0 ? Number((((totals.get(desc) || 0) / grand) * 100).toFixed(1)) : 0,
    }))
    .filter(item => item.percent > 0);
}

// ═══════════════════════════════════════════════════════════════
// PDF Drawing Helpers
// ═══════════════════════════════════════════════════════════════

class SavedReportPDFBuilder {
  private doc: jsPDF;
  private curY = MARGIN;

  constructor() {
    this.doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  }

  newPage() {
    this.doc.addPage();
    this.curY = MARGIN;
  }

  ensureSpace(h: number) {
    if (this.curY + h > MAX_Y) this.newPage();
  }

  sectionHeader(title: string) {
    this.ensureSpace(14);
    this.doc.setFillColor(...C.sectionBg);
    this.doc.roundedRect(MARGIN, this.curY, CONTENT_W, 10, 1.8, 1.8, "F");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(12);
    this.doc.setTextColor(...C.white);
    this.doc.text(title, MARGIN + 5, this.curY + 6.7);
    this.curY += 12;
  }

  // ── Draw stacked horizontal bar chart ──
  drawStackedBarChart(rows: any[], nameKey: string, chartW: number, chartH: number) {
    if (!rows.length) return 0;
    const startY = this.curY;
    const barH = Math.min(10, (chartH - 10) / rows.length - 2);
    const labelW = Math.min(chartW * 0.28, 50);
    const barAreaW = chartW - labelW - 5;
    const barX = MARGIN + labelW;

    this.doc.setFontSize(7);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const y = startY + i * (barH + 2.5);
      const name = String(row[nameKey] || "");
      const displayName = name.length > 22 ? `${name.substring(0, 22)}…` : name;

      // Label
      this.doc.setFont("helvetica", "normal");
      this.doc.setTextColor(...C.textDark);
      this.doc.text(displayName, MARGIN + 1, y + barH / 2 + 1.2);

      // Stacked segments
      let segX = barX;
      for (const desc of STACK_ORDER) {
        const pct = Number(row[desc]) || 0;
        if (pct <= 0) continue;
        const segW = (pct / 100) * barAreaW;
        const rgb = hexToRgb(DESC_COLORS[desc] || "#6B7280");
        this.doc.setFillColor(...rgb);
        this.doc.rect(segX, y, segW, barH, "F");

        // Show % label on segment if wide enough
        if (segW > 12) {
          this.doc.setFontSize(5.5);
          this.doc.setFont("helvetica", "bold");
          this.doc.setTextColor(255, 255, 255);
          this.doc.text(`${pct.toFixed(1)}%`, segX + segW / 2, y + barH / 2 + 1, { align: "center" });
        }
        segX += segW;
      }
    }

    const totalH = rows.length * (barH + 2.5);
    this.curY = startY + totalH;
    return totalH;
  }

  // ── Draw legend ──
  drawLegend(items: Array<{ name: string; color: string; percent: number }>, x: number, y: number, maxW: number): number {
    let drawY = y;
    this.doc.setFontSize(7.5);
    for (const item of items) {
      if (item.percent <= 0) continue;
      const rgb = hexToRgb(item.color);
      this.doc.setFillColor(...rgb);
      this.doc.roundedRect(x, drawY + 0.5, 3, 3, 0.5, 0.5, "F");

      this.doc.setFont("helvetica", "bold");
      this.doc.setTextColor(...C.textDark);
      const label = `${item.name} — ${fmtPct(item.percent)}`;
      const lines = wrapTextByWords(this.doc, label, maxW - 6);
      this.doc.text(lines[0] || "", x + 4.5, drawY + 3);
      if (lines.length > 1) {
        this.doc.setFont("helvetica", "normal");
        for (let i = 1; i < lines.length; i++) {
          this.doc.text(lines[i], x + 4.5, drawY + 3 + i * 3.5);
        }
      }
      drawY += Math.max(4, lines.length * 3.5) + 1.5;
    }
    return drawY - y;
  }

  // ── Draw Pareto horizontal bars ──
  drawParetoChart(data: any[], chartW: number): number {
    if (!data.length) return 0;
    const startY = this.curY;
    const barH = 7;
    const labelW = Math.min(chartW * 0.45, 80);
    const barAreaW = chartW - labelW - 20;
    const maxPct = Math.max(...data.map(d => Number(d.percent) || 0), 1);

    this.doc.setFontSize(7);
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const y = startY + i * (barH + 3);
      const name = String(item.name || "");
      const displayName = name.length > 35 ? `${name.substring(0, 35)}…` : name;
      const pct = Number(item.percent) || 0;

      // Label
      this.doc.setFont("helvetica", "normal");
      this.doc.setTextColor(...C.textDark);
      this.doc.text(displayName, MARGIN + 1, y + barH / 2 + 1);

      // Bar
      const barW = (pct / maxPct) * barAreaW;
      const color = hexToRgb(DESC_COLORS[item.name] || "#2563EB");
      this.doc.setFillColor(...color);
      this.doc.roundedRect(MARGIN + labelW, y, Math.max(barW, 1), barH, 1, 1, "F");

      // Percentage label
      this.doc.setFont("helvetica", "bold");
      this.doc.setTextColor(...C.textDark);
      this.doc.text(`${pct}%`, MARGIN + labelW + barW + 3, y + barH / 2 + 1);
    }

    const totalH = data.length * (barH + 3);
    this.curY = startY + totalH;
    return totalH;
  }

  // ── Draw pie chart ──
  drawPieChart(data: any[], cx: number, cy: number, radius: number): number {
    if (!data.length) return 0;
    const total = data.reduce((s: number, d: any) => s + (Number(d.value || d.percent) || 0), 0);
    if (total <= 0) return 0;

    let startAngle = -Math.PI / 2;
    for (const item of data) {
      const value = Number(item.value || item.percent) || 0;
      const sliceAngle = (value / total) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;
      const color = hexToRgb(DESC_COLORS[item.name] || "#6B7280");
      this.doc.setFillColor(...color);

      // Draw pie slice as filled polygon
      const points: Array<[number, number]> = [[cx, cy]];
      const steps = Math.max(20, Math.ceil(sliceAngle / 0.05));
      for (let s = 0; s <= steps; s++) {
        const a = startAngle + (sliceAngle * s) / steps;
        points.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
      }

      // Use triangle fan approach
      for (let t = 1; t < points.length - 1; t++) {
        const triPoints = [points[0], points[t], points[t + 1]];
        // @ts-ignore - jsPDF triangle method
        this.doc.triangle(
          triPoints[0][0], triPoints[0][1],
          triPoints[1][0], triPoints[1][1],
          triPoints[2][0], triPoints[2][1],
          "F"
        );
      }

      // Label on slice
      const midAngle = startAngle + sliceAngle / 2;
      const pct = ((value / total) * 100).toFixed(1);
      if (Number(pct) > 3) {
        const labelR = radius * 0.65;
        const lx = cx + labelR * Math.cos(midAngle);
        const ly = cy + labelR * Math.sin(midAngle);
        this.doc.setFontSize(7);
        this.doc.setFont("helvetica", "bold");
        this.doc.setTextColor(255, 255, 255);
        this.doc.text(`${pct}%`, lx, ly, { align: "center" });
      }

      startAngle = endAngle;
    }

    return radius * 2 + 10;
  }

  // ── Full chart block with chart + legend side by side ──
  renderChartBlock(title: string, rows: any[], nameKey: string) {
    if (!rows || rows.length === 0) return;
    const normalized = normalizeRows(rows, nameKey);
    const legend = computeLegend(rows);

    const chartW = CONTENT_W * 0.65;
    const legendW = CONTENT_W * 0.32;
    const chartH = Math.min(normalized.length * 13 + 5, 100);
    const blockH = 12 + Math.max(chartH, legend.length * 6) + 4;
    this.ensureSpace(blockH);

    this.sectionHeader(title);
    const startY = this.curY;

    this.drawStackedBarChart(normalized, nameKey, chartW, chartH);

    // Legend on the right
    this.drawLegend(legend, MARGIN + chartW + 5, startY, legendW);
    this.curY = Math.max(this.curY, startY + chartH) + 4;
  }

  // ── Build the entire PDF ──
  build(report: SavedReport) {
    const s = report.snapshot;
    const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");
    const periodLabel = report.date_mode === "single"
      ? report.data_unica || ""
      : `${report.data_inicio} até ${report.data_fim}`;
    const summ = s.summary || {};

    // ═══ PAGE 1 — COVER + SUMMARY + VISÃO GERAL ═══
    // Cover header
    this.doc.setFillColor(...C.headerBg);
    this.doc.rect(0, 0, PAGE_W, 48, "F");
    this.doc.setTextColor(...C.white);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(22);
    this.doc.text("ProdControl", MARGIN, 18);
    this.doc.setFontSize(13);
    this.doc.text("Relatório de Produtividade", MARGIN, 28);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(10);
    this.doc.text(`Contrato: ${report.obra_nome}`, MARGIN, 38);
    this.doc.text(`Período: ${periodLabel}`, MARGIN, 44);
    this.doc.text(`Gerado em: ${dateStr}`, PAGE_W - MARGIN, 44, { align: "right" });
    this.curY = 54;

    if (report.especialidade_nome) {
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(9);
      this.doc.setTextColor(...C.textMuted);
      this.doc.text(`Especialidade: ${report.especialidade_nome}`, MARGIN, this.curY);
      this.curY += 6;
    }

    // KPI cards
    this.sectionHeader("Resumo do Período");
    const kpis = [
      { label: "Total de Medições", value: String(summ.totalMeasurements != null ? Math.round(summ.totalMeasurements) : "—") },
      { label: "Dias Analisados", value: String(summ.totalDays || "—") },
      { label: "Horários", value: (summ.times || []).join(", ") || "—" },
    ];
    const kpiW = (CONTENT_W - 6) / 3;
    kpis.forEach((kpi, i) => {
      const x = MARGIN + i * (kpiW + 3);
      this.doc.setFillColor(...C.cardBg);
      this.doc.setDrawColor(...C.border);
      this.doc.roundedRect(x, this.curY, kpiW, 18, 1.2, 1.2, "FD");
      this.doc.setFillColor(...C.blue);
      this.doc.rect(x, this.curY, kpiW, 1.5, "F");
      this.doc.setTextColor(...C.blue);
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(13);
      this.doc.text(kpi.value, x + 4, this.curY + 9);
      this.doc.setTextColor(...C.textMuted);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7.5);
      this.doc.text(kpi.label, x + 4, this.curY + 14.5);
    });
    this.curY += 22;

    // Visão Geral por Contrato
    this.renderChartBlock("Visão Geral por Contrato", s.byObra, "name");

    // ═══ PAGE 2 — ESPECIALIDADES ═══
    this.newPage();
    this.renderChartBlock("Produtividade por Especialidade", s.bySpecialty, "name");

    // ═══ PAGE 3 — DISTRIBUIÇÃO TEMPORAL ═══
    this.newPage();
    this.renderChartBlock("Produtividade por Horário", s.byHorario, "time");
    this.curY += 4;
    this.renderChartBlock("Produtividade por Dia da Semana", s.byDiaSemana, "time");

    // ═══ PAGE 4 — CONSOLIDAÇÃO FINAL ═══
    this.newPage();
    this.renderChartBlock("Produtividade por Mês", s.byMes, "time");
    this.curY += 4;

    // Pareto
    if (s.paretoData && s.paretoData.length > 0) {
      const paretoH = 12 + s.paretoData.length * 10 + 4;
      this.ensureSpace(paretoH);
      this.sectionHeader("Top Causas (Pareto)");
      this.drawParetoChart(s.paretoData, CONTENT_W);
      this.curY += 6;
    }

    // NPE pie chart
    if (s.externalCausas && s.externalCausas.length > 0) {
      const pieBlockH = 70;
      this.ensureSpace(pieBlockH);
      this.sectionHeader("Causas Externas de Parada (NPE)");
      const startY = this.curY;
      const pieR = 22;
      const pieCx = MARGIN + pieR + 5;
      const pieCy = this.curY + pieR + 2;
      this.drawPieChart(s.externalCausas, pieCx, pieCy, pieR);

      // Legend beside pie
      const legendX = MARGIN + pieR * 2 + 20;
      const total = s.externalCausas.reduce((sum: number, d: any) => sum + (Number(d.value || d.percent) || 0), 0);
      const pieItems = s.externalCausas.map((d: any) => ({
        name: d.name,
        color: DESC_COLORS[d.name] || "#6B7280",
        percent: total > 0 ? Number(((Number(d.value || d.percent) / total) * 100).toFixed(1)) : 0,
      }));
      this.drawLegend(pieItems, legendX, startY, CONTENT_W - (pieR * 2 + 25));
      this.curY = pieCy + pieR + 6;
    }

    // ═══ PAGE FOOTER ═══
    const totalPages = this.doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      this.doc.setPage(p);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8);
      this.doc.setTextColor(...C.textMuted);
      this.doc.text(`ProdControl — Página ${p} de ${totalPages}`, MARGIN, PAGE_H - 8);
      this.doc.text(dateStr, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
    }

    const fileName = `relatorio-${report.obra_nome.replace(/\s+/g, "-")}-${periodLabel.replace(/\s+/g, "-")}.pdf`;
    this.doc.save(fileName);
  }
}

export function generateSavedReportPDF(report: SavedReport) {
  const builder = new SavedReportPDFBuilder();
  builder.build(report);
}
