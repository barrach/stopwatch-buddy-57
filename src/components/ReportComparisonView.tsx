import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowUp, ArrowDown, Minus, FileDown } from "lucide-react";
import { CANONICAL_ORDER_FULL } from "@/lib/chartConstants";
import { generateComparisonPDF } from "@/lib/comparisonReportPdf";
import { useToast } from "@/hooks/use-toast";
import {
  StackedBarChartSection, ParetoChartSection, ExternalPieSection,
} from "@/components/ReportCharts";
import type { SavedReport } from "@/components/SavedReportsList";

interface Props {
  reportA: SavedReport;
  reportB: SavedReport;
  onBack: () => void;
}

function periodLabel(r: SavedReport) {
  return r.date_mode === "single" ? r.data_unica || "" : `${r.data_inicio} até ${r.data_fim}`;
}

function DeltaIndicator({ valueA, valueB, suffix = "%" }: { valueA: number; valueB: number; suffix?: string }) {
  const diff = valueB - valueA;
  if (Math.abs(diff) < 0.1) {
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="w-3 h-3" /> =</span>;
  }
  if (diff > 0) {
    return <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><ArrowUp className="w-3 h-3" /> +{diff.toFixed(1)}{suffix}</span>;
  }
  return <span className="inline-flex items-center gap-1 text-xs text-red-500"><ArrowDown className="w-3 h-3" /> {diff.toFixed(1)}{suffix}</span>;
}

function getProductivity(snapshot: any): Record<string, number> {
  const data = snapshot?.byObra || [];
  if (data.length === 0) return {};
  // Average across all entries
  const result: Record<string, number> = {};
  for (const desc of CANONICAL_ORDER_FULL) {
    const vals = data.map((d: any) => d[desc] || 0);
    result[desc] = vals.reduce((s: number, v: number) => s + v, 0) / vals.length;
  }
  return result;
}

