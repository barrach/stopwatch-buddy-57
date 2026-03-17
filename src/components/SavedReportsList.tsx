import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Eye, FileDown, Trash2, Search } from "lucide-react";
import { format } from "date-fns";

export interface SavedReport {
  id: string;
  criado_em: string;
  titulo: string;
  date_mode: string;
  data_unica: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  obra_id: string;
  obra_nome: string;
  especialidade_id: string | null;
  especialidade_nome: string | null;
  snapshot: any;
}

interface Props {
  obras: Array<{ id: string; nome: string }>;
  onView: (report: SavedReport) => void;
  onExportPDF: (report: SavedReport) => void;
}

export default function SavedReportsList({ obras, onView, onExportPDF }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchDate, setSearchDate] = useState("");
  const [searchObraId, setSearchObraId] = useState("");

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
      if (searchDate) {
        if (r.date_mode === "single" && r.data_unica !== searchDate) return false;
        if (r.date_mode === "period" && !(r.data_inicio! <= searchDate && searchDate <= r.data_fim!)) return false;
      }
      return true;
    });
  }, [savedReports, searchDate, searchObraId]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("relatorios_salvos").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Relatório excluído" });
      queryClient.invalidateQueries({ queryKey: ["relatorios_salvos"] });
    }
  };

  if (isLoading) return null;
  if (savedReports.length === 0) return null;

  return (
    <div className="stat-card animate-fade-in">
      <h3 className="text-sm font-semibold text-foreground mb-4">Relatórios Salvos</h3>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <Label className="text-xs text-muted-foreground">Filtrar por data</Label>
          <Input type="date" value={searchDate} onChange={(e) => setSearchDate(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Filtrar por contrato</Label>
          <Select value={searchObraId || "all"} onValueChange={(v) => setSearchObraId(v === "all" ? "" : v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum relatório encontrado.</p>
        )}
        {filtered.map((report) => {
          const periodLabel = report.date_mode === "single"
            ? report.data_unica || ""
            : `${report.data_inicio} até ${report.data_fim}`;
          const createdAt = format(new Date(report.criado_em), "dd/MM/yyyy HH:mm");

          return (
            <div key={report.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{report.obra_nome}</p>
                <p className="text-xs text-muted-foreground">
                  Período: {periodLabel}
                  {report.especialidade_nome && ` • ${report.especialidade_nome}`}
                </p>
                <p className="text-xs text-muted-foreground">Criado em: {createdAt}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onView(report)}>
                  <Eye className="w-3.5 h-3.5" /> Visualizar
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onExportPDF(report)}>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
