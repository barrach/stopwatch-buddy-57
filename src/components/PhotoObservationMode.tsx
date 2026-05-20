import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Upload, Save, Trash2, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import { reprocessarObservacoesDoDia } from "@/lib/dynamicObservationSync";

const PHOTO_TIME_SLOTS = [
  "08:00", "09:00", "10:00", "11:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
] as const;

type CategoriaKey = "Produtivo" | "Suplementar" | "Não Produtivo" | "Não Produtivo Externo";

interface ExtractedObs {
  id: string;
  especialidade: string;
  categoria: CategoriaKey | string;
  descricao: string;
  quantidade: number;
}

const CATEGORIA_BADGE: Record<string, string> = {
  "Produtivo": "bg-green-500/15 text-green-600 border-green-500/40",
  "Suplementar": "bg-blue-500/15 text-blue-600 border-blue-500/40",
  "Não Produtivo": "bg-orange-500/15 text-orange-600 border-orange-500/40",
  "Não Produtivo Externo": "bg-red-500/15 text-red-600 border-red-500/40",
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
  const n = name.trim().toLowerCase();
  if (n.includes("não produtivo externo") || n === "npe" || n.includes("externo")) return "Não Produtivo Externo";
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
  const [isDragging, setIsDragging] = useState(false);

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

  const canAnalyze = !!obraId && !!rotaId && !!time && !!file && !isAnalyzing;

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
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelected(f);
  };

  const handleAnalyze = async () => {
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

      const items: ExtractedObs[] = (data.observacoes ?? []).map((o: any, i: number) => ({
        id: `${Date.now()}-${i}`,
        especialidade: String(o.especialidade ?? "").trim(),
        categoria: normalizeCategoria(String(o.categoria ?? "")),
        descricao: String(o.descricao ?? "").trim(),
        quantidade: Math.max(0, Math.round(Number(o.quantidade) || 0)),
      })).filter((o: ExtractedObs) => o.quantidade > 0);

      setExtracted(items);
      toast({ title: "Análise concluída", description: `${items.length} observações encontradas.` });
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

  const handleSaveAll = async () => {
    if (extracted.length === 0) return;
    setIsSaving(true);
    try {
      const payloads: any[] = [];
      const unmapped: string[] = [];

      for (const o of extracted) {
        if (o.quantidade <= 0) continue;
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
          notas: "Lançamento por foto (IA)",
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
        title: "Observações salvas!",
        description: `${payloads.length} registros salvos com sucesso.${unmapped.length ? ` Ignorados: ${unmapped.length}.` : ""}`,
      });

      // Reset form for new entry
      setExtracted([]);
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setTime("");
      if (fileInputRef.current) fileInputRef.current.value = "";
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

      {/* Step 2: Upload */}
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

        <Button
          type="button"
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          className="mt-4 w-full gap-2"
        >
          {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {isAnalyzing ? "Analisando imagem..." : "Analisar com IA"}
        </Button>
      </div>

      {/* Step 4: Results */}
      {extracted.length > 0 && (
        <div className="stat-card animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">3. Observações Extraídas</h3>
            <span className="text-xs text-muted-foreground">{extracted.length} observações encontradas</span>
          </div>
          <div className="space-y-3">
            {extracted.map((o) => (
              <div key={o.id} className="rounded-lg border border-border p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground truncate">{o.especialidade}</span>
                    <Badge variant="outline" className={CATEGORIA_BADGE[normalizeCategoria(o.categoria)] ?? ""}>
                      {o.categoria}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{o.descricao}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Qtd</Label>
                  <Input
                    type="number"
                    min="0"
                    value={o.quantidade}
                    onChange={(e) => updateQty(o.id, parseInt(e.target.value) || 0)}
                    className="w-20 h-8"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(o.id)} className="h-8 w-8 text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving || extracted.length === 0}
            className="mt-4 w-full gap-2"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar todas as observações
          </Button>
        </div>
      )}
    </div>
  );
}