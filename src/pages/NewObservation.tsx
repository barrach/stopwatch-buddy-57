import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useIsAdmin";
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
import { Camera, Save, RotateCcw, Loader2, Sparkles, Clock, CalendarRange } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import { addToQueue } from "@/lib/offlineQueue";
import { normalizeDescriptionName, normalizeDescriptionOptions } from "@/lib/categoryNormalization";

interface LastObservation {
  time: string; rotaId: string; obraId: string; especialidadeId: string;
  categoriaId: string; descricao: string; quantity: string; notes: string;
}

export default function NewObservation() {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [isRangeMode, setIsRangeMode] = useState(false);
  const [isDinamicoToggle, setIsDinamicoToggle] = useState(true);
  const [rotaId, setRotaId] = useState("");
  const [obraId, setObraId] = useState("");
  const [especialidadeId, setEspecialidadeId] = useState("");
  
  const [categoriaId, setCategoriaId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [lastObs, setLastObs] = useState<LastObservation | null>(null);

  const { data: allRotas = [] } = useOfflineQuery<{ id: string; nome: string; obra_id: string }>(
    ["rotas", "ativas"], "rotas", "id, nome, obra_id",
    [{ column: "status", value: "Ativo" }], "nome"
  );

  const rotas = useMemo(
    () => obraId ? allRotas.filter((r) => r.obra_id === obraId) : [],
    [allRotas, obraId]
  );

  const { data: obras = [] } = useOfflineQuery<{ id: string; nome: string }>(
    ["obras", "ativas"], "obras", "id, nome",
    [{ column: "status", value: "Ativo" }], "nome"
  );

  const { data: especialidades = [] } = useOfflineQuery<{ id: string; nome: string }>(
    ["especialidades", "ativas"], "especialidades", "id, nome",
    [{ column: "status", value: "Ativo" }], "nome"
  );

  const { data: categorias = [] } = useOfflineQuery<{ id: string; nome: string; categoria_pai_id: string | null; status: string; impacta_produtividade: boolean }>(
    ["categorias_observacao", "all"], "categorias_observacao", "id, nome, categoria_pai_id, status, impacta_produtividade"
  );


  const parentCategorias = useMemo(
    () => categorias.filter((c) => !c.categoria_pai_id && c.status === "Ativo"),
    [categorias]
  );

  // Detect if selected parent category is NPE (impacta_produtividade === false)
  const isNpeCategory = useMemo(() => {
    if (!categoriaId) return false;
    const parent = categorias.find((c) => c.id === categoriaId);
    return parent ? (parent as any).impacta_produtividade === false : false;
  }, [categorias, categoriaId]);

  // Detect if description is "Aguardando Liberação de PT"
  const isPtDescription = useMemo(() => {
    if (!descricao) return false;
    return normalizeDescriptionName(descricao) === "Aguardando Liberação de PT";
  }, [descricao]);

  // NPE is always dynamic; PT is dynamic only if toggle is ON
  const isDynamicObservation = useMemo(() => {
    if (isNpeCategory) return true;
    if (isPtDescription && isDinamicoToggle) return true;
    return false;
  }, [isNpeCategory, isPtDescription, isDinamicoToggle]);

  const subcategorias = useMemo(
    () => categoriaId
      ? normalizeDescriptionOptions(categorias.filter((c) => c.categoria_pai_id === categoriaId && c.status === "Ativo"))
      : [],
    [categorias, categoriaId]
  );

  const { mutate: saveObservation, isPending } = useMutation({
    retry: false,
    mutationFn: async (payload: {
      data: string; horario: string; rota_id: string; obra_id: string;
      contrato_id: string | null; especialidade_id: string; funcao_id: string | null;
      categoria_id: string; descricao: string; empresa: string;
      quantidade: number; notas: string | null;
    }) => {
      if (!navigator.onLine) {
        await addToQueue({ table: "observacoes", operation: "insert", payload });
        return;
      }
      const { error } = await supabase.from("observacoes").insert([payload]);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      if (navigator.onLine) {
        queryClient.invalidateQueries({ queryKey: ["observacoes"] });
      }
      // Save last observation for repeat
      setLastObs({
        time, rotaId, obraId, especialidadeId, categoriaId, descricao, quantity, notes,
      });
      const catName = parentCategorias.find(c => c.id === categoriaId)?.nome ?? "";
      const offlineMsg = !navigator.onLine ? " (salvo offline)" : "";
      toast({ title: `Observação registrada!${offlineMsg}`, description: `${catName} — ${descricao} (${quantity} amostras)` });
      setCategoriaId("");
      setDescricao("");
      setEspecialidadeId("");
      setRotaId("");
      setObraId("");
      setTime("");
      setTimeEnd("");
      setQuantity("1");
      setNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const getTimeSlotsInRange = (start: string, end: string): string[] => {
    const startIdx = TIME_SLOTS.indexOf(start as any);
    const endIdx = TIME_SLOTS.indexOf(end as any);
    if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return [];
    return TIME_SLOTS.slice(startIdx, endIdx + 1) as unknown as string[];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!especialidadeId || !rotaId || !obraId || !time || !categoriaId || !descricao || !quantity) {
      toast({ title: "Campos obrigatórios", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }
    if (isRangeMode && !timeEnd) {
      toast({ title: "Campos obrigatórios", description: "Selecione o horário final do intervalo.", variant: "destructive" });
      return;
    }

    const slots = isRangeMode ? getTimeSlotsInRange(time, timeEnd) : [time];
    if (isRangeMode && slots.length === 0) {
      toast({ title: "Intervalo inválido", description: "O horário inicial deve ser anterior ao final.", variant: "destructive" });
      return;
    }

    const isDinamico = isNpeCategory || (isPtDescription && isDinamicoToggle);

    for (const slot of slots) {
      saveObservation({
        data: date,
        horario: slot,
        rota_id: rotaId,
        obra_id: obraId,
        contrato_id: null,
        especialidade_id: especialidadeId,
        funcao_id: null,
        categoria_id: categoriaId,
        descricao,
        empresa: "MEGASTEAM",
        quantidade: isDinamico ? 1 : parseInt(quantity, 10),
        notas: notes || null,
        is_dinamico: isDinamico,
      });
    }
  };

  const handleRepeat = () => {
    if (!lastObs) {
      toast({ title: "Nenhum registro anterior", description: "Salve uma observação primeiro para poder repetir.", variant: "destructive" });
      return;
    }
    // Set obraId first so rotas memo recomputes, then set rotaId after a tick
    setObraId(lastObs.obraId);
    setTime(lastObs.time);
    setEspecialidadeId(lastObs.especialidadeId);
    setCategoriaId(lastObs.categoriaId);
    setQuantity(lastObs.quantity);
    setNotes(lastObs.notes);
    // Defer rotaId and descricao so dependent memos recompute first
    setTimeout(() => {
      setRotaId(lastObs.rotaId);
      setDescricao(normalizeDescriptionName(lastObs.descricao));
      // Validate rota still exists
      const rotaExists = allRotas.some((r) => r.id === lastObs.rotaId && r.obra_id === lastObs.obraId);
      if (!rotaExists) {
        toast({ title: "Rota anterior não encontrada", description: "A rota da última observação não está mais disponível.", variant: "destructive" });
      }
    }, 50);
    toast({ title: "Repetir último registro", description: "Campos preenchidos com a última observação." });
  };

  const handleAISuggest = async () => {
    setIsSuggesting(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const especialidadeNome = especialidades.find((e) => e.id === especialidadeId)?.nome || "";
      const obraNome = obras.find((o) => o.id === obraId)?.nome || "";
      const rotaNome = rotas.find((r) => r.id === rotaId)?.nome || "";

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-observations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          type: "suggest",
          context: {
            especialidade: especialidadeNome,
            obra: obraNome,
            rota: rotaNome,
            horario: time,
            notas: notes,
          },
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        if (resp.status === 429) toast({ title: "Limite atingido", description: err.error, variant: "destructive" });
        else if (resp.status === 402) toast({ title: "Créditos insuficientes", description: err.error, variant: "destructive" });
        else throw new Error(err.error || "Erro ao buscar sugestão");
        return;
      }

      const { suggestion } = await resp.json();
      if (!suggestion) {
        toast({ title: "Sem sugestão", description: "A IA não conseguiu sugerir uma categoria para este contexto.", variant: "destructive" });
        return;
      }

      // Find the matching parent category
      const matchedParent = parentCategorias.find(
        (c) => c.nome.toLowerCase() === suggestion.categoria?.toLowerCase()
      );
      if (matchedParent) {
        setCategoriaId(matchedParent.id);
        setDescricao(""); // reset so user picks sub after category loads
        // Try to auto-set description after state updates
        setTimeout(() => {
          const subs = categorias.filter(
            (c) => c.categoria_pai_id === matchedParent.id && c.status === "Ativo"
          );
          const matchedSub = subs.find(
            (s) => s.nome.toLowerCase() === suggestion.descricao?.toLowerCase()
          );
          if (matchedSub) setDescricao(matchedSub.nome);
        }, 100);
      }

      toast({
        title: "Sugestão da IA",
        description: `${suggestion.categoria} → ${suggestion.descricao}. ${suggestion.justificativa}`,
      });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setIsSuggesting(false);
    }
  };

  if (adminLoading) return <AppLayout><div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div></AppLayout>;
  if (!isAdmin) return <Navigate to="/" replace />;

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
              <div className={isRangeMode ? "sm:col-span-2" : ""}>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-muted-foreground">
                    {isRangeMode ? "Intervalo de Horário *" : "Horário *"}
                  </Label>
                  <div className="flex items-center gap-2">
                    <CalendarRange className="w-3.5 h-3.5 text-muted-foreground" />
                    <Label htmlFor="range-mode" className="text-xs text-muted-foreground cursor-pointer">Intervalo</Label>
                    <Switch
                      id="range-mode"
                      checked={isRangeMode}
                      onCheckedChange={(checked) => {
                        setIsRangeMode(checked);
                        if (!checked) setTimeEnd("");
                      }}
                      className="scale-75"
                    />
                  </div>
                </div>
                {isRangeMode ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Select value={time} onValueChange={(v) => { setTime(v); if (timeEnd && TIME_SLOTS.indexOf(v as any) > TIME_SLOTS.indexOf(timeEnd as any)) setTimeEnd(""); }}>
                      <SelectTrigger><SelectValue placeholder="De..." /></SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground font-medium">até</span>
                    <Select value={timeEnd} onValueChange={setTimeEnd}>
                      <SelectTrigger><SelectValue placeholder="Até..." /></SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.filter((t) => !time || TIME_SLOTS.indexOf(t) >= TIME_SLOTS.indexOf(time as any)).map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {time && timeEnd && (
                      <span className="text-xs text-primary font-semibold whitespace-nowrap">
                        ({TIME_SLOTS.slice(TIME_SLOTS.indexOf(time as any), TIME_SLOTS.indexOf(timeEnd as any) + 1).length} horários)
                      </span>
                    )}
                  </div>
                ) : (
                  <Select value={time} onValueChange={setTime}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Contrato *</Label>
                <Select value={obraId} onValueChange={(v) => { setObraId(v); setRotaId(""); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Rota *</Label>
                <Select value={rotaId} onValueChange={setRotaId} disabled={!obraId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder={!obraId ? "Selecione o contrato primeiro" : rotas.length === 0 ? "Nenhuma rota para este contrato" : "Selecione..."} /></SelectTrigger>
                  <SelectContent>
                    {rotas.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {obraId && rotas.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Nenhuma rota cadastrada para este contrato</p>
                )}
              </div>
            </div>
          </div>

          {/* Observation Details */}
          <div className="stat-card animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Observação</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAISuggest}
                disabled={isSuggesting}
                className="gap-1.5 text-xs"
              >
                {isSuggesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Sugerir com IA
              </Button>
            </div>
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
                  {isDynamicObservation ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Input id="qty" type="number" value="1" disabled className="mt-0 bg-muted cursor-not-allowed" />
                      <span className="text-xs text-warning font-medium whitespace-nowrap flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Observação Dinâmica
                      </span>
                    </div>
                  ) : (
                    <Input id="qty" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1" />
                  )}
                  {isDynamicObservation && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Quantidade calculada automaticamente pela média da especialidade no dia.
                    </p>
                  )}
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
              {isRangeMode && time && timeEnd
                ? `Salvar ${TIME_SLOTS.slice(TIME_SLOTS.indexOf(time as any), TIME_SLOTS.indexOf(timeEnd as any) + 1).length} Observações`
                : "Salvar Observação"}
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
