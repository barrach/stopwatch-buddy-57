import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Sparkles, Upload, Save, Trash2, Image as ImageIcon,
  AlertTriangle, Plus, RotateCcw, X, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import { reprocessarObservacoesDoDia } from "@/lib/dynamicObservationSync";

const PHOTO_TIME_SLOTS = [
  "08:00", "09:00", "10:00", "11:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
] as const;

const CATEGORIA_OPTIONS = ["Produtivo", "Suplementar", "Não Produtivo", "Não Produtivo Externo"] as const;

interface ExtractedObs {
  id: string;
  especialidade: string;
  categoria: string;
  descricao: string;
  quantidade: number;
  originalQty: number | null; // null = manual entry
}

const CATEGORIA_BADGE: Record<string, string> = {
  "Produtivo": "bg-green-500/15 text-green-700 border-green-500/40",
  "Suplementar": "bg-blue-500/15 text-blue-700 border-blue-500/40",
  "Não Produtivo": "bg-orange-500/15 text-orange-700 border-orange-500/40",
  "Não Produtivo Externo": "bg-red-500/15 text-red-700 border-red-500/40",
};

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [meta, b64] = result.split(",");
      const mimeMatch = meta.match(/data:([^;]+);base64/);
      resolve({ base64: b64, mimeType: mimeMatch?.[1] ?? file.type ?? "image/jpeg" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function normalizeCategoria(name: string): string {
  const n = (name || "").trim().toLowerCase();
  if (n.includes("não produtivo externo") || n === "npe" || (n.includes("externo") && n.includes("produtivo"))) return "Não Produtivo Externo";
  if (n.includes("não produtivo") || n.includes("nao produtivo")) return "Não Produtivo";
  if (n.includes("suplementar")) return "Suplementar";
  if (n.includes("produtivo")) return "Produtivo";
  return name;
}

export default function PhotoObservationMode() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [date] = useState(new Date().toISOString().slice(0, 10));
  const [obraId, setObraId] = useState("");
  const [rotaId, setRotaId] = useState("");
  const [time, setTime] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedObs[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showReanalyzeDialog, setShowReanalyzeDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Manual add form state
  const [showAddManual, setShowAddManual] = useState(false);
  const [mEsp, setMEsp] = useState("");
  const [mCat, setMCat] = useState("");
  const [mDesc, setMDesc] = useState("");
  const [mQty, setMQty] = useState("1");

  const { data: obras = [] } = useOfflineQuery<{ id: string; nome: string }>(
    ["obras", "ativas"], "obras", "id, nome",
    [{ column: "status", value: "Ativo" }], "nome"
  );
  const { data: allRotas = [] } = useOfflineQuery<{ id: string; nome: string; obra_id: string }>(
    ["rotas", "ativas"], "rotas", "id, nome, obra_id",
    [{ column: "status", value: "Ativo" }], "nome"
  );
  const { data: especialidades = [] } = useOfflineQuery<{ id: string; nome: string }>(
    ["especialidades", "ativas"], "especialidades", "id, nome",
    [{ column: "status", value: "Ativo" }], "nome"
  );
  const { data: categorias = [] } = useOfflineQuery<{ id: string; nome: string; categoria_pai_id: string | null; status: string }>(
    ["categorias_observacao", "all"], "categorias_observacao", "id, nome, categoria_pai_id, status"
  );

  const rotas = useMemo(
    () => obraId ? allRotas.filter((r) => r.obra_id === obraId) : [],
    [allRotas, obraId]
  );

  const parentCategorias = useMemo(
    () => categorias.filter((c) => !c.categoria_pai_id && c.status === "Ativo"),
    [categorias]
  );

  const subcategoriasByParent = useMemo(() => {
    const map: Record<string, { id: string; nome: string }[]> = {};
    for (const p of parentCategorias) {
      map[p.nome] = categorias
        .filter((c) => c.categoria_pai_id === p.id && c.status === "Ativo")
        .map((c) => ({ id: c.id, nome: c.nome }));
    }
    return map;
  }, [categorias, parentCategorias]);

  const subcategoriasManual = useMemo(() => {
    if (!mCat) return [];
    // mCat is a normalized name — find the actual parent by normalized match
    const parent = parentCategorias.find((p) => normalizeCategoria(p.nome) === mCat);
    if (!parent) return [];
    return subcategoriasByParent[parent.nome] ?? [];
  }, [mCat, parentCategorias, subcategoriasByParent]);

  const canAnalyze = !!obraId && !!rotaId && !!time && !!file && !isAnalyzing;
  const validCardsCount = extracted.filter((o) => o.quantidade > 0).length;

  const resetAll = () => {
    setExtracted([]);
    setHasAnalyzed(false);
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setShowAddManual(false);
    setMEsp(""); setMCat(""); setMDesc(""); setMQty("1");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelected = (f: File | null) => {
    if (!f) return;
    const okTypes = ["image/jpeg", "image/jpg", "image/png", "image/heic", "image/heif"];
    const isOk = okTypes.includes(f.type) || /\.(jpg|jpeg|png|heic|heif)$/i.test(f.name);
    if (!isOk) {
      toast({ title: "Formato inválido", description: "Use JPG, PNG ou HEIC.", variant: "destructive" });
      return;
    }
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setExtracted([]);
    setHasAnalyzed(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelected(f);
  };

  const runAnalysis = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/analyze-observation-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: "Erro na análise", description: data.error ?? "Falha ao analisar imagem.", variant: "destructive" });
        return;
      }

      const items: ExtractedObs[] = (data.observacoes ?? []).map((o: any, i: number) => {
        const qty = Math.max(0, Math.round(Number(o.quantidade) || 0));
        return {
          id: `${Date.now()}-${i}`,
          especialidade: String(o.especialidade ?? "").trim(),
          categoria: normalizeCategoria(String(o.categoria ?? "")),
          descricao: String(o.descricao ?? "").trim(),
          quantidade: qty,
          originalQty: qty,
        };
      }).filter((o: ExtractedObs) => o.quantidade > 0);

      setExtracted(items);
      setHasAnalyzed(true);
      toast({ title: "Análise concluída", description: `${items.length} observações identificadas.` });
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message ?? "Falha ao processar imagem", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateQty = (id: string, qty: number) => {
    setExtracted((prev) => prev.map((o) => o.id === id ? { ...o, quantidade: Math.max(0, qty) } : o));
  };
  const removeItem = (id: string) => {
    setExtracted((prev) => prev.filter((o) => o.id !== id));
  };

  const addManual = () => {
    if (!mEsp || !mCat || !mDesc || !mQty || parseInt(mQty) <= 0) {
      toast({ title: "Campos obrigatórios", description: "Preencha especialidade, categoria, descrição e quantidade.", variant: "destructive" });
      return;
    }
    setExtracted((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        especialidade: mEsp,
        categoria: normalizeCategoria(mCat),
        descricao: mDesc,
        quantidade: parseInt(mQty),
        originalQty: null,
      },
    ]);
    setMEsp(""); setMCat(""); setMDesc(""); setMQty("1");
    setShowAddManual(false);
  };

  const handleSaveAll = async () => {
    const valid = extracted.filter((o) => o.quantidade > 0);
    if (valid.length === 0) return;
    setIsSaving(true);
    try {
      const payloads: any[] = [];
      const unmapped: string[] = [];

      for (const o of valid) {
        const esp = especialidades.find((e) => e.nome.toLowerCase() === o.especialidade.toLowerCase());
        const cat = parentCategorias.find((c) => normalizeCategoria(c.nome).toLowerCase() === normalizeCategoria(o.categoria).toLowerCase());
        if (!esp || !cat) {
          unmapped.push(`${o.especialidade} / ${o.categoria}`);
          continue;
        }
        payloads.push({
          data: date,
          horario: time,
          rota_id: rotaId,
          obra_id: obraId,
          contrato_id: null,
          especialidade_id: esp.id,
          funcao_id: null,
          categoria_id: cat.id,
          descricao: o.descricao,
          empresa: "MEGASTEAM",
          quantidade: o.quantidade,
          notas: o.originalQty === null ? "Lançamento por foto (manual)" : "Lançamento por foto (IA)",
          is_dinamico: false,
        });
      }

      if (payloads.length === 0) {
        toast({
          title: "Nada para salvar",
          description: unmapped.length > 0 ? `Não foi possível mapear: ${unmapped.join(", ")}` : "Sem observações válidas.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("observacoes").insert(payloads);
      if (error) throw error;

      await reprocessarObservacoesDoDia(date, obraId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["observacoes"] }),
        queryClient.refetchQueries({ queryKey: ["observacoes"] }),
      ]);

      toast({
        title: `${payloads.length} observações salvas com sucesso`,
        description: unmapped.length ? `Ignoradas: ${unmapped.length} (especialidade/categoria não encontrada).` : undefined,
      });

      resetAll();
      setTime("");
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message ?? "Falha desconhecida", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Step 1: Required metadata */}
      <div className="stat-card animate-fade-in">
        <h3 className="text-sm font-semibold text-foreground mb-4">1. Identificação</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Data</Label>
            <Input value={date} readOnly disabled className="mt-1 bg-muted" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Horário *</Label>
            <Select value={time} onValueChange={setTime}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {PHOTO_TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
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
              <SelectTrigger className="mt-1"><SelectValue placeholder={!obraId ? "Selecione o contrato primeiro" : rotas.length === 0 ? "Nenhuma rota" : "Selecione..."} /></SelectTrigger>
              <SelectContent>
                {rotas.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Step 2: Upload (hidden after analysis is done) */}
      {!hasAnalyzed && (
        <div className="stat-card animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground mb-4">2. Foto do Formulário</h3>
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`w-full min-h-[180px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors p-4 ${
              isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
            }`}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="Pré-visualização" className="max-h-64 rounded-md object-contain" />
            ) : (
              <>
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Arraste a imagem aqui ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground">JPG, PNG ou HEIC</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
              className="hidden"
              onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
            />
          </div>
          {file && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <ImageIcon className="w-3 h-3" /> {file.name}
            </p>
          )}

          <Button type="button" onClick={runAnalysis} disabled={!canAnalyze} className="mt-4 w-full gap-2">
            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isAnalyzing ? "Analisando imagem..." : "Analisar com IA"}
          </Button>
        </div>
      )}

      {/* Step 4: Validation screen */}
      {hasAnalyzed && (
        <div className="stat-card animate-fade-in">
          {/* Warning banner */}
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <strong>Revise os dados abaixo antes de confirmar.</strong> A IA pode cometer erros de leitura.
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">3. Validação</h3>
            <span className="text-xs text-muted-foreground">{extracted.length} observações identificadas</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Original image */}
            <div className="lg:sticky lg:top-4 self-start">
              <Label className="text-xs text-muted-foreground mb-2 block">Formulário original</Label>
              {previewUrl && (
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  <img
                    src={previewUrl}
                    alt="Formulário"
                    className="w-full rounded-md border border-border object-contain max-h-[500px] bg-muted"
                  />
                </a>
              )}
              <p className="text-xs text-muted-foreground mt-1">Clique para ampliar</p>
            </div>

            {/* Cards */}
            <div className="space-y-3">
              {extracted.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
                  Nenhuma observação. Adicione manualmente ou reanalise.
                </div>
              )}
              {extracted.map((o) => {
                const isEdited = o.originalQty !== null && o.quantidade !== o.originalQty;
                const isManual = o.originalQty === null;
                const isInvalid = o.quantidade <= 0;
                const borderCls = isInvalid
                  ? "border-destructive bg-destructive/5"
                  : isManual
                    ? "border-primary/60 bg-primary/5"
                    : isEdited
                      ? "border-amber-500/60 bg-amber-500/5"
                      : "border-border";
                return (
                  <div key={o.id} className={`rounded-lg border p-3 ${borderCls}`}>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant="outline" className={CATEGORIA_BADGE[normalizeCategoria(o.categoria)] ?? ""}>
                        {o.categoria}
                      </Badge>
                      {isManual && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/40">Manual</Badge>}
                      {isEdited && <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/40">Editado</Badge>}
                      {isInvalid && <Badge variant="destructive">Quantidade inválida</Badge>}
                    </div>
                    <div className="text-sm font-medium text-foreground">{o.especialidade}</div>
                    <div className="text-xs text-muted-foreground mb-2">{o.descricao}</div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Quantidade</Label>
                      <Input
                        type="number"
                        min="0"
                        value={o.quantidade}
                        onChange={(e) => updateQty(o.id, parseInt(e.target.value) || 0)}
                        className="w-24 h-8"
                      />
                      {o.originalQty !== null && (
                        <span className="text-xs text-muted-foreground">IA leu: {o.originalQty}</span>
                      )}
                      <div className="flex-1" />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(o.id)} className="h-8 w-8 text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Manual add inline form */}
              {showAddManual ? (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
                  <div className="text-sm font-semibold">Nova observação manual</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Especialidade *</Label>
                      <Select value={mEsp} onValueChange={setMEsp}>
                        <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {especialidades.map((e) => <SelectItem key={e.id} value={e.nome}>{e.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Categoria *</Label>
                      <Select value={mCat} onValueChange={(v) => { setMCat(v); setMDesc(""); }}>
                        <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIA_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">Descrição *</Label>
                      {subcategoriasManual.length > 0 ? (
                        <Select value={mDesc} onValueChange={setMDesc}>
                          <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {subcategoriasManual.map((s) => <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={mDesc} onChange={(e) => setMDesc(e.target.value)} placeholder="Descrição da causa" className="mt-1 h-9" />
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Quantidade *</Label>
                      <Input type="number" min="1" value={mQty} onChange={(e) => setMQty(e.target.value)} className="mt-1 h-9" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="button" size="sm" onClick={addManual} className="gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Adicionar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowAddManual(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="outline" onClick={() => setShowAddManual(true)} className="w-full gap-2">
                  <Plus className="w-4 h-4" /> Adicionar observação manualmente
                </Button>
              )}
            </div>
          </div>

          {/* Action footer */}
          <div className="mt-6 flex flex-col sm:flex-row gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setShowReanalyzeDialog(true)} className="gap-2" disabled={!file || isAnalyzing}>
              <RotateCcw className="w-4 h-4" /> Reanalisar imagem
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowCancelDialog(true)} className="gap-2 text-destructive">
              <X className="w-4 h-4" /> Cancelar
            </Button>
            <div className="flex-1" />
            <Button
              type="button"
              onClick={handleSaveAll}
              disabled={validCardsCount === 0 || isSaving}
              className="gap-2"
              size="lg"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Confirmar e Salvar {validCardsCount} observa{validCardsCount === 1 ? "ção" : "ções"}
            </Button>
          </div>
        </div>
      )}

      {/* Reanalyze confirm */}
      <AlertDialog open={showReanalyzeDialog} onOpenChange={setShowReanalyzeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reanalisar imagem?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá substituir as observações atuais. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowReanalyzeDialog(false); runAnalysis(); }}>
              Sim, reanalisar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirm */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as observações desta análise serão descartadas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowCancelDialog(false); resetAll(); }}>
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}