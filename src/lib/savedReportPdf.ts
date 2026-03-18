import jsPDF from "jspdf";
import { format } from "date-fns";
import type { SavedReport } from "@/components/SavedReportsList";
import { PDF_OCEAN_RGB, buildStyledPdfLines, wrapTextByWords } from "./pdfTextFormatting";

type RGB = [number, number, number];

const C = {
  headerBg: [15, 23, 42] as RGB,
  sectionBg: [...PDF_OCEAN_RGB] as RGB,
  white: [255, 255, 255] as RGB,
  pageBg: [255, 255, 255] as RGB,
  textDark: [31, 41, 55] as RGB,
  textMuted: [107, 114, 128] as RGB,
  border: [209, 213, 219] as RGB,
  cardBg: [248, 250, 252] as RGB,
};

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
  "Aguardando Liberação de PT": "#D4B896",
  "Interferências Operacionais": "#C8A882",
  "Vazamento / Interferência da Planta": "#C8A882",
  "Fatores Climáticos e Consequências": "#F97316",
  "Causas Naturais": "#F97316",
};

const STACK_ORDER = [
  "Trabalhando", "Planejando", "Aguardando Ferramenta ou Material",
  "Transitando no local de trabalho - com ferramenta", "Transitando no local de trabalho - sem ferramenta",
  "Transitando fora do local de trabalho - com ferramenta", "Transitando fora do local de trabalho - sem ferramenta",
  "Assistindo / Stand By", "Pessoal", "Ocioso",
  "Aguardando Liberação de PT", "Interferências Operacionais", "Fatores Climáticos e Consequências",
];

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

