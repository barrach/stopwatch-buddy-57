import jsPDF from "jspdf";
import { format } from "date-fns";
import type { ChartImages, ChartDimensions } from "./chartCapture";

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
  aiAnalysis: string;
  chartImages?: ChartImages;
  chartDimensions?: ChartDimensions;
  logoBase64?: string; // Logo MEGASTEAM em base64
}

// ── Theme colors ──
const C = {
  headerBg: [15, 23, 42] as [number, number, number],
  sectionBg: [23, 80, 97] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  pageBg: [255, 255, 255] as [number, number, number],
  textDark: [30, 30, 30] as [number, number, number],
  textGray: [100, 100, 100] as [number, number, number],
  textLight: [130, 130, 130] as [number, number, number],
  cardBg: [245, 245, 245] as [number, number, number],
  cardBorder: [220, 220, 220] as [number, number, number],
  accentBlue: [59, 130, 246] as [number, number, number],
  accentGreen: [22, 163, 74] as [number, number, number],
  accentAmber: [245, 158, 11] as [number, number, number],
  accentRed: [220, 38, 38] as [number, number, number],
  analysisBorder: [23, 80, 97] as [number, number, number],
  analysisBg: [240, 245, 247] as [number, number, number],
};

interface AnalysisSections { [key: string]: string; }

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
  const parts = text.split(/(?:^|\n)\s*(?:\*\*)?Problema\s*\d+\s*(?:[-—:]\s*)?/i).filter(p => p.trim());
  for (const part of parts) {
    const lines = part.split("\n").map(l => l.trim()).filter(Boolean);
    const block: RecBlock = { title: "", problema: "", causa: "", acao: "", responsavel: "", impacto: "" };
    let currentField = "title";
    for (const line of lines) {
      const clean = line.replace(/\*\*/g, "").replace(/^[-•]\s*/, "");
      const lower = clean.toLowerCase();
      if (lower.startsWith("problema:") || lower.startsWith("problema :")) {
        block.problema = clean.replace(/^[^:]+:\s*/, ""); currentField = "problema";
      } else if (lower.startsWith("causa prov") || lower.startsWith("causa:")) {
        block.causa = clean.replace(/^[^:]+:\s*/, ""); currentField = "causa";
      } else if (lower.startsWith("ação recomendada") || lower.startsWith("acao recomendada") || lower.startsWith("ação:")) {
        block.acao = clean.replace(/^[^:]+:\s*/, ""); currentField = "acao";
      } else if (lower.startsWith("responsável") || lower.startsWith("responsavel")) {
        block.responsavel = clean.replace(/^[^:]+:\s*/, ""); currentField = "responsavel";
      } else if (lower.startsWith("impacto esperado") || lower.startsWith("impacto:")) {
        block.impacto = clean.replace(/^[^:]+:\s*/, ""); currentField = "impacto";
      } else if (!block.title && currentField === "title") {
        block.title = clean.replace(/^[-—]\s*/, "").trim();
      } else {
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

function parseAnalysis(aiText: string): AnalysisSections {
  const sections: AnalysisSections = {};
  if (!aiText) return sections;
  const regex = /===\s*([A-Z_]+)\s*===\s*\n([\s\S]*?)(?=\n===|$)/g;
  let m;
  while ((m = regex.exec(aiText)) !== null) sections[m[1].trim()] = m[2].trim();
  if (!Object.keys(sections).length) sections["GERAL"] = aiText;
  return sections;
}

export function generatePDFReport(data: PDFReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const margin = 20;
  const contentW = W - margin * 2; // 170mm
  const maxChartH = 110; // mm — max chart height as specified
  let pageNum = 0;
  let curY = 0;
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");

  const images = data.chartImages || {};
  const dims = data.chartDimensions || {};
  const analysis = parseAnalysis(data.aiAnalysis);

  const addNewPage = () => {
    if (pageNum > 0) doc.addPage("a4", "portrait");
    pageNum++;
    doc.setFillColor(...C.pageBg);
    doc.rect(0, 0, W, H, "F");
  };

  const ensureSpace = (needed: number) => {
    if (curY + needed > H - 20) {
      addNewPage();
      curY = 16;
    }
  };

  const drawSectionHeader = (title: string) => {
    ensureSpace(20);
    curY += 6; // reduced spacing before section
    doc.setFillColor(...C.sectionBg);
    doc.roundedRect(margin, curY, contentW, 10, 1, 1, "F");
    doc.setFontSize(12);
    doc.setTextColor(...C.white);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin + 4, curY + 7);
    curY += 12; // ~10px gap between title and chart
  };

  const drawAnalysisBox = (text: string) => {
    if (!text?.trim()) return;
    const lines = text.split("\n").filter((l) => l.trim());
    const paragraphs: string[] = [];
    for (const line of lines) {
      const cleaned = line.trim().replace(/^[-•]\s*/, "").replace(/\*\*/g, "");
      if (cleaned) paragraphs.push(cleaned);
    }

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    let totalH = 6;
    const wrappedParagraphs: string[][] = [];
    for (const p of paragraphs) {
      const wrapped = doc.splitTextToSize(p, contentW - 10);
      wrappedParagraphs.push(wrapped);
      totalH += wrapped.length * 4 + 2;
    }

    ensureSpace(totalH + 4);

    doc.setFillColor(...C.analysisBg);
    doc.roundedRect(margin, curY, contentW, totalH, 1, 1, "F");
    doc.setFillColor(...C.analysisBorder);
    doc.rect(margin, curY, 2, totalH, "F");

    doc.setTextColor(...C.textDark);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    let textY = curY + 5;
    for (const wrapped of wrappedParagraphs) {
      doc.text(wrapped, margin + 6, textY);
      textY += wrapped.length * 4 + 2;
    }
    curY += totalH + 3;
  };

  /** Draw chart preserving original aspect ratio, max 170mm wide × 120mm tall */
  const drawChart = (chartImage: string | undefined, dimKey: string) => {
    if (!chartImage) return;
    const dim = dims[dimKey];
    let chartW = contentW; // 170mm full width
    let chartH: number;

    if (dim && dim.width > 0) {
      const aspectRatio = dim.height / dim.width;
      chartH = chartW * aspectRatio;
      // Cap at max height, scale down width proportionally if needed
      if (chartH > maxChartH) {
        chartH = maxChartH;
        chartW = chartH / aspectRatio;
      }
    } else {
      chartH = contentW * 0.55;
    }

    ensureSpace(chartH + 6);
    try {
      // Center horizontally if width was reduced
      const xOffset = margin + (contentW - chartW) / 2;
      doc.addImage(chartImage, "PNG", xOffset, curY, chartW, chartH);
      curY += chartH + 5; // ~15px spacing after chart before analysis
    } catch (e) {
      console.warn("Failed to add chart image:", e);
    }
  };

  /** Smart page break: if title + chart won't fit, break before the section */
  const drawChartSection = (title: string, chartImage: string | undefined, analysisText: string | undefined, dimKey: string) => {
    // Estimate chart height for smart page break
    const dim = dims[dimKey];
    let estChartH = contentW * 0.55;
    if (dim && dim.width > 0) {
      const ar = dim.height / dim.width;
      estChartH = Math.min(contentW * ar, maxChartH);
    }
    // Title (10mm) + gap (2mm) + chart + gap (5mm) = minimum needed
    const totalNeeded = 12 + estChartH + 5;
    if (curY + totalNeeded > H - 20) {
      addNewPage();
      curY = 16;
    }
    drawSectionHeader(title);
    drawChart(chartImage, dimKey);
    if (analysisText) drawAnalysisBox(analysisText);
  };

  // ═══════════════════════════════════════
  // Header
  // ═══════════════════════════════════════
  addNewPage();
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, W, 32, "F");
  
  // Logo MEGASTEAM no canto superior direito
  if (data.logoBase64) {
    try {
      doc.addImage(data.logoBase64, "PNG", W - margin - 45, 6, 45, 12);
    } catch (e) {
      console.warn("Failed to add logo to PDF:", e);
    }
  }
  
  doc.setFontSize(22);
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.text("ProdControl — Relatório de Produtividade", margin, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Contrato: ${data.obra || "Todos os Contratos"} | Período: ${data.periodo}`, margin, 22);
  doc.setFontSize(8);
  doc.text(`Gerado em: ${dateStr}`, margin, 28);
  curY = 40;

  // ═══════════════════════════════════════
  // KPIs
  // ═══════════════════════════════════════
  drawSectionHeader("Indicadores Principais");

  const kpis = [
    { label: "Total de Amostras", value: String(data.totalAmostras), color: C.accentBlue },
    { label: "Produtividade", value: `${data.produtivoPct}%`, color: C.accentGreen },
    { label: "Suplementar", value: `${data.suplementarPct}%`, color: C.accentAmber },
    { label: "Não Produtivo", value: `${data.naoProdutivoPct}%`, color: C.accentRed },
  ];

  const kpiW = (contentW - 9) / 4;
  kpis.forEach((kpi, i) => {
    const x = margin + i * (kpiW + 3);
    doc.setFillColor(...C.cardBg);
    doc.setDrawColor(...C.cardBorder);
    doc.roundedRect(x, curY, kpiW, 22, 1, 1, "FD");
    doc.setFillColor(...kpi.color);
    doc.rect(x, curY, kpiW, 1.5, "F");
    doc.setFontSize(16);
    doc.setTextColor(...kpi.color);
    doc.setFont("helvetica", "bold");
    doc.text(kpi.value, x + 4, curY + 11);
    doc.setFontSize(8);
    doc.setTextColor(...C.textGray);
    doc.setFont("helvetica", "normal");
    doc.text(kpi.label, x + 4, curY + 18);
  });
  curY += 26;

  doc.setFontSize(8);
  doc.setTextColor(...C.textGray);
  doc.text(`Base controlável: ${data.totalControlaveis} amostras (excluindo ${data.externo} NPE — ${data.externoPct}% do total)`, margin, curY);
  curY += 4;

  if (analysis["RESUMO"]) drawAnalysisBox(analysis["RESUMO"]);

  // ═══════════════════════════════════════
  // Chart sections — ordered as specified
  // ═══════════════════════════════════════
  const chartSections: Array<{ title: string; image: string | undefined; section: string; dimKey: string }> = [
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

  for (const cs of chartSections) {
    if (cs.image) {
      const analysisText = analysis[cs.section] || (cs.section.startsWith("PARETO_") ? analysis["PARETO"] : undefined);
      drawChartSection(cs.title, cs.image, analysisText, cs.dimKey);
    }
  }

  // ═══════════════════════════════════════
  // Conclusões e Recomendações — grouped blocks
  // ═══════════════════════════════════════
  const recText = analysis["RECOMENDACOES"] || analysis["GERAL"] || "";
  if (recText) {
    const recBlocks = parseRecommendationBlocks(recText);
    if (recBlocks.length > 0) {
      // Estimate first block height to keep title + first block together
      const firstBlock = recBlocks[0];
      const firstFields = [
        { label: `PROBLEMA 1 — ${firstBlock.title}`, value: firstBlock.problema },
        { label: "CAUSA PROVÁVEL", value: firstBlock.causa },
        { label: "AÇÃO RECOMENDADA", value: firstBlock.acao },
        { label: "RESPONSÁVEL", value: firstBlock.responsavel },
        { label: "IMPACTO ESPERADO", value: firstBlock.impacto },
      ];
      let firstBlockH = 16; // section header (12) + problem header (10) + padding
      for (const f of firstFields) {
        if (!f.value) {
          continue;
        }
        const lines = doc.splitTextToSize(f.value, contentW - 16);
        firstBlockH += 5 + lines.length * 3.5 + 2;
      }
      // Ensure title + first block fit together — if not, break before
      const minNeeded = Math.min(firstBlockH, 80); // cap to avoid forcing empty pages
      ensureSpace(minNeeded);

      drawSectionHeader("Conclusões e Recomendações");

      for (let bi = 0; bi < recBlocks.length; bi++) {
        const block = recBlocks[bi];
        const fields = [
          { label: "PROBLEMA", value: block.problema },
          { label: "CAUSA PROVÁVEL", value: block.causa },
          { label: "AÇÃO RECOMENDADA", value: block.acao },
          { label: "RESPONSÁVEL", value: block.responsavel },
          { label: "IMPACTO ESPERADO", value: block.impacto },
        ];

        // Estimate block height
        let blockH = 14; // problem header box
        for (const f of fields) {
          if (!f.value) continue;
          const lines = doc.splitTextToSize(f.value, contentW - 16);
          blockH += 5 + lines.length * 3.5 + 2;
        }
        ensureSpace(blockH + 10);

        // Separator line between blocks
        if (bi > 0) {
          doc.setDrawColor(...C.cardBorder);
          doc.line(margin + 4, curY, margin + contentW - 4, curY);
          curY += 6;
        }

        // Problem title header — styled box matching section header style
        doc.setFillColor(...C.sectionBg);
        doc.roundedRect(margin + 2, curY, contentW - 4, 8, 1, 1, "F");
        doc.setFontSize(10);
        doc.setTextColor(...C.white);
        doc.setFont("helvetica", "bold");
        doc.text(`PROBLEMA ${bi + 1} — ${block.title}`, margin + 6, curY + 5.5);
        curY += 12;

        for (const f of fields) {
          if (!f.value) continue;
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...C.sectionBg);
          doc.text(f.label, margin + 6, curY + 4);
          curY += 5;

          doc.setFontSize(8.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textDark);
          const wrapped = doc.splitTextToSize(f.value, contentW - 16);
          doc.text(wrapped, margin + 10, curY + 3);
          curY += wrapped.length * 3.5 + 3;
        }
        curY += 6; // spacing between blocks
      }
    } else {
      drawSectionHeader("Conclusões e Recomendações");
      drawAnalysisBox(recText);
    }
  }

  // Footer on all pages
  const totalPages = pageNum;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...C.textLight);
    doc.setFont("helvetica", "normal");
    doc.text(`ProdControl — Página ${i} de ${totalPages}`, margin, H - 8);
    doc.text(dateStr, W - margin, H - 8, { align: "right" });
  }

  doc.save(`relatorio-produtividade_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
}
