import jsPDF from "jspdf";
import { format } from "date-fns";

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
  byFunction: Array<{ name: string; total: number; [key: string]: any }>;
  nonprodCausas: Array<{ name: string; value: number; percent: number; cat: string }>;
  externalCausas: Array<{ name: string; value: number; percent: number }>;
  categoryTotals: Array<{ name: string; value: number }>;
  aiAnalysis: string; // Per-chart analysis in format: ===SECTION_NAME===\ntext\n===NEXT===\ntext...
}

type C3 = [number, number, number];
const C = {
  header: [15, 23, 42] as C3,
  primary: [22, 78, 99] as C3,
  green: [22, 163, 74] as C3,
  amber: [245, 158, 11] as C3,
  red: [220, 38, 38] as C3,
  blue: [59, 130, 246] as C3,
  gray: [100, 116, 139] as C3,
  lightGray: [226, 232, 240] as C3,
  bgLight: [248, 250, 252] as C3,
};

const CATEGORY_BAR_COLORS: Record<string, readonly [number, number, number]> = {
  "Produtivo": C.green,
  "Suplementar": C.amber,
  "Não Produtivo": C.red,
  "Não Produtivo Externo": C.blue,
};

const DESC_COLORS: Record<string, [number, number, number]> = {
  "Trabalhando": [22, 163, 74],
  "Planejando": [37, 99, 235],
  "Aguardando Instruções": [245, 158, 11],
  "Assistindo": [124, 58, 237],
  "Aguardando Ferramenta ou Material": [225, 29, 72],
  "Pessoal": [220, 38, 38],
  "Ocioso": [31, 41, 55],
  "Causas Naturais": [56, 189, 248],
  "Vazamento / Interferência da Planta": [99, 102, 241],
  "Aguardando Liberação de PT": [168, 85, 247],
};

const FALLBACK_COLORS: [number, number, number][] = [
  [14, 165, 233], [217, 70, 239], [249, 115, 22], [20, 184, 166],
  [99, 102, 241], [163, 230, 53], [251, 113, 133], [251, 191, 36],
];

function getDescColor(desc: string, idx: number): [number, number, number] {
  return DESC_COLORS[desc] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

function checkPage(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > 275) { doc.addPage(); return 20; }
  return y;
}

function drawSectionTitle(doc: jsPDF, y: number, title: string): number {
  y = checkPage(doc, y, 14);
  doc.setFillColor(...C.primary);
  doc.rect(14, y, 182, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(title, 18, y + 5.5);
  doc.setTextColor(0, 0, 0);
  return y + 12;
}

function drawHorizontalBarChart(
  doc: jsPDF, y: number,
  items: Array<{ label: string; segments: Array<{ value: number; color: [number, number, number]; name: string }> }>,
  maxWidth: number = 110,
  barHeight: number = 7,
  xOffset: number = 60
): number {
  const maxTotal = Math.max(...items.map(i => i.segments.reduce((s, seg) => s + seg.value, 0)), 1);

  for (const item of items) {
    y = checkPage(doc, y, barHeight + 4);

    // Label
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    const labelText = item.label.length > 22 ? item.label.slice(0, 20) + "…" : item.label;
    doc.text(labelText, xOffset - 2, y + barHeight / 2 + 1.5, { align: "right" });

    // Background bar
    doc.setFillColor(...C.lightGray);
    doc.roundedRect(xOffset, y, maxWidth, barHeight, 1, 1, "F");

    // Segments
    const total = item.segments.reduce((s, seg) => s + seg.value, 0);
    let x = xOffset;
    for (const seg of item.segments) {
      if (seg.value <= 0) continue;
      const w = (seg.value / maxTotal) * maxWidth;
      if (w > 0.5) {
        doc.setFillColor(...seg.color);
        doc.rect(x, y, w, barHeight, "F");
      }
      x += w;
    }

    // Total value on the right
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.gray);
    doc.text(String(total), xOffset + maxWidth + 3, y + barHeight / 2 + 1.5);
    doc.setTextColor(0, 0, 0);

    y += barHeight + 2.5;
  }

  return y;
}

