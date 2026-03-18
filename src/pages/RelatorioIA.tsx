import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2, FileText, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function RelatorioIA() {
  const { toast } = useToast();
  const [obraFilter, setObraFilter] = useState("all");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: obras = [] } = useQuery({
    queryKey: ["obras", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id, nome").eq("status", "Ativo").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: allRecords = [] } = useQuery({
    queryKey: ["observacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("observacoes")
        .select("*, especialidades(nome), categorias_observacao(nome, categoria_pai_id), obras(nome)")
        .is("deleted_at", null);
      if (error) throw error;
      return data;
    },
  });

  const { data: parentCats = [] } = useQuery({
    queryKey: ["categorias_observacao", "parents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_observacao").select("id, nome").is("categoria_pai_id", null);
      if (error) throw error;
      return data;
    },
  });

  const parentCatMap = useMemo(() => {
    const map: Record<string, string> = {};
    parentCats.forEach((c) => { map[c.id] = c.nome; });
    return map;
  }, [parentCats]);

  const filteredRecords = useMemo(() => {
    let r = allRecords.filter((rec: any) => rec.data >= startDate && rec.data <= endDate);
    if (obraFilter !== "all") r = r.filter((rec: any) => rec.obra_id === obraFilter);
    return r;
  }, [allRecords, startDate, endDate, obraFilter]);

  const stats = useMemo(() => {
    const total = filteredRecords.reduce((s: number, r: any) => s + (r.quantidade || 0), 0);

    const getParentCat = (r: any) => {
      const catData = r.categorias_observacao as any;
      if (!catData) return "Sem categoria";
      if (catData.categoria_pai_id) return parentCatMap[catData.categoria_pai_id] || catData.nome;
      return catData.nome;
    };

    let prod = 0, supl = 0, naoProd = 0, npe = 0;
    const byEsp: Record<string, { prod: number; total: number }> = {};
    const byCat: Record<string, number> = {};

    const NPE_CATS = ["Não Produtivo Externo"];
    const isNpe = (cat: string) => NPE_CATS.includes(cat);

    filteredRecords.forEach((r: any) => {
      const qty = r.quantidade || 0;
      const cat = getParentCat(r);
      if (cat === "Produtivo") prod += qty;
      else if (cat === "Suplementar") supl += qty;
      else if (isNpe(cat)) npe += qty;
      else naoProd += qty;

      const espName = (r.especialidades as any)?.nome || "Sem especialidade";
      if (!byEsp[espName]) byEsp[espName] = { prod: 0, total: 0 };
      byEsp[espName].total += qty;
      if (cat === "Produtivo") byEsp[espName].prod += qty;

      byCat[r.descricao || "Sem descrição"] = (byCat[r.descricao || "Sem descrição"] || 0) + qty;
    });

    const porEspecialidade = Object.entries(byEsp)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 8)
      .map(([nome, v]) => `${nome}: ${v.total} amostras (${v.total > 0 ? Math.round((v.prod / v.total) * 100) : 0}% produtivo)`)
      .join("\n");

    const topCategorias = Object.entries(byCat)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([nome, qty]) => `${nome}: ${qty} amostras`)
      .join("\n");

    const obraName = obraFilter === "all" ? "Todos os contratos" : obras.find(o => o.id === obraFilter)?.nome || "";

    return {
      totalAmostras: total,
      produtivo: prod,
      suplementar: supl,
      naoProdutivo: naoProd,
      npe: npe,
      produtivoPct: total > 0 ? Math.round((prod / total) * 100) : 0,
      suplementarPct: total > 0 ? Math.round((supl / total) * 100) : 0,
      naoProdutivoPct: total > 0 ? Math.round((naoProd / total) * 100) : 0,
      npePct: total > 0 ? Math.round((npe / total) * 100) : 0,
      periodo: `${startDate} a ${endDate}`,
      obra: obraName,
      porEspecialidade,
      topCategorias,
    };
  }, [filteredRecords, parentCatMap, obraFilter, obras]);

  const handleGenerate = async () => {
    if (filteredRecords.length === 0) {
      toast({ title: "Sem dados", description: "Nenhuma observação encontrada para o período selecionado.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setReport("");

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-observations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ type: "report", context: stats }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        if (resp.status === 429) {
          toast({ title: "Limite atingido", description: err.error, variant: "destructive" });
        } else if (resp.status === 402) {
          toast({ title: "Créditos insuficientes", description: err.error, variant: "destructive" });
        } else {
          throw new Error(err.error || "Erro ao gerar relatório");
        }
        return;
      }

      if (!resp.body) throw new Error("Sem resposta da IA");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) setReport((prev) => prev + content);
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const formatReport = (text: string) => {
    return text
      .split("\n")
      .map((line, i) => {
        if (line.startsWith("## ") || line.startsWith("# ")) {
          return <h2 key={i} className="text-lg font-bold text-foreground mt-6 mb-2">{line.replace(/^#+\s*/, "").replace(/\*\*/g, "")}</h2>;
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return <h3 key={i} className="font-semibold text-foreground mt-4 mb-1">{line.replace(/\*\*/g, "")}</h3>;
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return <li key={i} className="ml-4 text-sm text-foreground/80 list-disc">{line.replace(/^[-•]\s*/, "").replace(/\*\*/g, (_, ofs, str) => "")}</li>;
        }
        if (line.trim() === "") return <br key={i} />;
        // Bold inline
        const parts = line.split(/\*\*([^*]+)\*\*/g);
        return (
          <p key={i} className="text-sm text-foreground/80 leading-relaxed">
            {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
          </p>
        );
      });
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Sparkles className="w-6 h-6 text-primary" />
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Relatório Inteligente</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            A IA analisa as observações do período e gera insights acionáveis sobre produtividade
          </p>
        </div>

        {/* Filters */}
        <div className="stat-card animate-fade-in mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Parâmetros do Relatório</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Data Início</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Data Fim</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Contrato</Label>
              <Select value={obraFilter} onValueChange={setObraFilter}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os contratos</SelectItem>
                  {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stats preview */}
          {filteredRecords.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold text-foreground">{stats.totalAmostras}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Produtivo</p>
                <p className="text-xl font-bold text-chart-2">{stats.produtivoPct}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Suplementar</p>
                <p className="text-xl font-bold text-chart-3">{stats.suplementarPct}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Não Produtivo</p>
                <p className="text-xl font-bold text-destructive">{stats.naoProdutivoPct}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">NPE (Externo)</p>
                <p className="text-xl font-bold text-orange-500">{stats.npePct}%</p>
              </div>
            </div>
          )}

          {filteredRecords.length === 0 && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4" />
              Nenhuma observação encontrada para o período selecionado.
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || filteredRecords.length === 0}
            className="mt-4 gap-2"
          >
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Gerando relatório...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Gerar Relatório com IA</>
            )}
          </Button>
        </div>

        {/* Report output */}
        {(report || isGenerating) && (
          <div className="stat-card animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Análise Gerada pela IA</h3>
              {isGenerating && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-auto" />}
            </div>
            <div className="prose prose-sm max-w-none">
              {formatReport(report)}
              {isGenerating && !report && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Analisando dados...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