export default function ReportComparisonView({ reportA, reportB, onBack }: Props) {
  const { toast } = useToast();
  const sA = reportA.snapshot as any;
  const sB = reportB.snapshot as any;

  const prodA = useMemo(() => getProductivity(sA), [sA]);
  const prodB = useMemo(() => getProductivity(sB), [sB]);

  // Group descriptions into 4 executive categories (per official taxonomy)
  const groupMap: Record<string, string[]> = {
    "Produtivo": ["Trabalhando"],
    "Suplementar": [
      "Planejando",
      "Aguardando Ferramenta ou Material",
      "Assistindo / Stand By",
      "Aguardando Liberação de PT",
      "Transitando no local de trabalho - com ferramenta",
      "Transitando no local de trabalho - sem ferramenta",
      "Transitando fora do local de trabalho - com ferramenta",
      "Transitando fora do local de trabalho - sem ferramenta",
    ],
    "Não Produtivo": ["Pessoal", "Ocioso"],
    "Não Produtivo Externo": ["Interferências Operacionais", "Fatores Climáticos e Consequências"],
  };

  const sumGroup = (prod: Record<string, number>, descs: string[]) =>
    descs.reduce((s, d) => s + (prod[d] || 0), 0);

  // Compute grouped values and normalize to 100% via Largest Remainder Method
  const computeGrouped = (prod: Record<string, number>) => {
    const raw: Record<string, number> = {};
    for (const [group, descs] of Object.entries(groupMap)) {
      raw[group] = sumGroup(prod, descs);
    }
    const total = Object.values(raw).reduce((s, v) => s + v, 0);
    if (total <= 0) return raw;

    // Largest Remainder Method
    const scaled = Object.entries(raw).map(([k, v]) => ({
      key: k,
      exact: (v / total) * 100,
      floored: Math.floor((v / total) * 100 * 10) / 10,
    }));
    const flooredSum = scaled.reduce((s, e) => s + Math.round(e.floored * 10), 0);
    const remainder = 1000 - flooredSum; // target 100.0% = 1000 tenths
    const sorted = [...scaled].sort((a, b) => (b.exact - b.floored) - (a.exact - a.floored));
    for (let i = 0; i < remainder && i < sorted.length; i++) {
      sorted[i].floored = Math.round((sorted[i].floored + 0.1) * 10) / 10;
    }
    const result: Record<string, number> = {};
    for (const e of scaled) {
      result[e.key] = e.floored;
    }
    return result;
  };

  const groupedA = useMemo(() => computeGrouped(prodA), [prodA]);
  const groupedB = useMemo(() => computeGrouped(prodB), [prodB]);

  const mainCategories = Object.keys(groupMap);

  const handleExportPDF = () => {
    try {
      generateComparisonPDF(reportA, reportB);
      toast({ title: "PDF gerado com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao gerar PDF", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        <h1 className="text-lg font-bold text-foreground flex-1">Comparação de Relatórios</h1>
        <Button size="sm" onClick={handleExportPDF} className="gap-1.5">
          <FileDown className="w-4 h-4" /> Exportar PDF
        </Button>
      </div>

      {/* Summary comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[reportA, reportB].map((report, idx) => {
          const s = report.snapshot as any;
          return (
            <div key={report.id} className="stat-card">
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Relatório {idx === 0 ? "A" : "B"}
              </h3>
              <p className="text-xs text-muted-foreground">{report.obra_nome}</p>
              <p className="text-xs text-muted-foreground">Período: {periodLabel(report)}</p>
              {report.especialidade_nome && (
                <p className="text-xs text-muted-foreground">Especialidade: {report.especialidade_nome}</p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground">Dias analisados</p>
                  <p className="text-sm font-medium text-foreground">{s.summary?.totalDays ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Total de medições</p>
                  <p className="text-sm font-medium text-foreground">{s.summary?.totalMeasurements != null ? Math.round(s.summary.totalMeasurements) : "—"}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delta KPIs */}
      <div className="stat-card">
        <h3 className="text-sm font-semibold text-foreground mb-4">Comparação de Indicadores</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {mainCategories.map((cat) => {
            const valA = sumGroup(prodA, groupMap[cat]);
            const valB = sumGroup(prodB, groupMap[cat]);
            return (
            <div key={cat} className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">{cat}</p>
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-medium text-foreground">{valA.toFixed(1)}%</span>
                  <span className="text-muted-foreground mx-1">→</span>
                  <span className="font-medium text-foreground">{valB.toFixed(1)}%</span>
                </div>
                <DeltaIndicator valueA={valA} valueB={valB} />
              </div>
            </div>
            );
          })}
        </div>
        {/* Full breakdown */}
        <div className="mt-4 space-y-1">
          {CANONICAL_ORDER_FULL.filter((c) => !mainCategories.includes(c)).map((cat) => {
            const a = prodA[cat] || 0;
            const b = prodB[cat] || 0;
            if (a === 0 && b === 0) return null;
            return (
              <div key={cat} className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                <span className="text-muted-foreground">{cat}</span>
                <div className="flex items-center gap-3">
                  <span className="text-foreground">{a.toFixed(1)}% → {b.toFixed(1)}%</span>
                  <DeltaIndicator valueA={a} valueB={b} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Side-by-side charts */}
      <h3 className="text-sm font-semibold text-foreground">Gráficos Lado a Lado</h3>

      {[
        { title: "Visão Geral por Contrato", dataKey: "byObra", xKey: "name", xAngle: -15 },
        { title: "Produtividade por Especialidade", dataKey: "bySpecialty", xKey: "name", xAngle: -25 },
        { title: "Produtividade por Horário", dataKey: "byHorario", xKey: "time", xAngle: 0 },
        { title: "Produtividade por Dia da Semana", dataKey: "byDiaSemana", xKey: "time", xAngle: 0 },
        { title: "Produtividade por Mês", dataKey: "byMes", xKey: "time", xAngle: 0 },
      ].map(({ title, dataKey, xKey, xAngle }) => (
        <div key={dataKey} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <StackedBarChartSection
            data={sA[dataKey] || []}
            dataKeyX={xKey}
            descriptions={CANONICAL_ORDER_FULL}
            title={`${title} — A`}
            xAngle={xAngle}
          />
          <StackedBarChartSection
            data={sB[dataKey] || []}
            dataKeyX={xKey}
            descriptions={CANONICAL_ORDER_FULL}
            title={`${title} — B`}
            xAngle={xAngle}
          />
        </div>
      ))}

      {/* Pareto */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ParetoChartSection data={sA.paretoData || []} title="Top Causas (Pareto) — A" mode="categoria" />
        <ParetoChartSection data={sB.paretoData || []} title="Top Causas (Pareto) — B" mode="categoria" />
      </div>

      {/* External */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExternalPieSection data={sA.externalCausas || []} title="Causas Externas — A" />
        <ExternalPieSection data={sB.externalCausas || []} title="Causas Externas — B" />
      </div>
    </div>
  );
}