function drawStackedPercentBar(
  doc: jsPDF, y: number,
  items: Array<{ label: string; total: number; descs: Record<string, number> }>,
  allDescs: string[],
  maxWidth: number = 110,
  barHeight: number = 7,
  xOffset: number = 60
): number {
  for (const item of items) {
    y = checkPage(doc, y, barHeight + 4);

    const labelText = item.label.length > 22 ? item.label.slice(0, 20) + "…" : item.label;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(labelText, xOffset - 2, y + barHeight / 2 + 1.5, { align: "right" });

    // Background
    doc.setFillColor(...C.lightGray);
    doc.roundedRect(xOffset, y, maxWidth, barHeight, 1, 1, "F");

    // Stacked segments (percentage)
    let x = xOffset;
    for (let di = 0; di < allDescs.length; di++) {
      const desc = allDescs[di];
      const pct = item.descs[desc] || 0;
      if (pct <= 0) continue;
      const w = (pct / 100) * maxWidth;
      if (w > 0.3) {
        doc.setFillColor(...getDescColor(desc, di));
        doc.rect(x, y, w, barHeight, "F");
      }
      x += w;
    }

    // Productivity % on right
    const prodPct = item.descs["Trabalhando"] || 0;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(prodPct >= 70 ? C.green : prodPct >= 50 ? C.amber : C.red));
    doc.text(`${prodPct}%`, xOffset + maxWidth + 3, y + barHeight / 2 + 1.5);
    doc.setTextColor(0, 0, 0);

    y += barHeight + 2.5;
  }

  return y;
}

function drawLegend(doc: jsPDF, y: number, items: Array<{ name: string; color: [number, number, number] }>, maxPerRow = 4): number {
  y = checkPage(doc, y, 10);
  let x = 14;
  let col = 0;
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");

  for (const item of items) {
    if (col >= maxPerRow) { x = 14; y += 5; col = 0; }
    doc.setFillColor(...item.color);
    doc.rect(x, y - 2, 3, 3, "F");
    doc.setTextColor(0, 0, 0);
    const label = item.name.length > 28 ? item.name.slice(0, 26) + "…" : item.name;
    doc.text(label, x + 4.5, y + 0.5);
    x += 46;
    col++;
  }
  return y + 7;
}

function drawAnalysisText(doc: jsPDF, y: number, text: string): number {
  if (!text.trim()) return y;
  y = checkPage(doc, y, 12);

  // Light background box
  doc.setFillColor(...C.bgLight);
  doc.setDrawColor(...C.lightGray);

  const lines = text.split("\n").filter(l => l.trim());
  // Estimate height
  let estimatedH = 0;
  const parsedLines: Array<{ text: string; bold: boolean; bullet: boolean }> = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("• ");
    const isBold = trimmed.startsWith("**") && trimmed.endsWith("**");
    const clean = trimmed.replace(/^[-•]\s*/, "").replace(/\*\*/g, "");
    parsedLines.push({ text: clean, bold: isBold, bullet: isBullet });
    const splitLines = doc.splitTextToSize(clean, 170);
    estimatedH += splitLines.length * 3.8 + 1;
  }

  y = checkPage(doc, y, estimatedH + 8);
  const boxY = y - 2;
  doc.roundedRect(14, boxY, 182, estimatedH + 6, 2, 2, "FD");

  // Accent bar on left
  doc.setFillColor(...C.primary);
  doc.rect(14, boxY, 2.5, estimatedH + 6, "F");

  for (const pl of parsedLines) {
    y = checkPage(doc, y, 6);
    doc.setFontSize(8);
    doc.setFont("helvetica", pl.bold ? "bold" : "normal");
    doc.setTextColor(0, 0, 0);
    const prefix = pl.bullet ? "  •  " : "";
    const splitText = doc.splitTextToSize(prefix + pl.text, 170);
    doc.text(splitText, 19, y);
    y += splitText.length * 3.8 + 1;
  }

  return y + 4;
}

