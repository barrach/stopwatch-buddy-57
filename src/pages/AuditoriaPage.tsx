import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { Search, RotateCcw, X, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AuditoriaPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [search, setSearch] = useState("");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");

  if (adminLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground text-sm">Carregando...</div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, nome, email");
      if (error) throw error;
      return data;
    },
  });
  const profileMap = new Map(profiles.map((p) => [p.user_id, p.nome || p.email || p.user_id.substring(0, 8)]));

  const { data: deletedRecords = [], isLoading } = useQuery({
    queryKey: ["observacoes_deletadas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("observacoes")
        .select("*, rotas(nome), especialidades(nome), categorias_observacao(nome), obras(nome)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { mutate: restoreRecord } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("observacoes")
        .update({ deleted_at: null, deleted_by: null, deleted_reason: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["observacoes_deletadas"] });
      queryClient.invalidateQueries({ queryKey: ["observacoes"] });
      toast({ title: "Registro restaurado", description: "O registro voltou para a listagem ativa." });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao restaurar", description: err.message, variant: "destructive" });
    },
  });

  const { mutate: permanentDelete } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("observacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["observacoes_deletadas"] });
      toast({ title: "Registro eliminado", description: "O registro foi permanentemente removido.", variant: "destructive" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao eliminar", description: err.message, variant: "destructive" });
    },
  });

  const filtered = deletedRecords.filter((r: any) => {
    if (filterDateStart && r.deleted_at && r.deleted_at.slice(0, 10) < filterDateStart) return false;
    if (filterDateEnd && r.deleted_at && r.deleted_at.slice(0, 10) > filterDateEnd) return false;
    if (search) {
      const q = search.toLowerCase();
      const desc = r.descricao?.toLowerCase() || "";
      const esp = (r.especialidades as any)?.nome?.toLowerCase() || "";
      const obra = (r.obras as any)?.nome?.toLowerCase() || "";
      return desc.includes(q) || esp.includes(q) || obra.includes(q);
    }
    return true;
  });

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Auditoria de Exclusões</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registros excluídos logicamente — rastreáveis com data e responsável. Você pode restaurar ou eliminar permanentemente.
          </p>
        </div>

        {/* Filters */}
        <div className="stat-card mb-4 animate-fade-in">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por descrição, especialidade, obra..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Excluído de</Label>
              <Input
                type="date"
                value={filterDateStart}
                onChange={(e) => setFilterDateStart(e.target.value)}
                className="w-38 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Excluído até</Label>
              <Input
                type="date"
                value={filterDateEnd}
                onChange={(e) => setFilterDateEnd(e.target.value)}
                className="w-38 mt-1"
              />
            </div>
            {(filterDateStart || filterDateEnd) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10 px-2 text-muted-foreground"
                onClick={() => { setFilterDateStart(""); setFilterDateEnd(""); }}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="mb-4 flex gap-4 flex-wrap">
          <div className="stat-card flex-1 min-w-[160px] py-3 px-4">
            <p className="text-xs text-muted-foreground">Total excluídos</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{deletedRecords.length}</p>
          </div>
          <div className="stat-card flex-1 min-w-[160px] py-3 px-4">
            <p className="text-xs text-muted-foreground">Filtrados</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{filtered.length}</p>
          </div>
        </div>

        {/* Table */}
        <div className="stat-card animate-fade-in overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-semibold">Data Obs.</TableHead>
                <TableHead className="text-xs font-semibold">Obra</TableHead>
                <TableHead className="text-xs font-semibold">Especialidade</TableHead>
                <TableHead className="text-xs font-semibold">Descrição</TableHead>
                <TableHead className="text-xs font-semibold text-right">Qtd</TableHead>
                <TableHead className="text-xs font-semibold">Excluído em</TableHead>
                <TableHead className="text-xs font-semibold">Excluído por</TableHead>
                <TableHead className="text-xs font-semibold text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                    Nenhum registro excluído encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r: any) => {
                  const deletedBy = r.deleted_by ? (profileMap.get(r.deleted_by) || r.deleted_by.substring(0, 8) + "…") : "—";
                  return (
                    <TableRow key={r.id} className="opacity-80 hover:opacity-100">
                      <TableCell className="text-xs">{r.data}</TableCell>
                      <TableCell className="text-xs">{(r.obras as any)?.nome || "—"}</TableCell>
                      <TableCell className="text-xs font-medium">{(r.especialidades as any)?.nome || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{r.descricao}</TableCell>
                      <TableCell className="text-xs text-right font-bold">{r.quantidade}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.deleted_at)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={deletedBy}>
                        {deletedBy}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Restore */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-success" title="Restaurar">
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Restaurar registro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  O registro voltará para a listagem ativa e ficará visível novamente nos Registros e Dashboard.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => restoreRecord(r.id)}>Restaurar</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          {/* Permanent delete */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Eliminar permanentemente">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-destructive">Eliminar permanentemente?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  <strong>Esta ação não pode ser desfeita.</strong> O registro será removido definitivamente do banco de dados, sem possibilidade de recuperação.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => permanentDelete(r.id)}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  Eliminar permanentemente
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground mt-3">{filtered.length} registro(s) excluído(s) encontrado(s)</p>
      </div>
    </AppLayout>
  );
}
