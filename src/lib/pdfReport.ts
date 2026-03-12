import jsPDF from "jspdf";
import { format } from "date-fns";
import type { ChartImages } from "./chartCapture";

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
}

// ── Theme colors (matching reference PDF) ──
const C = {
  headerBg: [15, 23, 42] as [number, number, number],       // dark navy header
  sectionBg: [23, 80, 97] as [number, number, number],      // teal section headers
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
  analysisBorder: [23, 80, 97] as [number, number, number], // teal left border
  analysisBg: [240, 245, 247] as [number, number, number],  // light gray-blue
};

interface AnalysisSections {
  [key: string]: string;
}

function parseAnalysis(aiText: string): AnalysisSections {
  const sections: AnalysisSections = {};
  if (!aiText) return sections;
  const regex = /===\s*([A-Z_]+)\s*===\s*\n([\s\S]*?)(?=\n===|$)/g;
  let m;
  while ((m = regex.exec(aiText)) !== null) {
    sections[m[1].trim()] = m[2].trim();
  }
  if (!Object.keys(sections).length) sections["GERAL"] = aiText;
  return sections;
}

export function generatePDFReport(data: PDFReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const margin = 14;
  const contentW = W - margin * 2;
  let pageNum = 0;
  let curY = 0;
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");

  const images = data.chartImages || {};
  const analysis = parseAnalysis(data.aiAnalysis);

  // ── Page management ──
  const addNewPage = () => {
    if (pageNum > 0) doc.addPage("a4", "portrait");
    pageNum++;
    // White background
    doc.setFillColor(...C.pageBg);
    doc.rect(0, 0, W, H, "F");
  };

  const addFooter = () => {
    doc.setFontSize(8);
    doc.setTextColor(...C.textLight);
    doc.setFont("helvetica", "normal");
    doc.text(`ProdControl — Página ${pageNum} de {TOTAL}`, margin, H - 8);
    doc.text(dateStr, W - margin, H - 8, { align: "right" });
  };

  // Check if we need a new page (ensures space)
  const ensureSpace = (needed: number) => {
    if (curY + needed > H - 20) {
      addFooter();
      addNewPage();
      curY = 12;
    }
  };

  // ── Drawing helpers ──
  const drawSectionHeader = (title: string) => {
    ensureSpace(18);
    curY += 6;
    doc.setFillColor(...C.sectionBg);
    doc.roundedRect(margin, curY, contentW, 10, 1, 1, "F");
    doc.setFontSize(12);
    doc.setTextColor(...C.white);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin + 4, curY + 7);
    curY += 14;
  };

  const drawAnalysisBox = (text: string) => {
    if (!text?.trim()) return;
    const lines = text.split("\n").filter((l) => l.trim());
    const paragraphs: string[] = [];

    for (const line of lines) {
      const cleaned = line.trim().replace(/^[-•]\s*/, "").replace(/\*\*/g, "");
      if (cleaned) paragraphs.push(cleaned);
    }

    // Calculate height needed
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    let totalLines = 0;
    const wrappedParagraphs: string[][] = [];
    for (const p of paragraphs) {
      const wrapped = doc.splitTextToSize(p, contentW - 10);
      wrappedParagraphs.push(wrapped);
      totalLines += wrapped.length;
    }
    const boxH = totalLines * 4 + paragraphs.length * 2 + 6;

    ensureSpace(boxH + 4);

    // Background box with left accent border
    doc.setFillColor(...C.analysisBg);
    doc.roundedRect(margin, curY, contentW, boxH, 1, 1, "F");
    doc.setFillColor(...C.analysisBorder);
    doc.rect(margin, curY, 2, boxH, "F");

    // Text content
    doc.setTextColor(...C.textDark);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    let textY = curY + 5;
    for (const wrapped of wrappedParagraphs) {
      doc.text(wrapped, margin + 6, textY);
      textY += wrapped.length * 4 + 2;
    }

    curY += boxH + 3;
  };

  const drawChart = (chartImage: string | undefined) => {
    if (!chartImage) return;
    // Chart takes full width, aspect ratio ~16:9
    const chartH = contentW * 0.45;
    ensureSpace(chartH + 4);
    try {
      doc.addImage(chartImage, "PNG", margin, curY, contentW, chartH);
      curY += chartH + 3;
    } catch (e) {
      console.warn("Failed to add chart image:", e);
    }
  };

  const drawChartSection = (
    title: string,
    chartImage: string | undefined,
    analysisText: string | undefined,
  ) => {
    drawSectionHeader(title);
    drawChart(chartImage);
    if (analysisText) drawAnalysisBox(analysisText);
  };

  // ═════════════════════════════════════════════
  // PAGE 1 — Header
  // ═════════════════════════════════════════════
  addNewPage();

  // Dark header band
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, W, 32, "F");

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

  // ═════════════════════════════════════════════
  // KPIs
  // ═════════════════════════════════════════════
  drawSectionHeader("Indicadores Principais");

  const kpis = [
    { label: "Total de Amostras", value: String(data.totalAmostras), color: C.accentBlue },
    { label: "Produtividade", value: `${data.produtivoPct}%`, color: C.accentGreen },
    { label: "Suplementar", value: `${data.suplementar} (${data.suplementarPct}%)`, color: C.accentAmber },
    { label: "Não Produtivo", value: `${data.naoProdutivo} (${data.naoProdutivoPct}%)`, color: C.accentRed },
  ];

  const kpiW = (contentW - 9) / 4;
  kpis.forEach((kpi, i) => {
    const x = margin + i * (kpiW + 3);
    // Card background
    doc.setFillColor(...C.cardBg);
    doc.setDrawColor(...C.cardBorder);
    doc.roundedRect(x, curY, kpiW, 22, 1, 1, "FD");
    // Color accent top bar
    doc.setFillColor(...kpi.color);
    doc.rect(x, curY, kpiW, 1.5, "F");

    // Value
    doc.setFontSize(16);
    doc.setTextColor(...kpi.color);
    doc.setFont("helvetica", "bold");
    doc.text(kpi.value, x + 4, curY + 11);

    // Label
    doc.setFontSize(8);
    doc.setTextColor(...C.textGray);
    doc.setFont("helvetica", "normal");
    doc.text(kpi.label, x + 4, curY + 18);
  });

  curY += 26;

  // Base info
  doc.setFontSize(8);
  doc.setTextColor(...C.textGray);
  doc.text(
    `Base controlável: ${data.totalControlaveis} amostras (excluindo ${data.externo} NPE — ${data.externoPct}% do total)`,
    margin,
    curY,
  );
  curY += 4;

  // Resumo analysis
  if (analysis["RESUMO"]) {
    drawAnalysisBox(analysis["RESUMO"]);
  }

  // ═════════════════════════════════════════════
  // Chart sections — continuous flow
  // ═════════════════════════════════════════════
  const chartSections: Array<{ title: string; image: string | undefined; section: string }> = [
    { title: "Distribuição por Categoria", image: images.categoria, section: "CATEGORIA" },
    { title: "Visão Geral por Contrato", image: images.contrato, section: "CONTRATO" },
    { title: "Produtividade por Especialidade", image: images.especialidade, section: "ESPECIALIDADE" },
    { title: "Produtividade por Função", image: images.funcao, section: "FUNCAO" },
    { title: "Top Causas — Pareto por Categorias", image: images.paretoCategoria, section: "PARETO" },
    { title: "Top Causas — Pareto por Especialidades", image: images.paretoEspecialidade, section: "PARETO_ESPECIALIDADE" },
    { title: "Top Causas — Pareto por Funções", image: images.paretoFuncao, section: "PARETO_FUNCAO" },
    { title: "Causas de Não Produtividade", image: images.naoprod, section: "NAO_PRODUTIVO" },
    { title: "Causas Externas (Não Produtivo Externo)", image: images.externas, section: "EXTERNO" },
    { title: "Produtividade por Horário", image: images.tempoHorario, section: "HORARIO" },
    { title: "Produtividade por Dia da Semana", image: images.tempoDiaSemana, section: "DIA_SEMANA" },
    { title: "Produtividade por Mês", image: images.tempoMes, section: "MES" },
  ];

  for (const cs of chartSections) {
    if (cs.image) {
      const analysisText = analysis[cs.section] || (cs.section.startsWith("PARETO_") ? analysis["PARETO"] : undefined);
      drawChartSection(cs.title, cs.image, analysisText);
    }
  }

  // ═════════════════════════════════════════════
  // Conclusão e Recomendações
  // ═════════════════════════════════════════════
  const recText = analysis["RECOMENDACOES"] || analysis["GERAL"] || "";
  if (recText) {
    drawSectionHeader("Conclusão e Recomendações");
    drawAnalysisBox(recText);
  }

  // Add footer to all pages
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
