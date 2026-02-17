import { useState } from "react";
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
import { Search, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const categoryBadgeVariant: Record<string, string> = {
  Produtivo: "bg-success/15 text-success border-success/30",
  Suplementar: "bg-primary/15 text-primary border-primary/30",
  "Não Produtivo": "bg-destructive/15 text-destructive border-destructive/30",
};

export default function Records() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterEspecialidade, setFilterEspecialidade] = useState("all");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [filterObra, setFilterObra] = useState("all");

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

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Registros</h1>
          <p className="text-sm text-muted-foreground mt-1">Todas as observações de produtividade registradas</p>
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
