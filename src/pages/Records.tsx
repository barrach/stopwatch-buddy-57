import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Search, Trash2, Download, Upload, Loader2, AlertTriangle, X, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TIME_SLOTS } from "@/data/mockData";

import { exportToExcel, parseExcelFile, type ExportRow } from "@/lib/excelUtils";

const PAGE_SIZE = 50;

const categoryBadgeVariant: Record<string, string> = {
  Produtivo: "bg-success/15 text-success border-success/30",
  Suplementar: "bg-primary/15 text-primary border-primary/30",
  "Não Produtivo": "bg-destructive/15 text-destructive border-destructive/30",
};

export default function Records() {
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [filterEspecialidade, setFilterEspecialidade] = useState("all");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [filterObra, setFilterObra] = useState("all");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(1);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);

  const { data: rotas = [] } = useQuery({
    queryKey: ["rotas", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rotas").select("id, nome").eq("status", "Ativo").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: allCategorias = [] } = useQuery({
    queryKey: ["categorias_observacao", "all_for_edit"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_observacao").select("id, nome, categoria_pai_id, status");
      if (error) throw error;
      return data;
    },
  });

  const { data: funcoes = [] } = useQuery({
    queryKey: ["funcoes", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("funcoes").select("id, nome, especialidade_id").eq("status", "Ativo").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const parentCategorias = useMemo(() => allCategorias.filter(c => !c.categoria_pai_id && c.status === "Ativo"), [allCategorias]);
  const editSubcategorias = useMemo(() => {
    if (!editForm.categoria_id) return [];
    return allCategorias.filter(c => c.categoria_pai_id === editForm.categoria_id && c.status === "Ativo");
  }, [allCategorias, editForm.categoria_id]);
  const editFilteredFuncoes = useMemo(() => {
    if (!editForm.especialidade_id) return funcoes;
    return funcoes.filter(f => f.especialidade_id === editForm.especialidade_id || !f.especialidade_id);
  }, [funcoes, editForm.especialidade_id]);

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

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias_observacao", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_observacao").select("id, nome").eq("status", "Ativo").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, nome, email");
      if (error) throw error;
      return data;
    },
  });

  const profileMap = new Map(profiles.map((p) => [p.user_id, p.nome || p.email || p.user_id.substring(0, 8)]));

  const { data: records = [] } = useQuery({
    queryKey: ["observacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("observacoes")
        .select("*, rotas(nome), especialidades(nome), categorias_observacao(nome), obras(nome)")
        .is("deleted_at", null)
        .order("data", { ascending: false })
        .order("horario", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { mutate: deleteRecord } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("observacoes")
        .update({ deleted_at: new Date().toISOString(), deleted_by: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["observacoes"] });
      toast({ title: "Registro excluído", description: "Registro removido com sucesso." });
    },
  });

  const filtered = records.filter((r: any) => {
    if (filterEspecialidade !== "all" && r.especialidade_id !== filterEspecialidade) return false;
    if (filterCategoria !== "all" && r.categoria_id !== filterCategoria) return false;
    if (filterObra !== "all" && r.obra_id !== filterObra) return false;
    if (filterDateStart && r.data < filterDateStart) return false;
    if (filterDateEnd && r.data > filterDateEnd) return false;
    if (search) {
      const q = search.toLowerCase();
      const desc = r.descricao?.toLowerCase() || "";
      const esp = (r.especialidades as any)?.nome?.toLowerCase() || "";
      return desc.includes(q) || esp.includes(q);
    }
    return true;
  }).sort((a: any, b: any) => {
    // Sort by date descending, then by time descending (parsing minutes for correct order)
    const dateCmp = b.data.localeCompare(a.data);
    if (dateCmp !== 0) return dateCmp;
    const parseMin = (t: string) => { const p = t.split(":"); return parseInt(p[0], 10) * 60 + parseInt(p[1] || "0", 10); };
    return parseMin(b.horario) - parseMin(a.horario);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filteredIds = new Set(filtered.map((r: any) => r.id));

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [search, filterEspecialidade, filterCategoria, filterObra, filterDateStart, filterDateEnd]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((r: any) => selectedIds.has(r.id));
  const someSelected = selectedIds.size > 0;
  const selectedInCurrentFilter = [...selectedIds].filter(id => filteredIds.has(id)).length;

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach((r: any) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach((r: any) => next.add(r.id));
        return next;
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    const idsToDelete = [...selectedIds].filter(id => filteredIds.has(id));
    let succeeded = 0;
    let failed = 0;

    try {
      const { error } = await supabase
        .from("observacoes")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: null,
        })
        .in("id", idsToDelete);

      if (error) {
        failed = idsToDelete.length;
      } else {
        succeeded = idsToDelete.length;
      }
    } catch {
      failed = idsToDelete.length;
    }

    setBulkDeleting(false);
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["observacoes"] });

    if (failed > 0) {
      toast({
        title: `Exclusão parcial`,
        description: `${succeeded} excluído(s) com sucesso. ${failed} falharam.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Registros excluídos",
        description: `${succeeded} registro(s) removidos com sucesso.`,
      });
    }
  };

  const handleExport = () => {
    const rows: ExportRow[] = filtered.map((r: any) => ({
      Data: r.data,
      "Horário": r.horario,
      Obra: (r.obras as any)?.nome || "",
      Rota: (r.rotas as any)?.nome || "",
      Especialidade: (r.especialidades as any)?.nome || "",
      Categoria: (r.categorias_observacao as any)?.nome || "",
      "Descrição": r.descricao || "",
      Quantidade: r.quantidade,
      Empresa: r.empresa || "",
      Notas: r.notas || "",
    }));
    if (rows.length === 0) {
      toast({ title: "Sem dados", description: "Nenhum registro para exportar.", variant: "destructive" });
      return;
    }
    exportToExcel(rows);
    toast({ title: "Exportado!", description: `${rows.length} registro(s) exportados para Excel.` });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const rows = await parseExcelFile(file);

      const obraMap = new Map(obras.map((o) => [o.nome.toLowerCase(), o.id]));
      const espMap = new Map(especialidades.map((s) => [s.nome.toLowerCase(), s.id]));
      const catMap = new Map(categorias.map((c) => [c.nome.toLowerCase(), c.id]));

      const { data: rotasData } = await supabase.from("rotas").select("id, nome").eq("status", "Ativo");
      const rotaMap = new Map((rotasData || []).map((r) => [r.nome.toLowerCase(), r.id]));

      const errors: string[] = [];
      const insertRows: any[] = [];

      rows.forEach((row, i) => {
        const lineNum = i + 2;
        const obraId = obraMap.get(String(row.Obra || "").toLowerCase());
        const rotaId = rotaMap.get(String(row.Rota || "").toLowerCase());
        const espId = espMap.get(String(row.Especialidade || "").toLowerCase());
        const catId = catMap.get(String(row.Categoria || "").toLowerCase());

        if (!obraId) { errors.push(`Linha ${lineNum}: Obra "${row.Obra}" não encontrada`); return; }
        if (!rotaId) { errors.push(`Linha ${lineNum}: Rota "${row.Rota}" não encontrada`); return; }
        if (!espId) { errors.push(`Linha ${lineNum}: Especialidade "${row.Especialidade}" não encontrada`); return; }
        if (!catId) { errors.push(`Linha ${lineNum}: Categoria "${row.Categoria}" não encontrada`); return; }

        insertRows.push({
          data: String(row.Data),
          horario: String(row["Horário"] || row.Horário || ""),
          obra_id: obraId,
          rota_id: rotaId,
          especialidade_id: espId,
          categoria_id: catId,
          descricao: String(row["Descrição"] || row.Descrição || ""),
          quantidade: Number(row.Quantidade) || 1,
          empresa: String(row.Empresa || "MEGASTEM"),
          notas: row.Notas ? String(row.Notas) : null,
          contrato_id: null,
          criado_por: null,
        });
      });

      if (errors.length > 0 && insertRows.length === 0) {
        toast({ title: "Erro na importação", description: errors.slice(0, 5).join("\n"), variant: "destructive" });
        return;
      }

      if (insertRows.length > 0) {
        const { error } = await supabase.from("observacoes").insert(insertRows);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["observacoes"] });
      }

      const msg = `${insertRows.length} registro(s) importados.` + (errors.length > 0 ? ` ${errors.length} linha(s) com erro ignoradas.` : "");
      toast({ title: "Importação concluída!", description: msg });
    } catch (err: any) {
      toast({ title: "Erro na importação", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Registros</h1>
            <p className="text-sm text-muted-foreground mt-1">Todas as observações de produtividade registradas</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={handleExport}>
              <Download className="w-4 h-4" /> Exportar
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importar
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          </div>
        </div>

        {/* Filters */}
        <div className="stat-card mb-4 animate-fade-in">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar registros..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="w-48">
              <Select value={filterObra} onValueChange={setFilterObra}>
                <SelectTrigger><SelectValue placeholder="Obra" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Obras</SelectItem>
                  {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Select value={filterEspecialidade} onValueChange={setFilterEspecialidade}>
                <SelectTrigger><SelectValue placeholder="Especialidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Especialidades</SelectItem>
                  {especialidades.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Categorias</SelectItem>
                  {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Date range */}
            <div>
              <Label className="text-xs text-muted-foreground">De</Label>
              <Input
                type="date"
                value={filterDateStart}
                onChange={(e) => setFilterDateStart(e.target.value)}
                className="w-38 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Até</Label>
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

        {/* Bulk action bar */}
        {someSelected && (
          <div className="mb-4 flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 animate-fade-in">
            <span className="text-sm font-medium text-foreground">
              {selectedInCurrentFilter} registro(s) selecionado(s)
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="w-3 h-3" /> Limpar seleção
            </Button>
            <div className="flex-1" />
            <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  disabled={selectedInCurrentFilter === 0}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Apagar {selectedInCurrentFilter} selecionado(s)
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    Confirmar exclusão em massa
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3">
                      <p>
                        Você está prestes a excluir <strong>{selectedInCurrentFilter} registro(s)</strong>.
                      </p>
                      <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                        ⚠️ Esta ação é auditável — os registros ficarão marcados como excluídos com data e usuário responsável, mas não aparecerão mais na listagem.
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleBulkDelete}
                    className="bg-destructive hover:bg-destructive/90"
                    disabled={bulkDeleting}
                  >
                    {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Confirmar exclusão
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Table */}
        <div className="stat-card animate-fade-in overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Selecionar todos"
                    className="translate-y-[2px]"
                  />
                </TableHead>
                <TableHead className="text-xs font-semibold">Data</TableHead>
                <TableHead className="text-xs font-semibold">Hora</TableHead>
                <TableHead className="text-xs font-semibold">Obra</TableHead>
                <TableHead className="text-xs font-semibold">Rota</TableHead>
                <TableHead className="text-xs font-semibold">Especialidade</TableHead>
                <TableHead className="text-xs font-semibold">Categoria</TableHead>
                <TableHead className="text-xs font-semibold">Descrição</TableHead>
                <TableHead className="text-xs font-semibold text-right">Qtd</TableHead>
                <TableHead className="text-xs font-semibold">Registrado por</TableHead>
                <TableHead className="text-xs font-semibold w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((r: any) => {
                const catNome = (r.categorias_observacao as any)?.nome || "";
                const isSelected = selectedIds.has(r.id);
                const userName = r.criado_por ? (profileMap.get(r.criado_por) || r.criado_por.substring(0, 8) + "…") : "—";
                return (
                  <TableRow
                    key={r.id}
                    className={`cursor-pointer ${isSelected ? "bg-primary/5" : ""}`}
                  >
                    <TableCell className="pl-4">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(r.id)}
                        aria-label="Selecionar registro"
                        className="translate-y-[2px]"
                      />
                    </TableCell>
                    <TableCell className="text-xs">{r.data}</TableCell>
                    <TableCell className="text-xs">{r.horario}</TableCell>
                    <TableCell className="text-xs">{(r.obras as any)?.nome}</TableCell>
                    <TableCell className="text-xs">{(r.rotas as any)?.nome}</TableCell>
                    <TableCell className="text-xs font-medium">{(r.especialidades as any)?.nome}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${categoryBadgeVariant[catNome] || ""}`}>
                        {catNome}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{r.descricao}</TableCell>
                    <TableCell className="text-xs text-right font-bold">{r.quantidade}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={userName}>
                      {userName}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação é auditável — o registro ficará marcado como excluído com data e responsável.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteRecord(r.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                );
              })}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-sm text-muted-foreground">
                    Nenhum registro encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination + count */}
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-muted-foreground">{filtered.length} registro(s) encontrado(s)</p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
