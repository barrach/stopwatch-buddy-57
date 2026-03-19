import jsPDF from "jspdf";

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const v = hex.replace("#", "");
  return [parseInt(v.substring(0, 2), 16), parseInt(v.substring(2, 4), 16), parseInt(v.substring(4, 6), 16)];
}

function isLight(rgb: RGB): boolean {
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 180;
}

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
  "Fatores Climáticos e Consequências": "#F97316",
};

const CATEGORY_COLORS: Record<string, string> = {
  Produtivo: "#2563EB",
  Suplementar: "#16A34A",
  "Não Produtivo": "#DC2626",
  "Não Produtivo Externo": "#F97316",
};

function getColor(name: string, fallback = "#6B7280"): string {
  return DESC_COLORS[name] || CATEGORY_COLORS[name] || fallback;
}

// ── Stacked Bar Chart (100% stacked, horizontal bars grouped by X label) ──

export interface StackedBarData {
  [key: string]: any;
  total: number;
}

export function drawStackedBarChart(
  doc: jsPDF,
  data: StackedBarData[],
  xKey: string,
  stackKeys: string[],
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (!data.length) return;

  const axisMarginLeft = 4;
  const axisMarginBottom = 14;
  const chartX = x + axisMarginLeft;
  const chartW = width - axisMarginLeft;
  const chartH = height - axisMarginBottom;
  const chartY = y;

  // Y axis (0-100%)
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.2);
  doc.line(chartX, chartY, chartX, chartY + chartH);
  doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);

  // Grid lines
  doc.setFontSize(6.5);
  doc.setTextColor(156, 163, 175);
  doc.setFont("helvetica", "normal");
  for (const pct of [0, 25, 50, 75, 100]) {
    const ly = chartY + chartH - (pct / 100) * chartH;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.1);
    doc.line(chartX, ly, chartX + chartW, ly);
    doc.text(`${pct}%`, x, ly + 1.5, { align: "left" });
  }

  // Bars
  const barCount = data.length;
  const gap = Math.min(3, chartW / barCount * 0.15);
  const barW = (chartW - gap * (barCount + 1)) / barCount;
  const maxBarW = 22;
  const actualBarW = Math.min(barW, maxBarW);
  const totalBarsW = actualBarW * barCount + gap * (barCount - 1);
  const offsetX = chartX + (chartW - totalBarsW) / 2;

  data.forEach((row, i) => {
    const bx = offsetX + i * (actualBarW + gap);
    let currentY = chartY + chartH;

    // Draw stacked segments bottom-to-top
    for (const key of stackKeys) {
      const pct = Number(row[key] || 0);
      if (pct <= 0) continue;
      const segH = (pct / 100) * chartH;
      const segY = currentY - segH;
      const rgb = hexToRgb(getColor(key));
      doc.setFillColor(...rgb);
      doc.rect(bx, segY, actualBarW, segH, "F");

      // Label inside segment if tall enough
      if (segH > 6 && pct >= 3) {
        const textRgb: RGB = isLight(rgb) ? [31, 41, 55] : [255, 255, 255];
        doc.setTextColor(...textRgb);
        doc.setFontSize(Math.min(6, segH * 0.6));
        doc.setFont("helvetica", "bold");
        doc.text(`${pct.toFixed(1)}%`, bx + actualBarW / 2, segY + segH / 2 + 1, { align: "center" });
      }
      currentY = segY;
    }

    // X label
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    const label = String(row[xKey] || "");
    const truncated = label.length > 14 ? label.substring(0, 13) + "…" : label;
    doc.text(truncated, bx + actualBarW / 2, chartY + chartH + 4, { angle: 30, align: "center" });
  });
}

// ── Donut Chart ──

export interface DonutData {
  name: string;
  value: number;
}

