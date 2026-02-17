import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/integrations/supabase/client";
import { Search, Trash2, Download, Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { exportToExcel, parseExcelFile, type ExportRow } from "@/lib/excelUtils";

const categoryBadgeVariant: Record<string, string> = {
  Produtivo: "bg-success/15 text-success border-success/30",
  Suplementar: "bg-primary/15 text-primary border-primary/30",
  "Não Produtivo": "bg-destructive/15 text-destructive border-destructive/30",
};

export default function Records() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [filterEspecialidade, setFilterEspecialidade] = useState("all");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [filterObra, setFilterObra] = useState("all");
  const [importing, setImporting] = useState(false);

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

  const { data: records = [] } = useQuery({
    queryKey: ["observacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("observacoes")
        .select("*, rotas(nome), especialidades(nome), categorias_observacao(nome), obras(nome)")
        .order("data", { ascending: false })
        .order("horario", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { mutate: deleteRecord } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("observacoes").delete().eq("id", id);
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
    if (search) {
      const q = search.toLowerCase();
      const desc = r.descricao?.toLowerCase() || "";
      const esp = (r.especialidades as any)?.nome?.toLowerCase() || "";
      return desc.includes(q) || esp.includes(q);
    }
    return true;
  });

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

      // Build lookup maps from cached data
      const obraMap = new Map(obras.map((o) => [o.nome.toLowerCase(), o.id]));
      const espMap = new Map(especialidades.map((s) => [s.nome.toLowerCase(), s.id]));
      const catMap = new Map(categorias.map((c) => [c.nome.toLowerCase(), c.id]));

      // Fetch rotas for lookup
      const { data: rotasData } = await supabase.from("rotas").select("id, nome").eq("status", "Ativo");
      const rotaMap = new Map((rotasData || []).map((r) => [r.nome.toLowerCase(), r.id]));

      const errors: string[] = [];
      const insertRows: any[] = [];

      rows.forEach((row, i) => {
        const lineNum = i + 2; // header is row 1
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
          criado_por: user?.id || null,
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
        <div className="stat-card mb-6 animate-fade-in">
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
          </div>
        </div>

        {/* Table */}
        <div className="stat-card animate-fade-in overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-semibold">Data</TableHead>
                <TableHead className="text-xs font-semibold">Hora</TableHead>
                <TableHead className="text-xs font-semibold">Obra</TableHead>
                <TableHead className="text-xs font-semibold">Rota</TableHead>
                <TableHead className="text-xs font-semibold">Especialidade</TableHead>
                <TableHead className="text-xs font-semibold">Categoria</TableHead>
                <TableHead className="text-xs font-semibold">Descrição</TableHead>
                <TableHead className="text-xs font-semibold text-right">Qtd</TableHead>
                <TableHead className="text-xs font-semibold w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r: any) => {
                const catNome = (r.categorias_observacao as any)?.nome || "";
                return (
                  <TableRow key={r.id} className="cursor-pointer">
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
                            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
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
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">
                    Nenhum registro encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground mt-3">{filtered.length} registro(s) encontrado(s)</p>
      </div>
    </AppLayout>
  );
}
