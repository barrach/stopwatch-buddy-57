import PptxGenJS from "pptxgenjs";
import { format } from "date-fns";
import type { PDFReportData } from "./pdfReport";

// ── Theme ──
const THEME = {
  bg: "0F172A",
  bgLight: "1E293B",
  bgCard: "1E293B",
  accent: "3B82F6",
  green: "16A34A",
  amber: "F59E0B",
  red: "DC2626",
  blue: "3B82F6",
  white: "F8FAFC",
  gray: "94A3B8",
  darkGray: "334155",
};

const DESC_COLORS: Record<string, string> = {
  Trabalhando: "16A34A",
  Planejando: "2563EB",
  "Aguardando Instruções": "F59E0B",
  Assistindo: "7C3AED",
  "Aguardando Ferramenta ou Material": "E11D48",
  "Transitando no local de trabalho - com ferramenta": "0891B2",
  "Transitando no local de trabalho - sem ferramenta": "D946EF",
  "Transitando fora do local de trabalho - com ferramenta": "0D9488",
  "Transitando fora do local de trabalho - sem ferramenta": "A3631A",
  "Preparando, Organizando": "64748B",
  Pessoal: "DC2626",
  Ocioso: "1F2937",
  Retrabalho: "9F1239",
  Deslocamento: "78350F",
  "Causas Naturais": "38BDF8",
  "Vazamento / Interferência da Planta": "6366F1",
  "Aguardando Liberação de PT": "A855F7",
};

const FALLBACK = ["0EA5E9", "D946EF", "F97316", "14B8A6", "6366F1", "A3E635", "FB7185", "FBBF24"];
const getColor = (desc: string, i: number) => DESC_COLORS[desc] || FALLBACK[i % FALLBACK.length];

const CATEGORY_COLORS: Record<string, string> = {
  Produtivo: THEME.green,
  Suplementar: THEME.amber,
  "Não Produtivo": THEME.red,
  "Não Produtivo Externo": THEME.blue,
};

interface AnalysisSections { [key: string]: string }

function parseAnalysis(aiText: string): AnalysisSections {
  const sections: AnalysisSections = {};
  if (!aiText) return sections;
  const regex = /===\s*([A-Z_]+)\s*===\s*\n([\s\S]*?)(?=\n===|$)/g;
  let m;
  while ((m = regex.exec(aiText)) !== null) sections[m[1].trim()] = m[2].trim();
  if (!Object.keys(sections).length) sections["GERAL"] = aiText;
  return sections;
}

function addBullets(slide: PptxGenJS.Slide, text: string, opts: { x: number; y: number; w: number; h: number }) {
  if (!text?.trim()) return;
  const lines = text.split("\n").filter(l => l.trim());
  const bullets: PptxGenJS.TextProps[] = lines.map(line => {
    const trimmed = line.trim().replace(/^[-•]\s*/, "").replace(/\*\*/g, "");
    return {
      text: trimmed,
      options: {
        fontSize: 12,
        color: THEME.white,
        bullet: { code: "2022" },
        breakType: "none" as const,
        paraSpaceAfter: 6,
      },
    };
  });
  slide.addText(bullets, {
    x: opts.x, y: opts.y, w: opts.w, h: opts.h,
    valign: "top",
    fontFace: "Calibri",
  });
}

function addSlideNumber(slide: PptxGenJS.Slide, num: number, total: number) {
  slide.addText(`${num} / ${total}`, {
    x: 8.5, y: 5.2, w: 1.2, h: 0.3,
    fontSize: 8, color: THEME.gray, align: "right", fontFace: "Calibri",
  });
}

