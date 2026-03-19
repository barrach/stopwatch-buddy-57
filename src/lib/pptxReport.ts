import PptxGenJS from "pptxgenjs";
import { format } from "date-fns";
import type { ChartImages, ChartDimensions } from "./chartCapture";

export interface PPTXReportData {
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
  nonprodCausas: Array<{ name: string; value: number; percent: number; cat: string }>;
  externalCausas: Array<{ name: string; value: number; percent: number }>;
  categoryTotals: Array<{ name: string; value: number }>;
  aiAnalysis: string;
  chartImages?: ChartImages;
  chartDimensions?: ChartDimensions;
}

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
  const regex = /===\s*([A-Z_]+)\s*===\s*\n([\s\S]*?)(?=\n===\s*[A-Z_]+\s*===|$)/g;
  let m;
  while ((m = regex.exec(aiText)) !== null) sections[m[1].trim()] = m[2].trim();
  if (!Object.keys(sections).length) sections["GERAL"] = aiText;
  return sections;
}

function parseDayBlocks(text: string): Array<{ day: string; content: string }> {
  const blocks: Array<{ day: string; content: string }> = [];
  const regex = /(?:^|\n)\s*===DIA:([^=]+)===\s*\n([\s\S]*?)(?=\n\s*===DIA:|$)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    blocks.push({ day: m[1].trim(), content: m[2].trim() });
  }
  if (blocks.length === 0 && text.trim()) {
    blocks.push({ day: "", content: text.trim() });
  }
  return blocks;
}

function parseHourBlocks(text: string): Array<{ hour: string; content: string }> {
  const blocks: Array<{ hour: string; content: string }> = [];
  const regex = /(?:^|\n)\s*===HORA:([^=]+)===\s*\n([\s\S]*?)(?=\n\s*===HORA:|$)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    blocks.push({ hour: m[1].trim(), content: m[2].trim() });
  }
  if (blocks.length === 0 && text.trim()) {
    blocks.push({ hour: "", content: text.trim() });
  }
  return blocks;
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

