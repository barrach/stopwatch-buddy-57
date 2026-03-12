import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

interface PDFReportData {
  periodo: string;
  obra: string;
  // KPIs
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
  // Chart data
  byObra: Array<{ name: string; total: number; [key: string]: any }>;
  bySpecialty: Array<{ name: string; total: number; [key: string]: any }>;
  byFunction: Array<{ name: string; total: number; [key: string]: any }>;
  nonprodCausas: Array<{ name: string; value: number; percent: number; cat: string }>;
  externalCausas: Array<{ name: string; value: number; percent: number }>;
  categoryTotals: Array<{ name: string; value: number }>;
  // AI analysis
  aiAnalysis: string;
}

const COLORS = {
  primary: [22, 78, 99] as [number, number, number],
  header: [15, 23, 42] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  amber: [245, 158, 11] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  blue: [59, 130, 246] as [number, number, number],
  gray: [100, 116, 139] as [number, number, number],
  lightBg: [241, 245, 249] as [number, number, number],
};

function addHeader(doc: jsPDF, title: string, subtitle: string) {
  // Header bar
  doc.setFillColor(...COLORS.header);
  doc.rect(0, 0, 210, 32, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("ProdControl — Relatório de Produtividade", 14, 14);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, 14, 22);

  doc.setFontSize(8);
  doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 28);

  doc.setTextColor(0, 0, 0);
}

function addSectionTitle(doc: jsPDF, y: number, title: string): number {
  if (y > 260) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(...COLORS.primary);
  doc.rect(14, y, 182, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(title, 18, y + 5.5);
  doc.setTextColor(0, 0, 0);
  return y + 12;
}

function addKPIBox(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, color: [number, number, number]) {
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, 22, 2, 2, "FD");

  doc.setFillColor(...color);
  doc.rect(x, y, 3, 22, "F");

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...color);
  doc.text(value, x + 8, y + 10);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.gray);
  doc.text(label, x + 8, y + 17);
  doc.setTextColor(0, 0, 0);
}

function checkPageBreak(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > 280) {
    doc.addPage();
    return 20;
  }
  return y;
}