function parsePerChartAnalysis(aiText: string): Record<string, string> {
  const sections: Record<string, string> = {};
  if (!aiText) return sections;

  const regex = /===\s*([A-Z_]+)\s*===\s*\n([\s\S]*?)(?=\n===|$)/g;
  let match;
  while ((match = regex.exec(aiText)) !== null) {
    sections[match[1].trim()] = match[2].trim();
  }

  // Fallback: if no sections found, put everything in GERAL
  if (Object.keys(sections).length === 0) {
    sections["GERAL"] = aiText;
  }

  return sections;
}

export function generatePDFReport(data: PDFReportData) {
  const doc = new jsPDF("p", "mm", "a4");
  const analysis = parsePerChartAnalysis(data.aiAnalysis);

  // ── Header ──
  doc.setFillColor(...C.header);
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("ProdControl — Relatório de Produtividade", 14, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Contrato: ${data.obra} | Período: ${data.periodo}`, 14, 22);
  doc.setFontSize(8);
  doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 28);
  doc.setTextColor(0, 0, 0);

  let y = 40;

  // ── KPIs ──
  y = drawSectionTitle(doc, y, "Indicadores Principais");
  const kpiW = 43;
  const kpis: Array<{ label: string; value: string; color: readonly [number, number, number] }> = [
    { label: "Total de Amostras", value: String(data.totalAmostras), color: C.primary },
    { label: "Produtividade", value: `${data.produtivoPct}%`, color: C.green },
    { label: "Suplementar", value: `${data.suplementar} (${data.suplementarPct}%)`, color: C.amber },
    { label: "Não Produtivo", value: `${data.naoProdutivo} (${data.naoProdutivoPct}%)`, color: C.red },
  ];
  kpis.forEach((kpi, i) => {
    const x = 14 + (kpiW + 3) * i;
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, kpiW, 22, 2, 2, "FD");
    doc.setFillColor(...kpi.color);
    doc.rect(x, y, 3, 22, "F");
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...kpi.color);
    doc.text(kpi.value, x + 8, y + 10);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.gray);
    doc.text(kpi.label, x + 8, y + 17);
  });
  doc.setTextColor(0, 0, 0);
  y += 26;

  doc.setFontSize(7);
  doc.setTextColor(...C.gray);
  doc.text(`Base controlável: ${data.totalControlaveis} amostras (excluindo ${data.externo} NPE — ${data.externoPct}% do total)`, 14, y);
  doc.setTextColor(0, 0, 0);
  y += 6;

  if (analysis["RESUMO"]) {
    y = drawAnalysisText(doc, y, analysis["RESUMO"]);
  }

  // ── 1. Distribuição por Categoria (pie-like horizontal bars) ──
  y = drawSectionTitle(doc, y, "Distribuição por Categoria");
  const catItems = data.categoryTotals.map(c => ({
    label: c.name,
    segments: [{ value: c.value, color: (CATEGORY_BAR_COLORS[c.name] || C.gray) as [number, number, number], name: c.name }],
  }));
  y = drawHorizontalBarChart(doc, y, catItems);
  y = drawLegend(doc, y, data.categoryTotals.map(c => ({
    name: `${c.name}: ${c.value} (${data.totalAmostras > 0 ? ((c.value / data.totalAmostras) * 100).toFixed(1) : 0}%)`,
    color: (CATEGORY_BAR_COLORS[c.name] || C.gray) as [number, number, number],
  })));
  if (analysis["CATEGORIA"]) y = drawAnalysisText(doc, y, analysis["CATEGORIA"]);
  y += 4;

  // Collect all descriptions for stacked charts
  const allDescs = new Set<string>();
  [...data.byObra, ...data.bySpecialty, ...data.byFunction].forEach(item => {
    Object.keys(item).forEach(k => {
      if (k !== "name" && k !== "total" && !k.startsWith("raw_")) allDescs.add(k);
    });
  });
  const descList = Array.from(allDescs);

  // ── 2. Visão Geral por Contrato ──
  if (data.byObra.length > 0) {
    y = drawSectionTitle(doc, y, "Visão Geral por Contrato");
    const obraItems = data.byObra.map(o => ({
      label: o.name,
      total: o.total,
      descs: Object.fromEntries(descList.map(d => [d, o[d] || 0])),
    }));
    y = drawStackedPercentBar(doc, y, obraItems, descList);
    const topDescs = descList.filter(d => data.byObra.some(o => (o[d] || 0) > 5)).slice(0, 8);
    y = drawLegend(doc, y, topDescs.map((d, i) => ({ name: d, color: getDescColor(d, i) })));
    if (analysis["CONTRATO"]) y = drawAnalysisText(doc, y, analysis["CONTRATO"]);
    y += 4;
  }

  // ── 3. Produtividade por Especialidade ──
  if (data.bySpecialty.length > 0) {
    y = drawSectionTitle(doc, y, "Produtividade por Especialidade");
    const espItems = data.bySpecialty.map(s => ({
      label: s.name,
      total: s.total,
      descs: Object.fromEntries(descList.map(d => [d, s[d] || 0])),
    }));
    y = drawStackedPercentBar(doc, y, espItems, descList);
    if (analysis["ESPECIALIDADE"]) y = drawAnalysisText(doc, y, analysis["ESPECIALIDADE"]);
    y += 4;
  }

  // ── 4. Produtividade por Função ──
  if (data.byFunction.length > 0) {
    y = drawSectionTitle(doc, y, "Produtividade por Função");
    const funcItems = data.byFunction.map(f => ({
      label: f.name,
      total: f.total,
      descs: Object.fromEntries(descList.map(d => [d, f[d] || 0])),
    }));
    y = drawStackedPercentBar(doc, y, funcItems, descList);
    if (analysis["FUNCAO"]) y = drawAnalysisText(doc, y, analysis["FUNCAO"]);
    y += 4;
  }

  // ── 5. Causas de Não Produtividade ──
  if (data.nonprodCausas.length > 0) {
    y = drawSectionTitle(doc, y, "Causas de Não Produtividade");
    const npItems = data.nonprodCausas.map(c => ({
      label: c.name,
      segments: [{ value: c.value, color: (c.cat === "Suplementar" ? C.amber : C.red) as [number, number, number], name: c.name }],
    }));
    y = drawHorizontalBarChart(doc, y, npItems);
    y = drawLegend(doc, y, data.nonprodCausas.slice(0, 6).map(c => ({
      name: `${c.name}: ${c.value} (${c.percent}%)`,
      color: (c.cat === "Suplementar" ? C.amber : C.red) as [number, number, number],
    })));
    if (analysis["NAO_PRODUTIVO"]) y = drawAnalysisText(doc, y, analysis["NAO_PRODUTIVO"]);
    y += 4;
  }

  // ── 6. Causas Externas (NPE) ──
  if (data.externalCausas.length > 0) {
    y = drawSectionTitle(doc, y, "Causas Externas (Não Produtivo Externo)");
    const extItems = data.externalCausas.map(c => ({
      label: c.name,
      segments: [{ value: c.value, color: C.blue as [number, number, number], name: c.name }],
    }));
    y = drawHorizontalBarChart(doc, y, extItems);
    y = drawLegend(doc, y, data.externalCausas.slice(0, 6).map(c => ({
      name: `${c.name}: ${c.value} (${c.percent}%)`,
      color: C.blue as [number, number, number],
    })));
    if (analysis["EXTERNO"]) y = drawAnalysisText(doc, y, analysis["EXTERNO"]);
    y += 4;
  }

  // ── 7. Conclusão e Recomendações ──
  if (analysis["RECOMENDACOES"]) {
    y = drawSectionTitle(doc, y, "Conclusão e Recomendações");
    y = drawAnalysisText(doc, y, analysis["RECOMENDACOES"]);
  }

  // Fallback: if analysis was not structured, print it as general
  if (analysis["GERAL"]) {
    y = drawSectionTitle(doc, y, "Análise Completa (IA)");
    y = drawAnalysisText(doc, y, analysis["GERAL"]);
  }

  // ── Footer on all pages ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(`ProdControl — Página ${i} de ${pageCount}`, 14, 290);
    doc.text(format(new Date(), "dd/MM/yyyy HH:mm"), 170, 290);
  }

  doc.save(`relatorio-produtividade_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
}
