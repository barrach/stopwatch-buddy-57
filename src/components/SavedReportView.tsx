import { CANONICAL_ORDER_FULL } from "@/lib/chartConstants";
import { normalizeToHundred } from "@/lib/hourlyAverageCalc";
import {
  StackedBarChartSection, ParetoChartSection, ExternalPieSection,
} from "@/components/ReportCharts";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileDown, CloudOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SavedReport } from "@/components/SavedReportsList";

interface Props {
  report: SavedReport;
  onBack: () => void;
  onExportPDF: (report: SavedReport) => void;
}

export default function SavedReportView({ report, onBack, onExportPDF }: Props) {
  const s = report.snapshot;
  const periodLabel = report.date_mode === "single"
    ? report.data_unica || ""
    : `${report.data_inicio} até ${report.data_fim}`;

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        <Button variant="outline" size="sm" onClick={() => onExportPDF(report)} className="gap-1.5 ml-auto">
          <FileDown className="w-4 h-4" /> Exportar PDF
        </Button>
      </div>

      {/* Title */}
      <div className="stat-card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-foreground">
            Relatório — {periodLabel} — {report.obra_nome}
            {report.especialidade_nome && <span className="text-muted-foreground font-normal text-sm ml-2">({report.especialidade_nome})</span>}
          </h2>
          {report.tipo_relatorio === "sem_fatores_climaticos" && (
            <Badge variant="outline" className="gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <CloudOff className="w-3 h-3" />
              Sem Fatores Climáticos
            </Badge>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="stat-card">
        <h3 className="text-sm font-semibold text-foreground mb-3">Resumo do Período</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
          <div>
            <p className="text-xs text-muted-foreground">Período analisado</p>
            <p className="text-sm font-medium text-foreground">{s.summary?.dateStart} até {s.summary?.dateEnd}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total de dias analisados</p>
            <p className="text-sm font-medium text-foreground">{s.summary?.totalDays}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total de medições</p>
            <p className="text-sm font-medium text-foreground">{s.summary?.totalMeasurements != null ? Math.round(s.summary.totalMeasurements) : "—"}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-2">Horários registrados:</p>
        <div className="flex flex-wrap gap-2">
          {(s.summary?.times || []).map((t: string) => (
            <span key={t} className="px-2.5 py-1 rounded-md bg-muted text-xs font-mono font-medium text-foreground">{t}</span>
          ))}
        </div>
      </div>

      {/* Charts from snapshot */}
      <StackedBarChartSection data={normalizeRows(s.byObra || [], "name")} dataKeyX="name" descriptions={CANONICAL_ORDER_FULL} title="Visão Geral por Contrato" xAngle={-15} />
      <StackedBarChartSection data={normalizeRows(s.bySpecialty || [], "name")} dataKeyX="name" descriptions={CANONICAL_ORDER_FULL} title="Produtividade por Especialidade" xAngle={-25} />
      <StackedBarChartSection data={normalizeRows(s.byHorario || [], "time")} dataKeyX="time" descriptions={CANONICAL_ORDER_FULL} title="Produtividade por Horário" />
      <StackedBarChartSection data={normalizeRows(s.byDiaSemana || [], "time")} dataKeyX="time" descriptions={CANONICAL_ORDER_FULL} title="Produtividade por Dia da Semana" />
      <StackedBarChartSection data={normalizeRows(s.byMes || [], "time")} dataKeyX="time" descriptions={CANONICAL_ORDER_FULL} title="Produtividade por Mês" />
      <ParetoChartSection data={s.paretoData || []} title="Top Causas (Pareto)" mode="categoria" />
      <ExternalPieSection data={s.externalCausas || []} title="Causas Externas de Parada" />
    </div>
  );
}
