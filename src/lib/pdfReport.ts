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

// ── Theme colors ──
const C = {
  bg: [15, 23, 42] as [number, number, number],
  bgCard: [30, 41, 59] as [number, number, number],
  accent: [59, 130, 246] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  amber: [245, 158, 11] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  white: [248, 250, 252] as [number, number, number],
  gray: [148, 163, 184] as [number, number, number],
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
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297;
  const H = 210;
  const margin = 12;
  const contentW = W - margin * 2;
  let pageNum = 0;

  const images = data.chartImages || {};
  const analysis = parseAnalysis(data.aiAnalysis);

  // ── Helpers ──
  const newPage = () => {
    if (pageNum > 0) doc.addPage("a4", "landscape");
    pageNum++;
    doc.setFillColor(...C.bg);
    doc.rect(0, 0, W, H, "F");
    doc.setFillColor(...C.accent);
    doc.rect(0, H - 2, W, 2, "F");
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(`${pageNum}`, W - margin, H - 5, { align: "right" });
  };

  const drawTitle = (title: string, y: number): number => {
    doc.setFontSize(18);
    doc.setTextColor(...C.white);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin, y);
    doc.setFillColor(...C.accent);
    doc.rect(margin, y + 2, 60, 0.5, "F");
    return y + 10;
  };

  const drawAnalysisText = (text: string, x: number, y: number, maxW: number, maxH: number): number => {
    if (!text?.trim()) return y;
    const lines = text.split("\n").filter((l) => l.trim());
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");

    let currentY = y;
    for (const line of lines) {
      if (currentY > y + maxH - 4) break;
      const trimmed = line.trim().replace(/^[-•]\s*/, "").replace(/\*\*/g, "");
      const isBullet = line.trim().startsWith("-") || line.trim().startsWith("•");

      if (isBullet) {
        doc.setTextColor(...C.gray);
        doc.text("•", x, currentY);
        doc.setTextColor(...C.white);
        const wrapped = doc.splitTextToSize(trimmed, maxW - 5);
        doc.text(wrapped, x + 4, currentY);
        currentY += wrapped.length * 4;
      } else {
        doc.setTextColor(...C.white);
        const wrapped = doc.splitTextToSize(trimmed, maxW);
        doc.text(wrapped, x, currentY);
        currentY += wrapped.length * 4 + 1;
      }
    }
    return currentY;
  };

  const drawChartWithAnalysis = (
    title: string,
    chartImage: string | undefined,
    analysisText: string | undefined,
    chartW = contentW * 0.6,
    chartH = 100,
  ) => {
    newPage();
    let y = drawTitle(title, 18);

    if (chartImage) {
      try {
        doc.addImage(chartImage, "PNG", margin, y, chartW, chartH);
      } catch (e) {
        console.warn("Failed to add chart image:", e);
      }
    }

    if (analysisText) {
      const textX = margin + chartW + 8;
      const textW = contentW - chartW - 8;
      drawAnalysisText(analysisText, textX, y + 2, textW, chartH);
    }
  };

  // ═════════════════════════════════════════════
  // PAGE 1 — Cover
  // ═════════════════════════════════════════════
  newPage();
  doc.setFillColor(...C.bgCard);
  doc.rect(0, 60, W, 70, "F");

  doc.setFontSize(32);
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.text("Relatório de Produtividade", margin + 10, 88);

  doc.setFontSize(16);
  doc.setTextColor(...C.accent);
  doc.text(data.obra || "Todos os Contratos", margin + 10, 100);

  doc.setFontSize(11);
  doc.setTextColor(...C.gray);
  doc.text(`Período: ${data.periodo}`, margin + 10, 112);
  doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, margin + 10, 119);

  doc.setFontSize(12);
  doc.setTextColor(...C.accent);
  doc.setFont("helvetica", "bold");
  doc.text("MEGASTEAM", margin + 10, 180);

  // ═════════════════════════════════════════════
  // PAGE 2 — KPIs
  // ═════════════════════════════════════════════
  newPage();
  let y = drawTitle("Indicadores Principais", 18);

  const kpis = [
    { label: "Total de Amostras", value: String(data.totalAmostras), color: C.accent },
    { label: "Produtividade", value: `${data.produtivoPct}%`, color: C.green },
    { label: "Suplementar", value: `${data.suplementarPct}%`, color: C.amber },
    { label: "Não Produtivo", value: `${data.naoProdutivoPct}%`, color: C.red },
  ];

  const cardW = (contentW - 24) / 4;
  kpis.forEach((kpi, i) => {
    const x = margin + i * (cardW + 8);
    doc.setFillColor(...C.bgCard);
    doc.roundedRect(x, y, cardW, 35, 3, 3, "F");
    doc.setFillColor(...kpi.color);
    doc.rect(x, y, 2, 35, "F");

    doc.setFontSize(24);
    doc.setTextColor(...kpi.color);
    doc.setFont("helvetica", "bold");
    doc.text(kpi.value, x + 10, y + 18);

    doc.setFontSize(9);
    doc.setTextColor(...C.gray);
    doc.setFont("helvetica", "normal");
    doc.text(kpi.label, x + 10, y + 28);
  });

  y += 45;
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  doc.text(
    `Base controlável: ${data.totalControlaveis} amostras (excl. ${data.externo} NPE — ${data.externoPct}% do total)`,
    margin,
    y,
  );

  if (analysis["RESUMO"]) {
    y += 8;
    drawAnalysisText(analysis["RESUMO"], margin, y, contentW, 100);
  }

  // ═════════════════════════════════════════════
  // Chart pages — each with captured image + AI analysis
  // ═════════════════════════════════════════════

  const chartPages: Array<{ title: string; image: string | undefined; section: string }> = [
    { title: "Visão Geral por Contrato", image: images.contrato, section: "CONTRATO" },
    { title: "Distribuição por Categoria", image: images.categoria, section: "CATEGORIA" },
    { title: "Top Causas — Pareto por Categorias", image: images.paretoCategoria, section: "PARETO" },
    { title: "Top Causas — Pareto por Especialidades", image: images.paretoEspecialidade, section: "PARETO_ESPECIALIDADE" },
    { title: "Top Causas — Pareto por Funções", image: images.paretoFuncao, section: "PARETO_FUNCAO" },
    { title: "Produtividade por Especialidade", image: images.especialidade, section: "ESPECIALIDADE" },
    { title: "Produtividade por Função", image: images.funcao, section: "FUNCAO" },
    { title: "Causas de Não Produtividade", image: images.naoprod, section: "NAO_PRODUTIVO" },
    { title: "Causas Externas de Parada (NPE)", image: images.externas, section: "EXTERNO" },
    { title: "Produtividade por Horário", image: images.tempoHorario, section: "HORARIO" },
    { title: "Produtividade por Dia da Semana", image: images.tempoDiaSemana, section: "DIA_SEMANA" },
    { title: "Produtividade por Mês", image: images.tempoMes, section: "MES" },
  ];

  for (const cp of chartPages) {
    if (cp.image) {
      // For Pareto specialidade/funcao, fallback to PARETO analysis if specific section not found
      const analysisText = analysis[cp.section] || (cp.section.startsWith("PARETO_") ? analysis["PARETO"] : undefined);
      drawChartWithAnalysis(cp.title, cp.image, analysisText);
    }
  }

  // ═════════════════════════════════════════════
  // Recomendações
  // ═════════════════════════════════════════════
  const recText = analysis["RECOMENDACOES"] || analysis["GERAL"] || "";
  if (recText) {
    newPage();
    y = drawTitle("Recomendações e Melhorias", 18);
    drawAnalysisText(recText, margin, y, contentW, 150);
  }

  doc.save(`relatorio-produtividade_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
}
