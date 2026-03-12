import PptxGenJS from "pptxgenjs";
import { format } from "date-fns";
import type { PDFReportData } from "./pdfReport";
import type { ChartImages, ChartDimensions } from "./chartCapture";

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

interface AnalysisSections { [key: string]: string; }

function parseAnalysis(aiText: string): AnalysisSections {
  const sections: AnalysisSections = {};
  if (!aiText) return sections;
  const regex = /===\s*([A-Z_]+)\s*===\s*\n([\s\S]*?)(?=\n===|$)/g;
  let m;
  while ((m = regex.exec(aiText)) !== null) sections[m[1].trim()] = m[2].trim();
  if (!Object.keys(sections).length) sections["GERAL"] = aiText;
  return sections;
}

interface RecBlock {
  title: string;
  problema: string;
  causa: string;
  acao: string;
  responsavel: string;
  impacto: string;
}

function parseRecommendationBlocks(text: string): RecBlock[] {
  const blocks: RecBlock[] = [];
  // Split by "Problema N" pattern (e.g. "Problema 1 — Soldagem" or "**Problema 1**")
  const parts = text.split(/(?:^|\n)\s*(?:\*\*)?Problema\s*\d+\s*(?:[-—:]\s*)?/i).filter(p => p.trim());
  for (const part of parts) {
    const lines = part.split("\n").map(l => l.trim()).filter(Boolean);
    const block: RecBlock = { title: "", problema: "", causa: "", acao: "", responsavel: "", impacto: "" };
    // First line or text before first field is the title
    let currentField = "title";
    for (const line of lines) {
      const clean = line.replace(/\*\*/g, "").replace(/^[-•]\s*/, "");
      const lower = clean.toLowerCase();
      if (lower.startsWith("problema:") || lower.startsWith("problema :")) {
        block.problema = clean.replace(/^[^:]+:\s*/, "");
        currentField = "problema";
      } else if (lower.startsWith("causa prov") || lower.startsWith("causa:")) {
        block.causa = clean.replace(/^[^:]+:\s*/, "");
        currentField = "causa";
      } else if (lower.startsWith("ação recomendada") || lower.startsWith("acao recomendada") || lower.startsWith("ação:")) {
        block.acao = clean.replace(/^[^:]+:\s*/, "");
        currentField = "acao";
      } else if (lower.startsWith("responsável") || lower.startsWith("responsavel")) {
        block.responsavel = clean.replace(/^[^:]+:\s*/, "");
        currentField = "responsavel";
      } else if (lower.startsWith("impacto esperado") || lower.startsWith("impacto:")) {
        block.impacto = clean.replace(/^[^:]+:\s*/, "");
        currentField = "impacto";
      } else if (!block.title && currentField === "title") {
        block.title = clean.replace(/\*\*/g, "").replace(/^[-—]\s*/, "").trim();
      } else {
        // Append to current field
        if (currentField === "problema") block.problema += " " + clean;
        else if (currentField === "causa") block.causa += " " + clean;
        else if (currentField === "acao") block.acao += " " + clean;
        else if (currentField === "responsavel") block.responsavel += " " + clean;
        else if (currentField === "impacto") block.impacto += " " + clean;
      }
    }
    if (block.title || block.problema) {
      if (!block.title) block.title = block.problema.substring(0, 40);
      blocks.push(block);
    }
  }
  return blocks;
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
  const bullets: PptxGenJS.TextProps[] = lines.slice(0, 12).map((line) => {
    const trimmed = line.trim().replace(/^[-•]\s*/, "").replace(/\*\*/g, "");
    return {
      text: trimmed,
      options: {
        fontSize: 9,
        color: T.white,
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

/**
 * Adds a chart slide — one chart per slide, chart centered at 80% width,
 * with title at top (28px bold). Analysis text below if present.
 */
function addChartSlide(
  pptx: PptxGenJS,
  slides: PptxGenJS.Slide[],
  title: string,
  chartImage: string | undefined,
  analysisText: string | undefined,
  dim?: { width: number; height: number },
) {
  const slide = pptx.addSlide();
  makeBg(pptx, slide);

  // Title — 28px bold at top, tight spacing
  slide.addText(title, {
    x: 0.5, y: 0.15, w: 12.3, h: 0.5,
    fontSize: 28, bold: true, color: T.white, fontFace: "Calibri",
  });
  slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.68, w: 12.3, h: 0.03, fill: { color: T.accent } });

  // Calculate chart dimensions — 80% of slide width, proportional height
  const slideW = 13.33;
  const chartW = slideW * 0.80; // ~10.66 inches
  const chartMaxH = analysisText ? 4.2 : 5.5;
  let chartH: number;

  if (dim && dim.width > 0) {
    const aspectRatio = dim.height / dim.width;
    chartH = chartW * aspectRatio;
    if (chartH > chartMaxH) {
      chartH = chartMaxH;
    }
  } else {
    chartH = chartMaxH;
  }

  if (chartImage) {
    // Center horizontally, tight to title
    const chartX = (slideW - chartW) / 2;
    const chartY = 0.85; // closer to title bar
    slide.addImage({
      data: chartImage,
      x: chartX, y: chartY, w: chartW, h: chartH,
    });

    // Analysis below chart if present
    if (analysisText) {
      const bulletY = chartY + chartH + 0.15;
      const bulletH = 7.0 - bulletY;
      if (bulletH > 0.5) {
        addBullets(slide, analysisText, { x: 0.8, y: bulletY, w: 11.7, h: bulletH });
      }
    }
  } else if (analysisText) {
    addBullets(slide, analysisText, { x: 0.8, y: 1.2, w: 11.7, h: 5.5 });
  }

  slides.push(slide);
}

export function generatePPTXReport(data: PDFReportData) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "MEGASTEAM";
  pptx.subject = "Relatório de Produtividade";
  pptx.title = `Relatório - ${data.obra}`;

  const analysis = parseAnalysis(data.aiAnalysis);
  const images = (data as any).chartImages as ChartImages || {};
  const dims = (data as any).chartDimensions as ChartDimensions || {};
  const slides: PptxGenJS.Slide[] = [];

  // SLIDE 1 — Cover
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

  // SLIDE 2 — Sumário
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
    "5. Top Causas — Pareto por Categorias",
    "6. Top Causas — Pareto por Especialidades",
    "7. Top Causas — Pareto por Funções",
    "8. Produtividade por Especialidade",
    "9. Produtividade por Função",
    "10. Causas de Não Produtividade",
    "11. Causas Externas de Parada (NPE)",
    "12. Produtividade por Horário",
    "13. Produtividade por Dia da Semana",
    "14. Produtividade por Mês",
    "15. Conclusões e Recomendações",
  ];
  s2.addText(
    tocItems.map((t) => ({
      text: t + "\n",
      options: { fontSize: 14, color: T.white, paraSpaceBefore: 4, paraSpaceAfter: 10, bullet: false, lineSpacing: 20 } as any,
    })),
    { x: 1.2, y: 1.4, w: 10.5, h: 5.5, fontFace: "Calibri", valign: "top" },
  );
  slides.push(s2);

  // SLIDE 3 — Objetivo
  const s3 = pptx.addSlide();
  makeBg(pptx, s3);
  s3.addText("Objetivo", {
    x: 0.8, y: 0.3, w: 6, h: 0.8,
    fontSize: 28, bold: true, color: T.white, fontFace: "Calibri",
  });
  s3.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: T.accent } });
  s3.addText(
    [
      { text: "Análise de produtividade das equipes de campo, com base nas observações coletadas pelo sistema ProdControl.", options: { fontSize: 14, color: T.white, paraSpaceAfter: 20 } },
      { text: "Classificação em 4 categorias:", options: { fontSize: 14, color: T.white, paraSpaceAfter: 12 } },
      { text: "Produtivo — Atividades que geram valor direto", options: { fontSize: 13, color: T.green, bullet: { code: "2022" }, paraSpaceAfter: 8 } },
      { text: "Suplementar — Atividades de apoio necessárias", options: { fontSize: 13, color: T.amber, bullet: { code: "2022" }, paraSpaceAfter: 8 } },
      { text: "Não Produtivo — Tempo improdutivo controlável", options: { fontSize: 13, color: T.red, bullet: { code: "2022" }, paraSpaceAfter: 8 } },
      { text: "Não Produtivo Externo (NPE) — Causas fora do controle", options: { fontSize: 13, color: T.accent, bullet: { code: "2022" }, paraSpaceAfter: 16 } },
      { text: "Produtividade = Produtivo ÷ (Total − NPE) × 100", options: { fontSize: 11, color: T.gray, paraSpaceAfter: 6 } },
    ],
    { x: 0.8, y: 1.5, w: 11.7, h: 5, fontFace: "Calibri", valign: "top" },
  );
  slides.push(s3);

  // SLIDE 4 — KPIs
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
    s4.addShape(pptx.ShapeType.roundRect, { x, y: 1.5, w: 2.8, h: 1.8, fill: { color: T.bgLight }, rectRadius: 0.1 });
    s4.addShape(pptx.ShapeType.rect, { x, y: 1.5, w: 0.08, h: 1.8, fill: { color: kpi.color } });
    s4.addText(kpi.value, { x: x + 0.3, y: 1.6, w: 2.2, h: 0.9, fontSize: 30, bold: true, color: kpi.color, fontFace: "Calibri", valign: "middle" });
    s4.addText(kpi.label, { x: x + 0.3, y: 2.5, w: 2.2, h: 0.6, fontSize: 11, color: T.gray, fontFace: "Calibri" });
  });

  s4.addText(
    `Base controlável: ${data.totalControlaveis} amostras (excl. ${data.externo} NPE — ${data.externoPct}% do total)`,
    { x: 0.8, y: 3.5, w: 11.7, h: 0.4, fontSize: 10, color: T.gray, fontFace: "Calibri" },
  );

  if (analysis["RESUMO"]) addBullets(s4, analysis["RESUMO"], { x: 0.8, y: 4.2, w: 11.7, h: 2.7 });
  slides.push(s4);

  // Chart slides — one per chart, ordered as specified
  const chartSlides: Array<{ title: string; image: string | undefined; section: string; dimKey: string }> = [
    { title: "Visão Geral por Contrato", image: images.contrato, section: "CONTRATO", dimKey: "contrato" },
    { title: "Distribuição por Categoria", image: images.categoria, section: "CATEGORIA", dimKey: "categoria" },
    { title: "Top Causas — Pareto por Categorias", image: images.paretoCategoria, section: "PARETO", dimKey: "paretoCategoria" },
    { title: "Top Causas — Pareto por Especialidades", image: images.paretoEspecialidade, section: "PARETO_ESPECIALIDADE", dimKey: "paretoEspecialidade" },
    { title: "Top Causas — Pareto por Funções", image: images.paretoFuncao, section: "PARETO_FUNCAO", dimKey: "paretoFuncao" },
    { title: "Produtividade por Especialidade", image: images.especialidade, section: "ESPECIALIDADE", dimKey: "especialidade" },
    { title: "Produtividade por Função", image: images.funcao, section: "FUNCAO", dimKey: "funcao" },
    { title: "Causas de Não Produtividade", image: images.naoprod, section: "NAO_PRODUTIVO", dimKey: "naoprod" },
    { title: "Causas Externas de Parada (NPE)", image: images.externas, section: "EXTERNO", dimKey: "externas" },
    { title: "Produtividade por Horário", image: images.tempoHorario, section: "HORARIO", dimKey: "tempoHorario" },
    { title: "Produtividade por Dia da Semana", image: images.tempoDiaSemana, section: "DIA_SEMANA", dimKey: "tempoDiaSemana" },
    { title: "Produtividade por Mês", image: images.tempoMes, section: "MES", dimKey: "tempoMes" },
  ];

  for (const cs of chartSlides) {
    if (cs.image) {
      const analysisText = analysis[cs.section] || (cs.section.startsWith("PARETO_") ? analysis["PARETO"] : undefined);
      addChartSlide(pptx, slides, cs.title, cs.image, analysisText, dims[cs.dimKey]);
    }
  }

  // Conclusões e Recomendações — 1 slide per problem block
  const recText = analysis["RECOMENDACOES"] || analysis["GERAL"] || "";
  if (recText) {
    const recBlocks = parseRecommendationBlocks(recText);
    if (recBlocks.length > 0) {
      for (const block of recBlocks) {
        const sRec = pptx.addSlide();
        makeBg(pptx, sRec);
        sRec.addText(`Conclusão — ${block.title}`, { x: 0.8, y: 0.15, w: 11.7, h: 0.5, fontSize: 28, bold: true, color: T.white, fontFace: "Calibri" });
        sRec.addShape(pptx.ShapeType.rect, { x: 0.8, y: 0.68, w: 11.7, h: 0.03, fill: { color: T.accent } });

        const fields = [
          { label: "Problema", value: block.problema, color: T.red },
          { label: "Causa provável", value: block.causa, color: T.amber },
          { label: "Ação recomendada", value: block.acao, color: T.green },
          { label: "Responsável", value: block.responsavel, color: T.accent },
          { label: "Impacto esperado", value: block.impacto, color: T.green },
        ];

        let fieldY = 1.0;
        for (const f of fields) {
          if (!f.value) continue;
          sRec.addText(f.label, { x: 0.8, y: fieldY, w: 3, h: 0.4, fontSize: 12, bold: true, color: f.color, fontFace: "Calibri" });
          sRec.addText(f.value, { x: 0.8, y: fieldY + 0.35, w: 11.7, h: 0.7, fontSize: 11, color: T.white, fontFace: "Calibri", valign: "top" });
          fieldY += 1.1;
        }
        slides.push(sRec);
      }
    } else {
      // Fallback: single slide with bullets
      const sRec = pptx.addSlide();
      makeBg(pptx, sRec);
      sRec.addText("Conclusões e Recomendações", { x: 0.8, y: 0.3, w: 8, h: 0.8, fontSize: 28, bold: true, color: T.white, fontFace: "Calibri" });
      sRec.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 11.7, h: 0.03, fill: { color: T.accent } });
      addBullets(sRec, recText, { x: 0.8, y: 1.5, w: 11.7, h: 5.2 });
      slides.push(sRec);
    }
  }

  // Thank you
  const sEnd = pptx.addSlide();
  makeBg(pptx, sEnd);
  sEnd.addShape(pptx.ShapeType.rect, { x: 0, y: 2.5, w: 13.33, h: 2.5, fill: { color: T.bgLight } });
  sEnd.addText("Obrigado!", { x: 0, y: 2.7, w: 13.33, h: 1.2, fontSize: 40, bold: true, color: T.white, fontFace: "Calibri", align: "center" });
  sEnd.addText("Relatório gerado automaticamente pelo ProdControl com análise de IA", { x: 0, y: 3.9, w: 13.33, h: 0.6, fontSize: 14, color: T.gray, fontFace: "Calibri", align: "center" });
  sEnd.addText("MEGASTEAM", { x: 0, y: 6, w: 13.33, h: 0.5, fontSize: 16, bold: true, color: T.accent, fontFace: "Calibri", align: "center" });
  slides.push(sEnd);

  slides.forEach((s, i) => addSlideNumber(s, i + 1, slides.length));

  pptx.writeFile({ fileName: `apresentacao-produtividade_${format(new Date(), "yyyy-MM-dd_HHmm")}.pptx` });
}
