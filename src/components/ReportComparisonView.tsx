import { useMemo, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowUp, ArrowDown, Minus, FileDown, Loader2, Trophy, CloudOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CANONICAL_ORDER_FULL } from "@/lib/chartConstants";
import { normalizeToHundred } from "@/lib/hourlyAverageCalc";
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
  const result: Record<string, number> = {};
  for (const desc of CANONICAL_ORDER_FULL) {
    const vals = data.map((d: any) => d[desc] || 0);
    result[desc] = vals.reduce((s: number, v: number) => s + v, 0) / vals.length;
  }
  return result;
}

export default function ReportComparisonView({ reportA, reportB, onBack }: Props) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize snapshot chart rows so each bar sums to exactly 100%
  const normalizeRows = (rows: any[], xKey: string): any[] => {
    if (!rows || rows.length === 0) return [];
    return rows.map(row => {
      const keys = CANONICAL_ORDER_FULL.filter(d => row[d] !== undefined && row[d] !== null);
      if (keys.length === 0) return row;
      const rawValues = keys.map(d => Number(row[d]) || 0);
      const sum = rawValues.reduce((s, v) => s + v, 0);
      if (sum <= 0) return row;
      const normalized = normalizeToHundred(keys, rawValues);
      const newRow: any = { [xKey]: row[xKey] };
      for (const d of CANONICAL_ORDER_FULL) {
        newRow[d] = normalized[d] ?? row[d] ?? 0;
      }
      return newRow;
    });
  };

  const sA = reportA.snapshot as any;
  const sB = reportB.snapshot as any;

  const prodA = useMemo(() => getProductivity(sA), [sA]);
  const prodB = useMemo(() => getProductivity(sB), [sB]);

  // Group descriptions into 4 executive categories (per official taxonomy)
  const groupMap: Record<string, string[]> = {
    "Produtivo": ["Trabalhando", "Planejando"],
    "Suplementar": [
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

  const computeGrouped = (prod: Record<string, number>) => {
    const raw: Record<string, number> = {};
    for (const [group, descs] of Object.entries(groupMap)) {
      raw[group] = sumGroup(prod, descs);
    }
    const total = Object.values(raw).reduce((s, v) => s + v, 0);
    if (total <= 0) return raw;
    const scaled = Object.entries(raw).map(([k, v]) => ({
      key: k,
      exact: (v / total) * 100,
      floored: Math.floor((v / total) * 100 * 10) / 10,
    }));
    const flooredSum = scaled.reduce((s, e) => s + Math.round(e.floored * 10), 0);
    const remainder = 1000 - flooredSum;
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

  const chartSections = [
    { id: "comp-byObra", title: "Visão Geral por Contrato", dataKey: "byObra", xKey: "name", xAngle: -15 },
    { id: "comp-bySpecialty", title: "Produtividade por Especialidade", dataKey: "bySpecialty", xKey: "name", xAngle: -25 },
    { id: "comp-byHorario", title: "Produtividade por Horário", dataKey: "byHorario", xKey: "time", xAngle: 0 },
    { id: "comp-byDiaSemana", title: "Produtividade por Dia da Semana", dataKey: "byDiaSemana", xKey: "time", xAngle: 0 },
    { id: "comp-byMes", title: "Produtividade por Mês", dataKey: "byMes", xKey: "time", xAngle: 0 },
  ];

  const handleExportPDF = async () => {
    setExporting(true);
    toast({ title: "Capturando gráficos para o PDF..." });
    try {
      // Small delay to ensure charts are fully rendered
      await new Promise(r => setTimeout(r, 300));
      await generateComparisonPDF(reportA, reportB, containerRef.current);
      toast({ title: "PDF gerado com sucesso!" });
    } catch (err: any) {
      console.error("PDF export error:", err);
      toast({ title: "Erro ao gerar PDF", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        <h1 className="text-lg font-bold text-foreground flex-1">Comparação de Relatórios</h1>
        <Button size="sm" onClick={handleExportPDF} className="gap-1.5" disabled={exporting}>
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          {exporting ? "Gerando..." : "Exportar PDF"}
        </Button>
      </div>

      {/* Summary comparison */}
      <div id="comp-summary" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[reportA, reportB].map((report, idx) => {
          const s = report.snapshot as any;
          return (
            <div key={report.id} className="stat-card">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">
                  Relatório {idx === 0 ? "A" : "B"}
                </h3>
                {report.tipo_relatorio === "sem_fatores_climaticos" && (
                  <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] px-1.5 py-0 h-5">
                    <CloudOff className="w-2.5 h-2.5" />
                    Sem Fatores Climáticos
                  </Badge>
                )}
              </div>
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
      <div id="comp-kpis" className="stat-card">
        <h3 className="text-sm font-semibold text-foreground mb-4">Comparação de Indicadores</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {mainCategories.map((cat) => {
            const valA = groupedA[cat] || 0;
            const valB = groupedB[cat] || 0;
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

      {chartSections.map(({ id, title, dataKey, xKey, xAngle }) => (
        <div key={dataKey} id={id} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <StackedBarChartSection
            data={normalizeRows(sA[dataKey] || [], xKey)}
            dataKeyX={xKey}
            descriptions={CANONICAL_ORDER_FULL}
            title={`${title} — A`}
            xAngle={xAngle}
          />
          <StackedBarChartSection
            data={normalizeRows(sB[dataKey] || [], xKey)}
            dataKeyX={xKey}
            descriptions={CANONICAL_ORDER_FULL}
            title={`${title} — B`}
            xAngle={xAngle}
          />
        </div>
      ))}

      {/* Pareto */}
      <div id="comp-pareto" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ParetoChartSection data={sA.paretoData || []} title="Top Causas (Pareto) — A" mode="categoria" />
        <ParetoChartSection data={sB.paretoData || []} title="Top Causas (Pareto) — B" mode="categoria" />
      </div>

      {/* External */}
      <div id="comp-external" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExternalPieSection data={sA.externalCausas || []} title="Causas Externas — A" />
        <ExternalPieSection data={sB.externalCausas || []} title="Causas Externas — B" />
      </div>

      {/* Evolution KPI */}
      {(() => {
        // Compute productivity (Trabalhando + Planejando) per specialty for A and B
        const getSpecialtyProductivity = (snapshot: any): Record<string, number> => {
          const data = snapshot?.bySpecialty || [];
          const result: Record<string, number> = {};
          data.forEach((row: any) => {
            const name = row.name || "";
            const prod = (row["Trabalhando"] || 0) + (row["Planejando"] || 0);
            result[name] = prod;
          });
          return result;
        };

        const specProdA = getSpecialtyProductivity(sA);
        const specProdB = getSpecialtyProductivity(sB);

        // Calculate evolution for each specialty present in both
        const allSpecs = new Set([...Object.keys(specProdA), ...Object.keys(specProdB)]);
        const evolutions: Array<{ name: string; before: number; after: number; evolution: number }> = [];
        allSpecs.forEach(name => {
          const before = specProdA[name];
          const after = specProdB[name];
          if (before === undefined || after === undefined) return;
          if (before === 0 && after === 0) return;
          evolutions.push({ name, before, after, evolution: after - before });
        });

        evolutions.sort((a, b) => b.evolution - a.evolution);

        const medals = ["🥇", "🥈", "🥉"];

        return (
          <div id="comp-evolution" className="stat-card animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-yellow-500" />
              <h3 className="text-sm font-semibold text-foreground">🏆 Ranking de Evolução de Produtividade</h3>
            </div>
            {evolutions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem base comparativa entre os relatórios.</p>
            ) : (
              <div className="space-y-3">
                {evolutions.map((item, idx) => {
                  const isPositive = item.evolution > 0;
                  const isNegative = item.evolution < 0;
                  const isFirst = idx === 0 && isPositive;
                  return (
                    <div
                      key={item.name}
                      className={`flex items-center gap-3 rounded-lg border p-3 ${
                        isFirst ? "bg-green-500/10 border-green-500/30" : "border-border/50"
                      }`}
                    >
                      <div className="flex items-center gap-1 shrink-0 w-10 justify-center">
                        {idx < 3 ? (
                          <span className="text-2xl">{medals[idx]}</span>
                        ) : (
                          <span className="text-sm font-medium text-muted-foreground">{idx + 1}º</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`truncate ${isFirst ? "text-sm font-bold text-foreground" : "text-sm font-medium text-foreground/80"}`}>
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">Antes: {item.before.toFixed(1)}%</span>
                          <span className="text-xs text-muted-foreground">→</span>
                          <span className="text-xs text-muted-foreground">Depois: {item.after.toFixed(1)}%</span>
                        </div>
                      </div>
                      <span className={`text-lg font-bold ${
                        isPositive
                          ? (isFirst ? "text-green-600 dark:text-green-400" : "text-green-600/80 dark:text-green-400/80")
                          : isNegative
                            ? "text-red-600 dark:text-red-400"
                            : "text-muted-foreground"
                      }`}>
                        {isPositive ? "+" : ""}{item.evolution.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
