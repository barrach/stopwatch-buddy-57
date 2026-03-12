import PptxGenJS from "pptxgenjs";
import { format } from "date-fns";
import type { PDFReportData } from "./pdfReport";
import type { ChartImages } from "./chartCapture";

// ── Theme ──
const T = {
  bg: "0F172A",
  bgLight: "1E293B",
  accent: "3B82F6",
  green: "16A34A",
  amber: "F59E0B",
  red: "DC2626",
  white: "F8FAFC",
  gray: "94A3B8",
};

interface AnalysisSections {
  [key: string]: string;
}

function parseAnalysis(aiText: string): AnalysisSections {
  const sections: AnalysisSections = {};
  if (!aiText) return sections;
  const regex = /===\s*([A-Z_]+)\s*===\s*\n([\s\S]*?)(?=\n===|$)/g;
  let m;
  while ((m = regex.exec(aiText)) !== null) sections[m[1].trim()] = m[2].trim();
  if (!Object.keys(sections).length) sections["GERAL"] = aiText;
  return sections;
}

function makeBg(pptx: PptxGenJS, slide: PptxGenJS.Slide) {
  slide.background = { color: T.bg };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.1, w: 13.33, h: 0.05, fill: { color: T.accent } });
}

function addSlideNumber(slide: PptxGenJS.Slide, num: number, total: number) {
  slide.addText(`${num} / ${total}`, {
    x: 11.5, y: 7.15, w: 1.5, h: 0.25,
    fontSize: 7, color: T.gray, align: "right", fontFace: "Calibri",
  });
}

function addBullets(slide: PptxGenJS.Slide, text: string, opts: { x: number; y: number; w: number; h: number }) {
  if (!text?.trim()) return;
  const lines = text.split("\n").filter((l) => l.trim());
  const bullets: PptxGenJS.TextProps[] = lines.slice(0, 8).map((line) => {
    const trimmed = line.trim().replace(/^[-•]\s*/, "").replace(/\*\*/g, "");
    return {
      text: trimmed,
      options: {
        fontSize: 10,
        color: T.white,
        bullet: { code: "2022" },
        breakType: "none" as const,
        paraSpaceAfter: 5,
      },
    };
  });
  slide.addText(bullets, {
    x: opts.x, y: opts.y, w: opts.w, h: opts.h,
    valign: "top",
    fontFace: "Calibri",
  });
}

/**
 * Adds a chart slide with the chart image taking the main space
 * and analysis bullets on the right side.
 */
function addChartSlide(
  pptx: PptxGenJS,
  slides: PptxGenJS.Slide[],
  title: string,
  chartImage: string | undefined,
  analysisText: string | undefined,
) {
  const slide = pptx.addSlide();
  makeBg(pptx, slide);

  // Title
  slide.addText(title, {
    x: 0.5, y: 0.2, w: 9, h: 0.6,
    fontSize: 22, bold: true, color: T.white, fontFace: "Calibri",
  });
  slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.85, w: 12.3, h: 0.03, fill: { color: T.accent } });

  if (chartImage && analysisText) {
    // Chart on left (large), analysis on right
    slide.addImage({
      data: chartImage,
      x: 0.3, y: 1.1, w: 8.2, h: 5.5,
    });
    addBullets(slide, analysisText, { x: 8.7, y: 1.1, w: 4.3, h: 5.5 });
  } else if (chartImage) {
    // Chart only — centered and large
    slide.addImage({
      data: chartImage,
      x: 0.8, y: 1.1, w: 11.7, h: 5.8,
    });
  } else if (analysisText) {
    addBullets(slide, analysisText, { x: 0.8, y: 1.3, w: 11.7, h: 5.5 });
  }

  slides.push(slide);
}