export function generatePDFReport(data: PDFReportData) {
  const doc = new jsPDF("p", "mm", "a4");

  // ── Header ──
  addHeader(doc, "Relatório de Produtividade", `Contrato: ${data.obra} | Período: ${data.periodo}`);

  let y = 40;

  // ── KPIs ──
  y = addSectionTitle(doc, y, "Indicadores Principais");
  const kpiW = 43;
  addKPIBox(doc, 14, y, kpiW, "Total de Amostras", String(data.totalAmostras), COLORS.primary);
  addKPIBox(doc, 14 + kpiW + 3, y, kpiW, "Produtividade", `${data.produtivoPct}%`, COLORS.green);
  addKPIBox(doc, 14 + (kpiW + 3) * 2, y, kpiW, "Suplementar", String(data.suplementar), COLORS.amber);
  addKPIBox(doc, 14 + (kpiW + 3) * 3, y, kpiW, "Não Produtivo", String(data.naoProdutivo), COLORS.red);
  y += 28;

  // Sub-metrics
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.gray);
  doc.text(`Base controlável: ${data.totalControlaveis} amostras (excluindo ${data.externo} NPE — ${data.externoPct}% do total)`, 14, y);
  doc.text(`Produtivo: ${data.produtivoPct}% | Suplementar: ${data.suplementarPct}% | Não Produtivo: ${data.naoProdutivoPct}%`, 14, y + 4);
  doc.setTextColor(0, 0, 0);
  y += 12;

  // ── Distribuição por Categoria ──
  y = checkPageBreak(doc, y, 30);
  y = addSectionTitle(doc, y, "Distribuição por Categoria");
  autoTable(doc, {
    startY: y,
    head: [["Categoria", "Amostras", "% do Total"]],
    body: data.categoryTotals.map(c => {
      const pct = data.totalAmostras > 0 ? ((c.value / data.totalAmostras) * 100).toFixed(1) : "0";
      return [c.name, String(c.value), `${pct}%`];
    }),
    theme: "grid",
    headStyles: { fillColor: COLORS.header, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2 },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Produtividade por Contrato ──
  if (data.byObra.length > 0) {
    y = checkPageBreak(doc, y, 40);
    y = addSectionTitle(doc, y, "Produtividade por Contrato");
    const obraRows = data.byObra.map(o => {
      const trabalhando = o["Trabalhando"] || 0;
      return [o.name, String(o.total), `${trabalhando}%`];
    });
    autoTable(doc, {
      startY: y,
      head: [["Contrato", "Amostras", "Produtividade (%)"]],
      body: obraRows,
      theme: "grid",
      headStyles: { fillColor: COLORS.header, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Produtividade por Especialidade ──
  if (data.bySpecialty.length > 0) {
    y = checkPageBreak(doc, y, 40);
    y = addSectionTitle(doc, y, "Produtividade por Especialidade");
    const espRows = data.bySpecialty.map(s => {
      const prodPct = s["Trabalhando"] || 0;
      const planPct = s["Planejando"] || 0;
      return [s.name, String(s.total), `${prodPct}%`, `${planPct}%`, `${(prodPct + planPct).toFixed(1)}%`];
    });
    autoTable(doc, {
      startY: y,
      head: [["Especialidade", "Amostras", "Trabalhando", "Planejando", "Total Prod."]],
      body: espRows,
      theme: "grid",
      headStyles: { fillColor: COLORS.header, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Produtividade por Função ──
  if (data.byFunction.length > 0) {
    y = checkPageBreak(doc, y, 40);
    y = addSectionTitle(doc, y, "Produtividade por Função");
    const funcRows = data.byFunction.map(f => {
      const prodPct = f["Trabalhando"] || 0;
      return [f.name, String(f.total), `${prodPct}%`];
    });
    autoTable(doc, {
      startY: y,
      head: [["Função", "Amostras", "Produtividade (%)"]],
      body: funcRows,
      theme: "grid",
      headStyles: { fillColor: COLORS.header, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Causas de Não Produtividade ──
  if (data.nonprodCausas.length > 0) {
    y = checkPageBreak(doc, y, 40);
    y = addSectionTitle(doc, y, "Causas de Não Produtividade (Suplementar + NP)");
    const causaRows = data.nonprodCausas.map(c => [c.name, c.cat, String(c.value), `${c.percent}%`]);
    autoTable(doc, {
      startY: y,
      head: [["Descrição", "Categoria", "Amostras", "% do Total"]],
      body: causaRows,
      theme: "grid",
      headStyles: { fillColor: COLORS.header, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Causas Externas (NPE) ──
  if (data.externalCausas.length > 0) {
    y = checkPageBreak(doc, y, 40);
    y = addSectionTitle(doc, y, "Causas Externas (Não Produtivo Externo)");
    const extRows = data.externalCausas.map(c => [c.name, String(c.value), `${c.percent}%`]);
    autoTable(doc, {
      startY: y,
      head: [["Causa", "Amostras", "% das Externas"]],
      body: extRows,
      theme: "grid",
      headStyles: { fillColor: COLORS.header, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── AI Analysis ──
  if (data.aiAnalysis) {
    y = checkPageBreak(doc, y, 30);
    y = addSectionTitle(doc, y, "Análise Inteligente (IA)");

    const lines = data.aiAnalysis.split("\n");
    doc.setFont("helvetica", "normal");

    for (const line of lines) {
      y = checkPageBreak(doc, y, 8);
      const trimmed = line.trim();

      if (trimmed === "") {
        y += 3;
        continue;
      }

      if (trimmed.startsWith("## ") || trimmed.startsWith("# ")) {
        y += 2;
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.primary);
        const title = trimmed.replace(/^#+\s*/, "").replace(/\*\*/g, "");
        const splitTitle = doc.splitTextToSize(title, 180);
        doc.text(splitTitle, 14, y);
        y += splitTitle.length * 5 + 2;
        doc.setTextColor(0, 0, 0);
        continue;
      }

      if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        const text = trimmed.replace(/\*\*/g, "");
        const splitText = doc.splitTextToSize(text, 180);
        doc.text(splitText, 14, y);
        y += splitText.length * 4 + 2;
        continue;
      }

      if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        const text = `  •  ${trimmed.replace(/^[-•]\s*/, "").replace(/\*\*/g, "")}`;
        const splitText = doc.splitTextToSize(text, 175);
        doc.text(splitText, 16, y);
        y += splitText.length * 3.8 + 1.5;
        continue;
      }

      // Regular paragraph
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      const cleanText = trimmed.replace(/\*\*/g, "");
      const splitText = doc.splitTextToSize(cleanText, 180);
      doc.text(splitText, 14, y);
      y += splitText.length * 3.8 + 1.5;
    }
  }

  // ── Footer on all pages ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.gray);
    doc.text(`ProdControl — Página ${i} de ${pageCount}`, 14, 290);
    doc.text(format(new Date(), "dd/MM/yyyy HH:mm"), 170, 290);
  }

  doc.save(`relatorio-produtividade_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
}