export function drawDonutChart(
  doc: jsPDF,
  data: DonutData[],
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
): void {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return;

  let startAngle = -90; // Start from top

  data.forEach((item) => {
    const pct = item.value / total;
    const sweepAngle = pct * 360;
    const endAngle = startAngle + sweepAngle;
    const rgb = hexToRgb(getColor(item.name));
    doc.setFillColor(...rgb);

    // Draw arc as series of small triangles
    const steps = Math.max(Math.ceil(sweepAngle / 2), 4);
    for (let s = 0; s < steps; s++) {
      const a1 = ((startAngle + (sweepAngle * s) / steps) * Math.PI) / 180;
      const a2 = ((startAngle + (sweepAngle * (s + 1)) / steps) * Math.PI) / 180;

      // Outer arc points
      const ox1 = cx + outerR * Math.cos(a1);
      const oy1 = cy + outerR * Math.sin(a1);
      const ox2 = cx + outerR * Math.cos(a2);
      const oy2 = cy + outerR * Math.sin(a2);
      // Inner arc points
      const ix1 = cx + innerR * Math.cos(a1);
      const iy1 = cy + innerR * Math.sin(a1);
      const ix2 = cx + innerR * Math.cos(a2);
      const iy2 = cy + innerR * Math.sin(a2);

      // Draw as a filled polygon (quad)
      doc.setFillColor(...rgb);
      // Use triangle method for jsPDF compatibility
      const points = [ox1, oy1, ox2, oy2, ix2, iy2, ix1, iy1];
      (doc as any).triangle(ox1, oy1, ox2, oy2, ix1, iy1, "F");
      (doc as any).triangle(ox2, oy2, ix2, iy2, ix1, iy1, "F");
    }

    // Label outside
    if (pct >= 0.03) {
      const midAngle = ((startAngle + sweepAngle / 2) * Math.PI) / 180;
      const labelR = outerR + 6;
      const lx = cx + labelR * Math.cos(midAngle);
      const ly = cy + labelR * Math.sin(midAngle);
      doc.setTextColor(31, 41, 55);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(`${(pct * 100).toFixed(1)}%`, lx, ly + 1, { align: lx > cx ? "left" : "right" });
    }

    startAngle = endAngle;
  });
}

// ── Pareto (Horizontal Bar) ──

export interface ParetoData {
  name: string;
  percent: number;
}

export function drawParetoChart(
  doc: jsPDF,
  data: ParetoData[],
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (!data.length) return;

  const labelW = 55;
  const chartX = x + labelW;
  const chartW = width - labelW - 12;
  const rowH = Math.min(height / data.length, 10);
  const gap = 1.5;

  data.forEach((item, i) => {
    const ry = y + i * (rowH + gap);
    const barW = (item.percent / 100) * chartW;
    const rgb = hexToRgb(getColor(item.name));

    // Label
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    const truncated = item.name.length > 28 ? item.name.substring(0, 27) + "…" : item.name;
    doc.text(truncated, chartX - 2, ry + rowH / 2 + 1, { align: "right" });

    // Bar
    doc.setFillColor(...rgb);
    doc.roundedRect(chartX, ry, Math.max(barW, 1), rowH, 1, 1, "F");

    // Percent label
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(`${item.percent}%`, chartX + barW + 2, ry + rowH / 2 + 1);
  });
}

// ── External Pie (simple filled pie, not donut) ──

export function drawPieChart(
  doc: jsPDF,
  data: Array<{ name: string; value: number; percent: number }>,
  cx: number,
  cy: number,
  radius: number,
): void {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return;

  let startAngle = -90;

  data.forEach((item) => {
    const pct = item.value / total;
    const sweepAngle = pct * 360;
    const rgb = hexToRgb(getColor(item.name));

    const steps = Math.max(Math.ceil(sweepAngle / 2), 4);
    for (let s = 0; s < steps; s++) {
      const a1 = ((startAngle + (sweepAngle * s) / steps) * Math.PI) / 180;
      const a2 = ((startAngle + (sweepAngle * (s + 1)) / steps) * Math.PI) / 180;
      const ox1 = cx + radius * Math.cos(a1);
      const oy1 = cy + radius * Math.sin(a1);
      const ox2 = cx + radius * Math.cos(a2);
      const oy2 = cy + radius * Math.sin(a2);
      doc.setFillColor(...rgb);
      (doc as any).triangle(cx, cy, ox1, oy1, ox2, oy2, "F");
    }

    // Label
    if (pct >= 0.03) {
      const midAngle = ((startAngle + sweepAngle / 2) * Math.PI) / 180;
      const lx = cx + (radius + 6) * Math.cos(midAngle);
      const ly = cy + (radius + 6) * Math.sin(midAngle);
      doc.setTextColor(31, 41, 55);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      const label = `${item.name} ${item.percent}%`;
      const truncated = label.length > 30 ? label.substring(0, 29) + "…" : label;
      doc.text(truncated, lx, ly + 1, { align: lx > cx ? "left" : "right" });
    }

    startAngle += sweepAngle;
  });
}
