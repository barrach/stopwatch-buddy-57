import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIME_SLOTS } from "@/data/mockData";
import { Camera, Save, RotateCcw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import { addToQueue } from "@/lib/offlineQueue";

export default function NewObservation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [rotaId, setRotaId] = useState("");
  const [obraId, setObraId] = useState("");
  const [especialidadeId, setEspecialidadeId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");

  const { data: rotas = [] } = useOfflineQuery<{ id: string; nome: string }>(
    ["rotas", "ativas"], "rotas", "id, nome",
    [{ column: "status", value: "Ativo" }], "nome"
  );

  const { data: obras = [] } = useOfflineQuery<{ id: string; nome: string }>(
    ["obras", "ativas"], "obras", "id, nome",
    [{ column: "status", value: "Ativo" }], "nome"
  );

  const { data: especialidades = [] } = useOfflineQuery<{ id: string; nome: string }>(
    ["especialidades", "ativas"], "especialidades", "id, nome",
    [{ column: "status", value: "Ativo" }], "nome"
  );

  const { data: categorias = [] } = useOfflineQuery<{ id: string; nome: string; categoria_pai_id: string | null; status: string }>(
    ["categorias_observacao", "all"], "categorias_observacao", "id, nome, categoria_pai_id, status"
  );

  const parentCategorias = useMemo(
    () => categorias.filter((c) => !c.categoria_pai_id && c.status === "Ativo"),
    [categorias]
  );

  const subcategorias = useMemo(
    () => categoriaId ? categorias.filter((c) => c.categoria_pai_id === categoriaId && c.status === "Ativo") : [],
    [categorias, categoriaId]
  );

  const { mutate: saveObservation, isPending } = useMutation({
    retry: false,
    mutationFn: async (payload: {
      data: string; horario: string; rota_id: string; obra_id: string;
      contrato_id: string | null; especialidade_id: string; categoria_id: string;
      descricao: string; empresa: string; quantidade: number; notas: string | null;
    }) => {
      if (!navigator.onLine) {
        await addToQueue({ table: "observacoes", operation: "insert", payload });
        return;
      }
      const { error } = await supabase.from("observacoes").insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      if (navigator.onLine) {
        queryClient.invalidateQueries({ queryKey: ["observacoes"] });
      }
      const catName = parentCategorias.find(c => c.id === categoriaId)?.nome ?? "";
      const offlineMsg = !navigator.onLine ? " (salvo offline)" : "";
      toast({ title: `Observação registrada!${offlineMsg}`, description: `${catName} — ${descricao} (${quantity} amostras)` });
      setCategoriaId("");
      setDescricao("");
      setEspecialidadeId("");
      setRotaId("");
      setObraId("");
      setTime("");
      setQuantity("1");
      setNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!especialidadeId || !rotaId || !obraId || !time || !categoriaId || !descricao || !quantity) {
      toast({ title: "Campos obrigatórios", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }
    saveObservation({
      data: date,
      horario: time,
      rota_id: rotaId,
      obra_id: obraId,
      contrato_id: null,
      especialidade_id: especialidadeId,
      categoria_id: categoriaId,
      descricao,
      empresa: "MEGASTEAM",
      quantidade: parseInt(quantity, 10),
      notas: notes || null,
    });
  };

  const handleRepeat = () => {
    toast({ title: "Repetir último registro", description: "Campos preenchidos com a última observação." });
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 md:mb-8">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Nova Observação</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registre uma nova observação de produtividade
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
          {/* Identification */}
          <div className="stat-card animate-fade-in">
            <h3 className="text-sm font-semibold text-foreground mb-4">Identificação</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date" className="text-xs text-muted-foreground">Data</Label>
                <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Horário *</Label>
                <Select value={time} onValueChange={setTime}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Contrato *</Label>
                <Select value={obraId} onValueChange={setObraId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Rota *</Label>
                <Select value={rotaId} onValueChange={setRotaId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {rotas.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Observation Details */}
          <div className="stat-card animate-fade-in">
            <h3 className="text-sm font-semibold text-foreground mb-4">Observação</h3>
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Especialidade *</Label>
                <Select value={especialidadeId} onValueChange={setEspecialidadeId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a especialidade..." /></SelectTrigger>
                  <SelectContent>
                    {especialidades.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Categoria *</Label>
                <Select value={categoriaId} onValueChange={(v) => { setCategoriaId(v); setDescricao(""); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a categoria..." /></SelectTrigger>
                  <SelectContent>
                    {parentCategorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Descrição *</Label>
                <Select value={descricao} onValueChange={setDescricao} disabled={!categoriaId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder={categoriaId ? "Selecione a descrição..." : "Selecione a categoria primeiro"} /></SelectTrigger>
                  <SelectContent>
                    {subcategorias.map((s) => <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="qty" className="text-xs text-muted-foreground">Quantidade de Amostras *</Label>
                  <Input id="qty" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1" />
                </div>
              </div>

              <div>
                <Label htmlFor="notes" className="text-xs text-muted-foreground">Observações</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações adicionais..." className="mt-1" rows={3} />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Foto</Label>
                <button
                  type="button"
                  className="mt-1 w-full h-24 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <Camera className="w-6 h-6" />
                  <span className="text-xs">Tirar foto ou anexar</span>
                </button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button type="submit" className="flex-1 gap-2" disabled={isPending}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Observação
            </Button>
            <Button type="button" variant="outline" onClick={handleRepeat} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Repetir Último
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