// ── Horizontal stacked bar chart data builder ──
function buildStackedBarData(
  items: Array<{ name: string; total: number; [k: string]: any }>,
  descs: string[]
): { labels: string[]; series: Array<{ name: string; color: string; values: number[] }> } {
  const labels = items.map(i => i.name.length > 20 ? i.name.slice(0, 18) + "…" : i.name);
  const series = descs
    .filter(d => items.some(i => (i[d] || 0) > 0))
    .slice(0, 12)
    .map((d, idx) => ({
      name: d.length > 25 ? d.slice(0, 23) + "…" : d,
      color: getColor(d, idx),
      values: items.map(i => i[d] || 0),
    }));
  return { labels, series };
}

export function generatePPTXReport(data: PDFReportData) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pptx.author = "ProdControl";
  pptx.subject = "Relatório de Produtividade";
  pptx.title = `Relatório - ${data.obra}`;

  const analysis = parseAnalysis(data.aiAnalysis);
  const slides: PptxGenJS.Slide[] = [];
  
  const makeBg = (slide: PptxGenJS.Slide) => {
    slide.background = { color: THEME.bg };
    // Accent line at bottom
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.1, w: 13.33, h: 0.05, fill: { color: THEME.accent } });
  };

  // ═══════════════════════════════════════════
  // SLIDE 1 — Cover
  // ═══════════════════════════════════════════
  const s1 = pptx.addSlide();
  makeBg(s1);
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 2, w: 13.33, h: 3.5, fill: { color: THEME.bgLight } });
  s1.addText("Relatório de Produtividade", {
    x: 0.8, y: 2.3, w: 11.7, h: 1.2,
    fontSize: 36, bold: true, color: THEME.white, fontFace: "Calibri",
  });
  s1.addText(data.obra || "Todos os Contratos", {
    x: 0.8, y: 3.5, w: 11.7, h: 0.6,
    fontSize: 20, color: THEME.accent, fontFace: "Calibri",
  });
  s1.addText(`Período: ${data.periodo}`, {
    x: 0.8, y: 4.2, w: 6, h: 0.5,
    fontSize: 14, color: THEME.gray, fontFace: "Calibri",
  });
  s1.addText(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, {
    x: 0.8, y: 4.7, w: 6, h: 0.4,
    fontSize: 11, color: THEME.gray, fontFace: "Calibri",
  });
  s1.addText("MEGASTEAM", {
    x: 0.8, y: 6.5, w: 4, h: 0.4,
    fontSize: 14, bold: true, color: THEME.accent, fontFace: "Calibri",
  });
  slides.push(s1);

  // ═══════════════════════════════════════════
  // SLIDE 2 — Sumário
  // ═══════════════════════════════════════════
  const s2 = pptx.addSlide();
  makeBg(s2);
  s2.addText("Sumário", { x: 0.8, y: 0.3, w: 6, h: 0.8, fontSize: 28, bold: true, color: THEME.white, fontFace: "Calibri" });
  const tocItems = [
    "1. Objetivo",
    "2. Indicadores Principais (KPIs)",
    "3. Distribuição por Categoria",
    "4. Produtividade por Contrato",
    "5. Produtividade por Especialidade",
    "6. Produtividade por Função",
    "7. Causas de Não Produtividade",
    "8. Causas Externas (NPE)",
    "9. Recomendações e Melhorias",
  ];
  s2.addText(tocItems.map(t => ({ text: t, options: { fontSize: 16, color: THEME.white, paraSpaceAfter: 10, bullet: false } as any })), {
    x: 1.5, y: 1.3, w: 10, h: 5.5, fontFace: "Calibri", valign: "top",
  });
  slides.push(s2);

  // ═══════════════════════════════════════════
  // SLIDE 3 — Objetivo
  // ═══════════════════════════════════════════
  const s3 = pptx.addSlide();
  makeBg(s3);
  s3.addText("Objetivo", { x: 0.8, y: 0.3, w: 6, h: 0.8, fontSize: 28, bold: true, color: THEME.white, fontFace: "Calibri" });
  s3.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.3, w: 11.7, h: 0.03, fill: { color: THEME.accent } });
  s3.addText([
    { text: "Este relatório apresenta a análise de produtividade das equipes de campo, com base nas observações coletadas pelo sistema ProdControl.", options: { fontSize: 14, color: THEME.white, paraSpaceAfter: 14 } },
    { text: "Os dados são classificados em 4 categorias:", options: { fontSize: 14, color: THEME.white, paraSpaceAfter: 8 } },
    { text: "Produtivo — Atividades que geram valor direto", options: { fontSize: 13, color: THEME.green, bullet: { code: "2022" }, paraSpaceAfter: 6 } },
    { text: "Suplementar — Atividades de apoio necessárias", options: { fontSize: 13, color: THEME.amber, bullet: { code: "2022" }, paraSpaceAfter: 6 } },
    { text: "Não Produtivo — Tempo improdutivo controlável", options: { fontSize: 13, color: THEME.red, bullet: { code: "2022" }, paraSpaceAfter: 6 } },
    { text: "Não Produtivo Externo (NPE) — Causas fora do controle da equipe", options: { fontSize: 13, color: THEME.blue, bullet: { code: "2022" }, paraSpaceAfter: 6 } },
    { text: `\nA produtividade é calculada excluindo os registros de NPE da base: Produtividade = Produtivo ÷ (Total − NPE) × 100`, options: { fontSize: 12, color: THEME.gray, paraSpaceAfter: 10 } },
  ], { x: 0.8, y: 1.6, w: 11.7, h: 5, fontFace: "Calibri", valign: "top" });
  slides.push(s3);

  // ═══════════════════════════════════════════
  // SLIDE 4 — KPIs
  // ═══════════════════════════════════════════
  const s4 = pptx.addSlide();
  makeBg(s4);
  s4.addText("Indicadores Principais", { x: 0.8, y: 0.3, w: 8, h: 0.8, fontSize: 28, bold: true, color: THEME.white, fontFace: "Calibri" });
  s4.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: THEME.accent } });

  const kpis = [
    { label: "Total de Amostras", value: String(data.totalAmostras), color: THEME.accent },
    { label: "Produtividade", value: `${data.produtivoPct}%`, color: THEME.green },
    { label: "Suplementar", value: `${data.suplementarPct}%`, color: THEME.amber },
    { label: "Não Produtivo", value: `${data.naoProdutivoPct}%`, color: THEME.red },
  ];
  kpis.forEach((kpi, i) => {
    const x = 0.8 + i * 3.1;
    s4.addShape(pptx.ShapeType.roundRect, { x, y: 1.5, w: 2.8, h: 1.8, fill: { color: THEME.bgCard }, rectRadius: 0.1 });
    s4.addShape(pptx.ShapeType.rect, { x, y: 1.5, w: 0.08, h: 1.8, fill: { color: kpi.color } });
    s4.addText(kpi.value, { x: x + 0.3, y: 1.6, w: 2.2, h: 0.9, fontSize: 30, bold: true, color: kpi.color, fontFace: "Calibri", valign: "middle" });
    s4.addText(kpi.label, { x: x + 0.3, y: 2.5, w: 2.2, h: 0.6, fontSize: 11, color: THEME.gray, fontFace: "Calibri" });
  });

  s4.addText(`Base controlável: ${data.totalControlaveis} amostras (excl. ${data.externo} NPE — ${data.externoPct}% do total)`, {
    x: 0.8, y: 3.6, w: 11.7, h: 0.4, fontSize: 10, color: THEME.gray, fontFace: "Calibri",
  });

  if (analysis["RESUMO"]) {
    addBullets(s4, analysis["RESUMO"], { x: 0.8, y: 4.2, w: 11.7, h: 2.7 });
  }
  slides.push(s4);

  // ═══════════════════════════════════════════
  // SLIDE 5 — Distribuição por Categoria (pie chart)
  // ═══════════════════════════════════════════
  const s5 = pptx.addSlide();
  makeBg(s5);
  s5.addText("Distribuição por Categoria", { x: 0.8, y: 0.3, w: 8, h: 0.8, fontSize: 28, bold: true, color: THEME.white, fontFace: "Calibri" });
  s5.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: THEME.accent } });

  const pieData = data.categoryTotals.map(c => ({
    name: c.name,
    labels: [`${c.name}\n${data.totalAmostras > 0 ? ((c.value / data.totalAmostras) * 100).toFixed(1) : 0}%`],
    values: [c.value],
  }));
  
  if (pieData.length > 0) {
    s5.addChart(pptx.ChartType.doughnut, pieData, {
      x: 0.5, y: 1.3, w: 6, h: 5,
      showLegend: true,
      legendPos: "b",
      legendFontSize: 10,
      legendColor: THEME.gray,
      dataLabelPosition: "outEnd",
      dataLabelFontSize: 11,
      dataLabelColor: THEME.white,
      showPercent: true,
      showValue: false,
      showTitle: false,
      chartColors: data.categoryTotals.map(c => CATEGORY_COLORS[c.name] || THEME.gray),
    } as any);
  }

  if (analysis["CATEGORIA"]) {
    addBullets(s5, analysis["CATEGORIA"], { x: 6.8, y: 1.3, w: 5.8, h: 5 });
  }
  slides.push(s5);

  // ═══════════════════════════════════════════
  // SLIDE 6 — Por Contrato
  // ═══════════════════════════════════════════
  if (data.byObra.length > 0) {
    const allDescs = new Set<string>();
    data.byObra.forEach(o => Object.keys(o).forEach(k => { if (k !== "name" && k !== "total" && !k.startsWith("raw_")) allDescs.add(k); }));
    const descs = Array.from(allDescs);
    const { labels, series } = buildStackedBarData(data.byObra, descs);

    const s6 = pptx.addSlide();
    makeBg(s6);
    s6.addText("Produtividade por Contrato", { x: 0.8, y: 0.3, w: 8, h: 0.8, fontSize: 28, bold: true, color: THEME.white, fontFace: "Calibri" });
    s6.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: THEME.accent } });

    if (series.length > 0) {
      const chartData = series.map(s => ({ name: s.name, labels, values: s.values }));
      s6.addChart(pptx.ChartType.bar, chartData, {
        x: 0.3, y: 1.3, w: 7.5, h: 5,
        barDir: "bar",
        barGrouping: "stacked",
        showLegend: true,
        legendPos: "b",
        legendFontSize: 7,
        legendColor: THEME.gray,
        catAxisLabelColor: THEME.white,
        catAxisLabelFontSize: 9,
        valAxisLabelColor: THEME.gray,
        valAxisLabelFontSize: 8,
        valAxisMaxVal: 100,
        showValue: false,
        chartColors: series.map(s => s.color),
      } as any);
    }

    if (analysis["CONTRATO"]) {
      addBullets(s6, analysis["CONTRATO"], { x: 8, y: 1.3, w: 4.8, h: 5 });
    }
    slides.push(s6);
  }

  // ═══════════════════════════════════════════
  // SLIDE 7 — Por Especialidade
  // ═══════════════════════════════════════════
  if (data.bySpecialty.length > 0) {
    const allDescs = new Set<string>();
    data.bySpecialty.forEach(o => Object.keys(o).forEach(k => { if (k !== "name" && k !== "total" && !k.startsWith("raw_")) allDescs.add(k); }));
    const descs = Array.from(allDescs);
    const { labels, series } = buildStackedBarData(data.bySpecialty, descs);

    const s7 = pptx.addSlide();
    makeBg(s7);
    s7.addText("Produtividade por Especialidade", { x: 0.8, y: 0.3, w: 8, h: 0.8, fontSize: 28, bold: true, color: THEME.white, fontFace: "Calibri" });
    s7.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: THEME.accent } });

    if (series.length > 0) {
      const chartData = series.map(s => ({ name: s.name, labels, values: s.values }));
      s7.addChart(pptx.ChartType.bar, chartData, {
        x: 0.3, y: 1.3, w: 7.5, h: 5,
        barDir: "bar",
        barGrouping: "stacked",
        showLegend: true,
        legendPos: "b",
        legendFontSize: 7,
        legendColor: THEME.gray,
        catAxisLabelColor: THEME.white,
        catAxisLabelFontSize: 9,
        valAxisLabelColor: THEME.gray,
        valAxisLabelFontSize: 8,
        valAxisMaxVal: 100,
        showValue: false,
        chartColors: series.map(s => s.color),
      } as any);
    }

    if (analysis["ESPECIALIDADE"]) {
      addBullets(s7, analysis["ESPECIALIDADE"], { x: 8, y: 1.3, w: 4.8, h: 5 });
    }
    slides.push(s7);
  }

  // ═══════════════════════════════════════════
  // SLIDE 8 — Por Função
  // ═══════════════════════════════════════════
  if (data.byFunction.length > 0) {
    const allDescs = new Set<string>();
    data.byFunction.forEach(o => Object.keys(o).forEach(k => { if (k !== "name" && k !== "total" && !k.startsWith("raw_")) allDescs.add(k); }));
    const descs = Array.from(allDescs);
    const { labels, series } = buildStackedBarData(data.byFunction, descs);

    const s8 = pptx.addSlide();
    makeBg(s8);
    s8.addText("Produtividade por Função", { x: 0.8, y: 0.3, w: 8, h: 0.8, fontSize: 28, bold: true, color: THEME.white, fontFace: "Calibri" });
    s8.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: THEME.accent } });

    if (series.length > 0) {
      const chartData = series.map(s => ({ name: s.name, labels, values: s.values }));
      s8.addChart(pptx.ChartType.bar, chartData, {
        x: 0.3, y: 1.3, w: 7.5, h: 5,
        barDir: "bar",
        barGrouping: "stacked",
        showLegend: true,
        legendPos: "b",
        legendFontSize: 7,
        legendColor: THEME.gray,
        catAxisLabelColor: THEME.white,
        catAxisLabelFontSize: 9,
        valAxisLabelColor: THEME.gray,
        valAxisLabelFontSize: 8,
        valAxisMaxVal: 100,
        showValue: false,
        chartColors: series.map(s => s.color),
      } as any);
    }

    if (analysis["FUNCAO"]) {
      addBullets(s8, analysis["FUNCAO"], { x: 8, y: 1.3, w: 4.8, h: 5 });
    }
    slides.push(s8);
  }

  // ═══════════════════════════════════════════
  // SLIDE 9 — Causas de Não Produtividade
  // ═══════════════════════════════════════════
  if (data.nonprodCausas.length > 0) {
    const s9 = pptx.addSlide();
    makeBg(s9);
    s9.addText("Causas de Não Produtividade", { x: 0.8, y: 0.3, w: 8, h: 0.8, fontSize: 28, bold: true, color: THEME.white, fontFace: "Calibri" });
    s9.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: THEME.accent } });

    const npData = data.nonprodCausas.slice(0, 8);
    const chartData = [{
      name: "Amostras",
      labels: npData.map(c => c.name.length > 25 ? c.name.slice(0, 23) + "…" : c.name),
      values: npData.map(c => c.value),
    }];

    s9.addChart(pptx.charts.BAR, chartData, {
      x: 0.3, y: 1.3, w: 7.5, h: 5,
      barDir: "bar",
      showLegend: false,
      catAxisLabelColor: THEME.white,
      catAxisLabelFontSize: 9,
      valAxisLabelColor: THEME.gray,
      valAxisLabelFontSize: 8,
      showValue: true,
      dataLabelColor: THEME.white,
      dataLabelFontSize: 9,
      chartColors: npData.map(c => c.cat === "Suplementar" ? THEME.amber : THEME.red),
    } as any);

    if (analysis["NAO_PRODUTIVO"]) {
      addBullets(s9, analysis["NAO_PRODUTIVO"], { x: 8, y: 1.3, w: 4.8, h: 5 });
    }
    slides.push(s9);
  }

  // ═══════════════════════════════════════════
  // SLIDE 10 — Causas Externas
  // ═══════════════════════════════════════════
  if (data.externalCausas.length > 0) {
    const s10 = pptx.addSlide();
    makeBg(s10);
    s10.addText("Causas Externas (NPE)", { x: 0.8, y: 0.3, w: 8, h: 0.8, fontSize: 28, bold: true, color: THEME.white, fontFace: "Calibri" });
    s10.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: THEME.accent } });

    const extData = data.externalCausas.slice(0, 8);
    const chartData = [{
      name: "Amostras",
      labels: extData.map(c => c.name.length > 25 ? c.name.slice(0, 23) + "…" : c.name),
      values: extData.map(c => c.value),
    }];

    s10.addChart(pptx.charts.BAR, chartData, {
      x: 0.3, y: 1.3, w: 7.5, h: 5,
      barDir: "bar",
      showLegend: false,
      catAxisLabelColor: THEME.white,
      catAxisLabelFontSize: 9,
      valAxisLabelColor: THEME.gray,
      valAxisLabelFontSize: 8,
      showValue: true,
      dataLabelColor: THEME.white,
      dataLabelFontSize: 9,
      chartColors: [THEME.blue],
    } as any);

    if (analysis["EXTERNO"]) {
      addBullets(s10, analysis["EXTERNO"], { x: 8, y: 1.3, w: 4.8, h: 5 });
    }
    slides.push(s10);
  }

  // ═══════════════════════════════════════════
  // SLIDE 11 — Recomendações
  // ═══════════════════════════════════════════
  const recText = analysis["RECOMENDACOES"] || analysis["GERAL"] || "";
  if (recText) {
    const sRec = pptx.addSlide();
    makeBg(sRec);
    sRec.addText("Recomendações e Melhorias", { x: 0.8, y: 0.3, w: 8, h: 0.8, fontSize: 28, bold: true, color: THEME.white, fontFace: "Calibri" });
    sRec.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: THEME.accent } });
    addBullets(sRec, recText, { x: 0.8, y: 1.5, w: 11.7, h: 5.2 });
    slides.push(sRec);
  }

  // ═══════════════════════════════════════════
  // SLIDE 12 — Thank you
  // ═══════════════════════════════════════════
  const sEnd = pptx.addSlide();
  makeBg(sEnd);
  sEnd.addShape(pptx.ShapeType.rect, { x: 0, y: 2.5, w: 13.33, h: 2.5, fill: { color: THEME.bgLight } });
  sEnd.addText("Obrigado!", {
    x: 0, y: 2.7, w: 13.33, h: 1.2,
    fontSize: 40, bold: true, color: THEME.white, fontFace: "Calibri", align: "center",
  });
  sEnd.addText("Relatório gerado automaticamente pelo ProdControl com análise de IA", {
    x: 0, y: 3.9, w: 13.33, h: 0.6,
    fontSize: 14, color: THEME.gray, fontFace: "Calibri", align: "center",
  });
  sEnd.addText("MEGASTEAM", {
    x: 0, y: 6, w: 13.33, h: 0.5,
    fontSize: 16, bold: true, color: THEME.accent, fontFace: "Calibri", align: "center",
  });
  slides.push(sEnd);

  // Add slide numbers
  slides.forEach((s, i) => addSlideNumber(s, i + 1, slides.length));

  pptx.writeFile({ fileName: `apresentacao-produtividade_${format(new Date(), "yyyy-MM-dd_HHmm")}.pptx` });
}