function cleanBlockTitle(rawName: string): string {
  return rawName
    .replace(/^={2,}\s*(?:DIA|HORA)\s*[:]\s*/i, "")
    .replace(/\s*={2,}\s*$/i, "")
    .replace(/^(?:Dia|Hora|HORA|DIA)\s*[-—:.\s]\s*/i, "")
    .replace(/^(?:Dia|Hora)\s+/i, "")
    .trim();
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

  // Sumário removido — apresentação inicia direto no Objetivo

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
    { label: "NPE (Externo)", value: `${data.externoPct}%`, color: "8B5CF6" },
  ];

  const kpiCardW = 2.3;
  const kpiGap = 0.15;
  kpis.forEach((kpi, i) => {
    const x = 0.5 + i * (kpiCardW + kpiGap);
    s4.addShape(pptx.ShapeType.roundRect, { x, y: 1.5, w: kpiCardW, h: 1.8, fill: { color: T.bgLight }, rectRadius: 0.1 });
    s4.addShape(pptx.ShapeType.rect, { x, y: 1.5, w: 0.08, h: 1.8, fill: { color: kpi.color } });
    s4.addText(kpi.value, { x: x + 0.3, y: 1.6, w: kpiCardW - 0.5, h: 0.9, fontSize: 28, bold: true, color: kpi.color, fontFace: "Calibri", valign: "middle" });
    s4.addText(kpi.label, { x: x + 0.3, y: 2.5, w: kpiCardW - 0.5, h: 0.6, fontSize: 10, color: T.gray, fontFace: "Calibri" });
  });

  s4.addText(
    `Total: ${data.totalAmostras} amostras | Produtivo: ${data.produtivoPct}% | Suplementar: ${data.suplementarPct}% | NP: ${data.naoProdutivoPct}% | NPE: ${data.externoPct}%`,
    { x: 0.8, y: 3.5, w: 11.7, h: 0.4, fontSize: 10, color: T.gray, fontFace: "Calibri" },
  );

  if (analysis["RESUMO"]) addBullets(s4, analysis["RESUMO"], { x: 0.8, y: 4.2, w: 11.7, h: 2.7 });
  slides.push(s4);

  // Chart slides — one per chart, ordered as specified
  const chartSlides: Array<{ title: string; image: string | undefined; section: string; dimKey: string }> = [
    { title: "Visão Geral por Contrato", image: images.contrato, section: "CONTRATO", dimKey: "contrato" },
    { title: "Distribuição por Categoria", image: images.categoria, section: "CATEGORIA", dimKey: "categoria" },
    { title: "Top Causas — Pareto por Categorias", image: images.paretoCategoria, section: "PARETO", dimKey: "paretoCategoria" },
    
    { title: "Produtividade por Especialidade", image: images.especialidade, section: "ESPECIALIDADE", dimKey: "especialidade" },
    { title: "Causas Externas de Parada (NPE)", image: images.externas, section: "EXTERNO", dimKey: "externas" },
    { title: "Produtividade por Horário", image: images.tempoHorario, section: "HORARIO", dimKey: "tempoHorario" },
    { title: "Produtividade por Dia da Semana", image: images.tempoDiaSemana, section: "DIA_SEMANA", dimKey: "tempoDiaSemana" },
    { title: "Produtividade por Mês", image: images.tempoMes, section: "MES", dimKey: "tempoMes" },
  ];

  for (const cs of chartSlides) {
    if (cs.image) {
      const analysisText = analysis[cs.section] || (cs.section.startsWith("PARETO_") ? analysis["PARETO"] : undefined);
      
      if (cs.section === "DIA_SEMANA" && analysisText) {
        addChartSlide(pptx, slides, cs.title, cs.image, undefined, dims[cs.dimKey]);
        const dayBlocks = parseDayBlocks(analysisText);
        for (const block of dayBlocks) {
          if (!block.day) continue;
          const cleanDay = cleanBlockTitle(block.day);
          const sDay = pptx.addSlide();
          makeBg(pptx, sDay);
          sDay.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 0.2, w: 12.3, h: 0.7, fill: { color: "175061" }, rectRadius: 0.06 });
          sDay.addText(cleanDay, {
            x: 0.7, y: 0.2, w: 11.9, h: 0.7,
            fontSize: 24, bold: true, color: T.white, fontFace: "Calibri", valign: "middle",
          });
          addBullets(sDay, block.content, { x: 0.8, y: 1.2, w: 11.7, h: 5.5 });
          slides.push(sDay);
        }
      } else if (cs.section === "HORARIO" && analysisText) {
        addChartSlide(pptx, slides, cs.title, cs.image, undefined, dims[cs.dimKey]);
        const hourBlocks = parseHourBlocks(analysisText);
        for (const block of hourBlocks) {
          if (!block.hour) continue;
          const cleanHour = cleanBlockTitle(block.hour);
          const sHour = pptx.addSlide();
          makeBg(pptx, sHour);
          sHour.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 0.2, w: 12.3, h: 0.7, fill: { color: "175061" }, rectRadius: 0.06 });
          sHour.addText(cleanHour, {
            x: 0.7, y: 0.2, w: 11.9, h: 0.7,
            fontSize: 24, bold: true, color: T.white, fontFace: "Calibri", valign: "middle",
          });
          addBullets(sHour, block.content, { x: 0.8, y: 1.2, w: 11.7, h: 5.5 });
          slides.push(sHour);
        }
      } else {
        addChartSlide(pptx, slides, cs.title, cs.image, analysisText, dims[cs.dimKey]);
      }
    }
  }

  // Conclusões e Recomendações — 1 slide per problem block
  const recText = analysis["RECOMENDACOES"] || analysis["GERAL"] || "";
  if (recText) {
    const recBlocks = parseRecommendationBlocks(recText);
    if (recBlocks.length > 0) {
      for (let bi = 0; bi < recBlocks.length; bi++) {
        const block = recBlocks[bi];
        const sRec = pptx.addSlide();
        makeBg(pptx, sRec);

        // Title bar with problem number — dark teal background like section headers
        sRec.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 0.2, w: 12.3, h: 0.7, fill: { color: "175061" }, rectRadius: 0.06 });
        sRec.addText(`PROBLEMA ${bi + 1} — ${block.title}`, {
          x: 0.7, y: 0.2, w: 11.9, h: 0.7,
          fontSize: 24, bold: true, color: T.white, fontFace: "Calibri", valign: "middle",
        });

        const fields = [
          { label: "Problema", value: block.problema, color: T.red },
          { label: "Causa provável", value: block.causa, color: T.amber },
          { label: "Ação recomendada", value: block.acao, color: T.green },
          { label: "Responsável", value: block.responsavel, color: T.accent },
          { label: "Impacto esperado", value: block.impacto, color: T.green },
        ];

        let fieldY = 1.2;
        for (const f of fields) {
          if (!f.value) continue;
          sRec.addText(f.label.toUpperCase(), { x: 0.8, y: fieldY, w: 4, h: 0.35, fontSize: 11, bold: true, color: f.color, fontFace: "Calibri" });
          sRec.addText(f.value, { x: 0.8, y: fieldY + 0.35, w: 11.7, h: 0.8, fontSize: 12, color: T.white, fontFace: "Calibri", valign: "top" });
          fieldY += 1.15;
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
