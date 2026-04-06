import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Eye, FileDown, Trash2, GitCompareArrows, Check } from "lucide-react";
import { format } from "date-fns";
import type { SavedReport } from "@/components/SavedReportsList";
import SavedReportView from "@/components/SavedReportView";
import ReportComparisonView from "@/components/ReportComparisonView";
import { generateSavedReportPDF } from "@/lib/savedReportPdf";
import { captureSavedReportCharts } from "@/lib/savedReportChartCapture";

export default function RelatoriosSalvosPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchDateStart, setSearchDateStart] = useState("");
  const [searchDateEnd, setSearchDateEnd] = useState("");
  const [searchObraId, setSearchObraId] = useState("");
  const [searchEspecialidadeId, setSearchEspecialidadeId] = useState("");

  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewingReport, setViewingReport] = useState<SavedReport | null>(null);
  const [comparingReports, setComparingReports] = useState<[SavedReport, SavedReport] | null>(null);

  const { data: obras = [] } = useQuery({
    queryKey: ["obras", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id, nome").eq("status", "Ativo").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: especialidades = [] } = useQuery({
    queryKey: ["especialidades", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("especialidades").select("id, nome").eq("status", "Ativo").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: savedReports = [], isLoading } = useQuery({
    queryKey: ["relatorios_salvos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("relatorios_salvos")
        .select("*")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data as SavedReport[];
    },
  });

  const filtered = useMemo(() => {
    return savedReports.filter((r) => {
      if (searchObraId && r.obra_id !== searchObraId) return false;
      if (searchEspecialidadeId && r.especialidade_id !== searchEspecialidadeId) return false;
      if (searchDateStart || searchDateEnd) {
        const rStart = r.date_mode === "single" ? r.data_unica : r.data_inicio;
        const rEnd = r.date_mode === "single" ? r.data_unica : r.data_fim;
        if (searchDateStart && rEnd && rEnd < searchDateStart) return false;
        if (searchDateEnd && rStart && rStart > searchDateEnd) return false;
      }
      return true;
    });
  }, [savedReports, searchDateStart, searchDateEnd, searchObraId, searchEspecialidadeId]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("relatorios_salvos").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Relatório excluído" });
      setSelectedIds((prev) => prev.filter((s) => s !== id));
      queryClient.invalidateQueries({ queryKey: ["relatorios_salvos"] });
    }
  };

  const handleExportPDF = (report: SavedReport) => {
    try {
      generateSavedReportPDF(report);
      toast({ title: "PDF gerado com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao gerar PDF", description: err.message, variant: "destructive" });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const handleCompare = () => {
    if (selectedIds.length !== 2) return;
    const a = savedReports.find((r) => r.id === selectedIds[0]);
    const b = savedReports.find((r) => r.id === selectedIds[1]);
    if (a && b) setComparingReports([a, b]);
  };

  // Viewing a single saved report
  if (viewingReport) {
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto">
          <SavedReportView
            report={viewingReport}
            onBack={() => setViewingReport(null)}
            onExportPDF={handleExportPDF}
          />
        </div>
      </AppLayout>
    );
  }

  // Comparing two reports
  if (comparingReports) {
    return (
      <AppLayout>
        <div className="max-w-[1400px] mx-auto">
          <ReportComparisonView
            reportA={comparingReports[0]}
            reportB={comparingReports[1]}
            onBack={() => {
              setComparingReports(null);
              setCompareMode(false);
              setSelectedIds([]);
            }}
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/relatorios")} className="gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-foreground">Relatórios Salvos</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Histórico de relatórios gerados</p>
            </div>
          </div>
          <div className="flex gap-2">
            {compareMode && selectedIds.length === 2 && (
              <Button onClick={handleCompare} className="gap-2">
                <GitCompareArrows className="w-4 h-4" /> Comparar
              </Button>
            )}
            <Button
              variant={compareMode ? "secondary" : "outline"}
              onClick={() => { setCompareMode(!compareMode); setSelectedIds([]); }}
              className="gap-2"
            >
              <GitCompareArrows className="w-4 h-4" />
              {compareMode ? "Cancelar" : "Comparar Relatórios"}
            </Button>
          </div>
        </div>

        {compareMode && (
          <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm text-foreground">
            Selecione exatamente <strong>2 relatórios</strong> para comparar. ({selectedIds.length}/2 selecionados)
          </div>
        )}

        {/* Filters */}
        <div className="stat-card mb-6 animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground mb-4">Filtros</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Data Inicial</Label>
              <Input type="date" value={searchDateStart} onChange={(e) => setSearchDateStart(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Data Final</Label>
              <Input type="date" value={searchDateEnd} onChange={(e) => setSearchDateEnd(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Contrato</Label>
              <Select value={searchObraId || "all"} onValueChange={(v) => setSearchObraId(v === "all" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Especialidade</Label>
              <Select value={searchEspecialidadeId || "all"} onValueChange={(v) => setSearchEspecialidadeId(v === "all" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {especialidades.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="stat-card text-center py-12 animate-fade-in">
            <p className="text-muted-foreground">Nenhum relatório salvo encontrado.</p>
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in">
            {filtered.map((report) => {
              const periodLabel = report.date_mode === "single"
                ? report.data_unica || ""
                : `${report.data_inicio} até ${report.data_fim}`;
              const createdAt = format(new Date(report.criado_em), "dd/MM/yyyy HH:mm");
              const isSelected = selectedIds.includes(report.id);
              const totalMeasurements = (report.snapshot as any)?.summary?.totalMeasurements != null ? Math.round((report.snapshot as any).summary.totalMeasurements) : "—";

              return (
                <div
                  key={report.id}
                  className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-lg border transition-colors ${
                    isSelected
                      ? "bg-primary/10 border-primary/30"
                      : "bg-muted/50 border-border/50"
                  }`}
                >
                  {compareMode && (
                    <button
                      onClick={() => toggleSelect(report.id)}
                      className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {isSelected && <Check className="w-4 h-4" />}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{report.obra_nome}</p>
                    <p className="text-xs text-muted-foreground">
                      Período: {periodLabel}
                      {report.especialidade_nome && ` • ${report.especialidade_nome}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Medições: {totalMeasurements} • Criado em: {createdAt}
                    </p>
                  </div>
                  {!compareMode && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setViewingReport(report)}>
                        <Eye className="w-3.5 h-3.5" /> Visualizar
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleExportPDF(report)}>
                        <FileDown className="w-3.5 h-3.5" /> PDF
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir relatório?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(report.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