export function generateSavedReportPDF(report: SavedReport) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const s = report.snapshot;
  const dateStr = format(new Date(), "dd/MM/yyyy HH:mm");
  const periodLabel = report.date_mode === "single"
    ? report.data_unica || ""
    : `${report.data_inicio} até ${report.data_fim}`;

  let curY = MARGIN;

  const newPage = () => { doc.addPage(); curY = MARGIN; };
  const ensureSpace = (h: number) => { if (curY + h > MAX_Y) newPage(); };

  const sectionHeader = (title: string) => {
    ensureSpace(14);
    doc.setFillColor(...C.sectionBg);
    doc.roundedRect(MARGIN, curY, CONTENT_W, 10, 1.8, 1.8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...C.white);
    doc.text(title, MARGIN + 5, curY + 6.7);
    curY += 12;
  };

  const drawLegend = (items: Array<{ name: string; percent: number }>, x: number, y: number): number => {
    let drawY = y;
    doc.setFontSize(9);
    for (const item of items) {
      if (item.percent <= 0) continue;
      const rgb = hexToRgb(DESC_COLORS[item.name] || "#6B7280");
      doc.setFillColor(...rgb);
      doc.roundedRect(x + 2, drawY + 0.7, 3.2, 3.2, 0.5, 0.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.textDark);
      const label = `${item.name} — ${fmtPct(item.percent)}`;
      const lines = wrapTextByWords(doc, label, CONTENT_W * 0.28);
      doc.text(lines[0] || "", x + 7, drawY + 3.6);
      if (lines.length > 1) {
        doc.setFont("helvetica", "normal");
        for (let i = 1; i < lines.length; i++) doc.text(lines[i], x + 7, drawY + 3.6 + i * 4.2);
      }
      drawY += Math.max(4.5, lines.length * 4.2) + 3;
    }
    return drawY - y;
  };

  const drawFormattedText = (text: string, x: number, y: number, maxW: number): number => {
    const blocks = buildStyledPdfLines(doc, text, maxW);
    let drawY = y;
    doc.setFontSize(9);

    for (const block of blocks) {
      if (block.prefix) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...PDF_OCEAN_RGB);
        doc.text(block.prefix, x, drawY);

        const firstLine = block.lines[0] || "";
        if (firstLine) {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textDark);
          doc.text(firstLine, x + doc.getTextWidth(block.prefix) + 1.5, drawY);
        }

        drawY += 4.5;
        for (const continuation of block.lines.slice(1)) {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textDark);
          doc.text(continuation, x, drawY);
          drawY += 4.5;
        }
        drawY += 0.8;
        continue;
      }

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.textDark);
      for (const line of block.lines) {
        doc.text(line, x, drawY);
        drawY += 4.5;
      }
      drawY += 0.8;
    }

    return drawY - y;
  };

  const computeLegendFromRows = (rows: any[]): Array<{ name: string; percent: number }> => {
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
    return [...STACK_ORDER].reverse().map((desc) => ({
      name: desc,
      percent: grand > 0 ? Number((((totals.get(desc) || 0) / grand) * 100).toFixed(1)) : 0,
    }));
  };

  const renderDataTable = (title: string, rows: any[], nameKey: string) => {
    if (!rows || rows.length === 0) return;
    const legend = computeLegendFromRows(rows);
    const tableH = Math.min(rows.length * 6 + 10, 80);
    const legendH = legend.filter((l) => l.percent > 0).length * 7.5;
    const blockH = 12 + Math.max(tableH, legendH) + 6;
    ensureSpace(blockH);

    sectionHeader(title);

    const chartW = CONTENT_W * 0.68;
    const startY = curY;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.textDark);
    doc.text(nameKey === "name" ? "Nome" : "Período", MARGIN + 2, curY + 3);
    doc.text("Total", MARGIN + chartW - 15, curY + 3);
    curY += 5;
    doc.setDrawColor(...C.border);
    doc.line(MARGIN, curY, MARGIN + chartW, curY);
    curY += 1;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    for (const row of rows.slice(0, 12)) {
      const name = String(row[nameKey] || "");
      const displayName = name.length > 35 ? `${name.substring(0, 35)}…` : name;
      doc.setTextColor(...C.textDark);
      doc.text(displayName, MARGIN + 2, curY + 3);
      doc.text(String(row.total || 0), MARGIN + chartW - 15, curY + 3);

      const trab = Number(row["Trabalhando"] || 0);
      if (trab > 0) {
        const barW = (trab / 100) * (chartW - 55);
        doc.setFillColor(37, 99, 235);
        doc.rect(MARGIN + chartW - 55 + 42, curY, barW, 3.5, "F");
      }
      curY += 5;
    }

    const legendX = MARGIN + CONTENT_W * 0.70;
    drawLegend(legend, legendX, startY);

    curY = Math.max(curY, startY + legendH) + 4;
  };

  const renderParetoTable = (title: string, data: any[]) => {
    if (!data || data.length === 0) return;
    const blockH = 12 + data.length * 5.5 + 8;
    ensureSpace(blockH);

    sectionHeader(title);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.textDark);
    doc.text("Causa", MARGIN + 2, curY + 3);
    doc.text("%", MARGIN + CONTENT_W - 15, curY + 3);
    curY += 5;
    doc.setDrawColor(...C.border);
    doc.line(MARGIN, curY, MARGIN + CONTENT_W, curY);
    curY += 1;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    for (const item of data) {
      const name = String(item.name || "").length > 45 ? `${item.name.substring(0, 45)}…` : item.name;
      doc.setTextColor(...C.textDark);
      doc.text(name, MARGIN + 2, curY + 3);
      doc.text(`${item.percent}%`, MARGIN + CONTENT_W - 15, curY + 3);
      curY += 5;
    }
    curY += 3;
  };

  const renderExternalTable = (title: string, data: any[]) => {
    if (!data || data.length === 0) return;
    const blockH = 12 + data.length * 5.5 + 8;
    ensureSpace(blockH);

    sectionHeader(title);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.textDark);
    doc.text("Causa", MARGIN + 2, curY + 3);
    doc.text("%", MARGIN + CONTENT_W - 15, curY + 3);
    curY += 5;
    doc.setDrawColor(...C.border);
    doc.line(MARGIN, curY, MARGIN + CONTENT_W, curY);
    curY += 1;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    for (const item of data) {
      const color = hexToRgb(DESC_COLORS[item.name] || "#6B7280");
      doc.setFillColor(...color);
      doc.circle(MARGIN + 3, curY + 2, 1.5, "F");
      doc.setTextColor(...C.textDark);
      doc.text(item.name, MARGIN + 7, curY + 3);
      doc.text(`${item.percent}%`, MARGIN + CONTENT_W - 15, curY + 3);
      curY += 5;
    }
    curY += 3;
  };

  // ═══ COVER ═══
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, PAGE_W, 50, "F");
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("ProdControl", MARGIN, 21);
  doc.setFontSize(14);
  doc.text("Relatório de Produtividade", MARGIN, 31);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Contrato: ${report.obra_nome}`, MARGIN, 41);
  doc.text(`Período: ${periodLabel}`, MARGIN, 47);
  doc.text(`Gerado em: ${dateStr}`, PAGE_W - MARGIN, 47, { align: "right" });
  if (report.especialidade_nome) {
    doc.text(`Especialidade: ${report.especialidade_nome}`, MARGIN, 53);
    curY = 62;
  } else {
    curY = 58;
  }

  // ═══ SUMMARY ═══
  sectionHeader("Resumo do Período");
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textDark);
  const summ = s.summary || {};
  doc.text(`Período analisado: ${summ.dateStart || "—"} até ${summ.dateEnd || "—"}`, MARGIN + 2, curY + 4);
  curY += 6;
  doc.text(`Total de dias analisados: ${summ.totalDays || 0}`, MARGIN + 2, curY + 4);
  curY += 6;
  doc.text(`Total de medições: ${summ.totalMeasurements || 0}`, MARGIN + 2, curY + 4);
  curY += 6;
  if (summ.times?.length) {
    doc.text(`Horários: ${summ.times.join(", ")}`, MARGIN + 2, curY + 4);
    curY += 8;
  }

  // ═══ CHARTS ═══
  renderDataTable("Visão Geral por Contrato", s.byObra, "name");
  renderDataTable("Produtividade por Especialidade", s.bySpecialty, "name");
  renderDataTable("Produtividade por Horário", s.byHorario, "time");
  renderDataTable("Produtividade por Dia da Semana", s.byDiaSemana, "time");
  renderDataTable("Produtividade por Mês", s.byMes, "time");
  renderParetoTable("Top Causas (Pareto)", s.paretoData);
  renderExternalTable("Causas Externas de Parada (NPE)", s.externalCausas);

  const fileName = `relatorio-${report.obra_nome.replace(/\s+/g, "-")}-${periodLabel.replace(/\s+/g, "-")}.pdf`;
  doc.save(fileName);
}