export function generatePPTXReport(data: PDFReportData) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "ProdControl";
  pptx.subject = "Relatório de Produtividade";
  pptx.title = `Relatório - ${data.obra}`;

  const analysis = parseAnalysis(data.aiAnalysis);
  const images = (data as any).chartImages as ChartImages || {};
  const slides: PptxGenJS.Slide[] = [];

  // ═══════════════════════════════════════════
  // SLIDE 1 — Cover
  // ═══════════════════════════════════════════
  const s1 = pptx.addSlide();
  makeBg(pptx, s1);
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 2, w: 13.33, h: 3.5, fill: { color: T.bgLight } });
  s1.addText("Relatório de Produtividade", {
    x: 0.8, y: 2.3, w: 11.7, h: 1.2,
    fontSize: 36, bold: true, color: T.white, fontFace: "Calibri",
  });
  s1.addText(data.obra || "Todos os Contratos", {
    x: 0.8, y: 3.5, w: 11.7, h: 0.6,
    fontSize: 20, color: T.accent, fontFace: "Calibri",
  });
  s1.addText(`Período: ${data.periodo}`, {
    x: 0.8, y: 4.2, w: 6, h: 0.5,
    fontSize: 14, color: T.gray, fontFace: "Calibri",
  });
  s1.addText(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, {
    x: 0.8, y: 4.7, w: 6, h: 0.4,
    fontSize: 11, color: T.gray, fontFace: "Calibri",
  });
  s1.addText("MEGASTEAM", {
    x: 0.8, y: 6.5, w: 4, h: 0.4,
    fontSize: 14, bold: true, color: T.accent, fontFace: "Calibri",
  });
  slides.push(s1);

  // ═══════════════════════════════════════════
  // SLIDE 2 — Sumário
  // ═══════════════════════════════════════════
  const s2 = pptx.addSlide();
  makeBg(pptx, s2);
  s2.addText("Sumário", {
    x: 0.8, y: 0.3, w: 6, h: 0.8,
    fontSize: 28, bold: true, color: T.white, fontFace: "Calibri",
  });
  s2.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: T.accent } });

  const tocItems = [
    "1. Objetivo",
    "2. Indicadores Principais (KPIs)",
    "3. Visão Geral por Contrato",
    "4. Distribuição por Categoria",
    "5. Top Causas (Pareto)",
    "6. Produtividade por Especialidade",
    "7. Produtividade por Função",
    "8. Causas de Não Produtividade",
    "9. Causas Externas de Parada",
    "10. Produtividade por Horário",
    "11. Produtividade por Dia da Semana",
    "12. Produtividade por Mês",
    "13. Recomendações e Melhorias",
  ];
  s2.addText(
    tocItems.map((t) => ({
      text: t,
      options: { fontSize: 14, color: T.white, paraSpaceAfter: 8, bullet: false } as any,
    })),
    { x: 1.5, y: 1.4, w: 10, h: 5.5, fontFace: "Calibri", valign: "top" },
  );
  slides.push(s2);

  // ═══════════════════════════════════════════
  // SLIDE 3 — Objetivo
  // ═══════════════════════════════════════════
  const s3 = pptx.addSlide();
  makeBg(pptx, s3);
  s3.addText("Objetivo", {
    x: 0.8, y: 0.3, w: 6, h: 0.8,
    fontSize: 28, bold: true, color: T.white, fontFace: "Calibri",
  });
  s3.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: T.accent } });
  s3.addText(
    [
      {
        text: "Análise de produtividade das equipes de campo, com base nas observações coletadas pelo sistema ProdControl.",
        options: { fontSize: 14, color: T.white, paraSpaceAfter: 20 },
      },
      {
        text: "Classificação em 4 categorias:",
        options: { fontSize: 14, color: T.white, paraSpaceAfter: 12 },
      },
      {
        text: "Produtivo — Atividades que geram valor direto",
        options: { fontSize: 13, color: T.green, bullet: { code: "2022" }, paraSpaceAfter: 8 },
      },
      {
        text: "Suplementar — Atividades de apoio necessárias",
        options: { fontSize: 13, color: T.amber, bullet: { code: "2022" }, paraSpaceAfter: 8 },
      },
      {
        text: "Não Produtivo — Tempo improdutivo controlável",
        options: { fontSize: 13, color: T.red, bullet: { code: "2022" }, paraSpaceAfter: 8 },
      },
      {
        text: "Não Produtivo Externo (NPE) — Causas fora do controle",
        options: { fontSize: 13, color: T.accent, bullet: { code: "2022" }, paraSpaceAfter: 16 },
      },
      {
        text: "Produtividade = Produtivo ÷ (Total − NPE) × 100",
        options: { fontSize: 11, color: T.gray, paraSpaceAfter: 6 },
      },
    ],
    { x: 0.8, y: 1.5, w: 11.7, h: 5, fontFace: "Calibri", valign: "top" },
  );
  slides.push(s3);

  // ═══════════════════════════════════════════
  // SLIDE 4 — KPIs
  // ═══════════════════════════════════════════
  const s4 = pptx.addSlide();
  makeBg(pptx, s4);
  s4.addText("Indicadores Principais", {
    x: 0.8, y: 0.3, w: 8, h: 0.8,
    fontSize: 28, bold: true, color: T.white, fontFace: "Calibri",
  });
  s4.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: T.accent } });

  const kpis = [
    { label: "Total de Amostras", value: String(data.totalAmostras), color: T.accent },
    { label: "Produtividade", value: `${data.produtivoPct}%`, color: T.green },
    { label: "Suplementar", value: `${data.suplementarPct}%`, color: T.amber },
    { label: "Não Produtivo", value: `${data.naoProdutivoPct}%`, color: T.red },
  ];

  kpis.forEach((kpi, i) => {
    const x = 0.8 + i * 3.1;
    s4.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.5, w: 2.8, h: 1.8,
      fill: { color: T.bgLight }, rectRadius: 0.1,
    });
    s4.addShape(pptx.ShapeType.rect, { x, y: 1.5, w: 0.08, h: 1.8, fill: { color: kpi.color } });
    s4.addText(kpi.value, {
      x: x + 0.3, y: 1.6, w: 2.2, h: 0.9,
      fontSize: 30, bold: true, color: kpi.color, fontFace: "Calibri", valign: "middle",
    });
    s4.addText(kpi.label, {
      x: x + 0.3, y: 2.5, w: 2.2, h: 0.6,
      fontSize: 11, color: T.gray, fontFace: "Calibri",
    });
  });

  s4.addText(
    `Base controlável: ${data.totalControlaveis} amostras (excl. ${data.externo} NPE — ${data.externoPct}% do total)`,
    { x: 0.8, y: 3.5, w: 11.7, h: 0.4, fontSize: 10, color: T.gray, fontFace: "Calibri" },
  );

  if (analysis["RESUMO"]) {
    addBullets(s4, analysis["RESUMO"], { x: 0.8, y: 4.2, w: 11.7, h: 2.7 });
  }
  slides.push(s4);

  // ═══════════════════════════════════════════
  // Chart slides — each with image + analysis
  // ═══════════════════════════════════════════

  const chartSlides: Array<{
    title: string;
    image: string | undefined;
    section: string;
  }> = [
    { title: "Visão Geral por Contrato", image: images.contrato, section: "CONTRATO" },
    { title: "Distribuição por Categoria", image: images.categoria, section: "CATEGORIA" },
    { title: "Top Causas (Pareto)", image: images.pareto, section: "PARETO" },
    { title: "Produtividade por Especialidade", image: images.especialidade, section: "ESPECIALIDADE" },
    { title: "Produtividade por Função", image: images.funcao, section: "FUNCAO" },
    { title: "Causas de Não Produtividade", image: images.naoprod, section: "NAO_PRODUTIVO" },
    { title: "Causas Externas de Parada (NPE)", image: images.externas, section: "EXTERNO" },
    { title: "Produtividade por Horário", image: images.tempoHorario, section: "HORARIO" },
    { title: "Produtividade por Dia da Semana", image: images.tempoDiaSemana, section: "DIA_SEMANA" },
    { title: "Produtividade por Mês", image: images.tempoMes, section: "MES" },
  ];

  for (const cs of chartSlides) {
    if (cs.image) {
      addChartSlide(pptx, slides, cs.title, cs.image, analysis[cs.section]);
    }
  }

  // ═══════════════════════════════════════════
  // Recomendações
  // ═══════════════════════════════════════════
  const recText = analysis["RECOMENDACOES"] || analysis["GERAL"] || "";
  if (recText) {
    const sRec = pptx.addSlide();
    makeBg(pptx, sRec);
    sRec.addText("Recomendações e Melhorias", {
      x: 0.8, y: 0.3, w: 8, h: 0.8,
      fontSize: 28, bold: true, color: T.white, fontFace: "Calibri",
    });
    sRec.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: T.accent } });
    addBullets(sRec, recText, { x: 0.8, y: 1.5, w: 11.7, h: 5.2 });
    slides.push(sRec);
  }

  // ═══════════════════════════════════════════
  // Thank you
  // ═══════════════════════════════════════════
  const sEnd = pptx.addSlide();
  makeBg(pptx, sEnd);
  sEnd.addShape(pptx.ShapeType.rect, { x: 0, y: 2.5, w: 13.33, h: 2.5, fill: { color: T.bgLight } });
  sEnd.addText("Obrigado!", {
    x: 0, y: 2.7, w: 13.33, h: 1.2,
    fontSize: 40, bold: true, color: T.white, fontFace: "Calibri", align: "center",
  });
  sEnd.addText("Relatório gerado automaticamente pelo ProdControl com análise de IA", {
    x: 0, y: 3.9, w: 13.33, h: 0.6,
    fontSize: 14, color: T.gray, fontFace: "Calibri", align: "center",
  });
  sEnd.addText("MEGASTEAM", {
    x: 0, y: 6, w: 13.33, h: 0.5,
    fontSize: 16, bold: true, color: T.accent, fontFace: "Calibri", align: "center",
  });
  slides.push(sEnd);

  // Add slide numbers
  slides.forEach((s, i) => addSlideNumber(s, i + 1, slides.length));

  pptx.writeFile({
    fileName: `apresentacao-produtividade_${format(new Date(), "yyyy-MM-dd_HHmm")}.pptx`,
  });
}
