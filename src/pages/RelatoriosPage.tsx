import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2 } from "lucide-react";
import { normalizeDescriptionName } from "@/lib/categoryNormalization";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";

const CATEGORY_COLORS: Record<string, string> = {
  Produtivo: "#2563EB",
  Suplementar: "#16A34A",
  "Não Produtivo": "#DC2626",
  "Não Produtivo Externo": "#F97316",
};

const CATEGORY_ORDER = ["Produtivo", "Suplementar", "Não Produtivo", "Não Produtivo Externo"];

export default function RelatoriosPage() {
  const { toast } = useToast();
  const [date, setDate] = useState("");
  const [obraId, setObraId] = useState("");
  const [especialidadeId, setEspecialidadeId] = useState("");
  const [generated, setGenerated] = useState(false);

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

  const { data: parentCats = [] } = useQuery({
    queryKey: ["categorias_observacao", "parents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_observacao").select("id, nome, impacta_produtividade").is("categoria_pai_id", null);
      if (error) throw error;
      return data;
    },
  });

  const { data: allCats = [] } = useQuery({
    queryKey: ["categorias_observacao", "all_with_impact"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_observacao").select("id, nome, categoria_pai_id, impacta_produtividade");
      if (error) throw error;
      return data;
    },
  });

  const { data: allRecords = [] } = useQuery({
    queryKey: ["observacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("observacoes")
        .select("*, especialidades(nome), categorias_observacao(nome, categoria_pai_id, impacta_produtividade), obras(nome)")
        .is("deleted_at", null)
        .order("data", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Build parent category name map
  const parentCatMap = useMemo(() => {
    const map: Record<string, string> = {};
    parentCats.forEach((c: any) => { map[c.id] = c.nome; });
    return map;
  }, [parentCats]);

  // Map subcategory to parent name
  const getCategoryName = (record: any): string => {
    const catInfo = record.categorias_observacao;
    if (!catInfo) return "Sem categoria";
    if (!catInfo.categoria_pai_id) return catInfo.nome;
    return parentCatMap[catInfo.categoria_pai_id] || catInfo.nome;
  };

  // Filtered records
  const records = useMemo(() => {
    if (!generated || !date || !obraId) return [];
    return allRecords.filter((r: any) => {
      if (r.data !== date) return false;
      if (r.obra_id !== obraId) return false;
      if (especialidadeId && r.especialidade_id !== especialidadeId) return false;
      return true;
    });
  }, [generated, date, obraId, especialidadeId, allRecords]);

  // 1. Resumo do dia — unique measured times
  const measuredTimes = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r: any) => set.add(r.horario));
    return Array.from(set).sort((a, b) => {
      const [ah, am] = a.split(":").map(Number);
      const [bh, bm] = b.split(":").map(Number);
      return ah * 60 + am - (bh * 60 + bm);
    });
  }, [records]);

  // 2. Distribuição por categoria (%)
  const categoryDist = useMemo(() => {
    const totals: Record<string, number> = {};
    let total = 0;
    records.forEach((r: any) => {
      const cat = getCategoryName(r);
      totals[cat] = (totals[cat] || 0) + (r.quantidade || 0);
      total += r.quantidade || 0;
    });
    if (total === 0) return [];
    return CATEGORY_ORDER
      .filter((c) => totals[c])
      .map((c) => ({ name: c, percent: parseFloat(((totals[c] / total) * 100).toFixed(1)) }));
  }, [records, parentCatMap]);

  // 3. Distribuição por descrição por especialidade
  const specialtyBreakdown = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    const specTotals: Record<string, number> = {};
    records.forEach((r: any) => {
      const spec = (r.especialidades as any)?.nome || "Sem especialidade";
      const desc = normalizeDescriptionName(r.descricao || "");
      if (!map[spec]) map[spec] = {};
      map[spec][desc] = (map[spec][desc] || 0) + (r.quantidade || 0);
      specTotals[spec] = (specTotals[spec] || 0) + (r.quantidade || 0);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([spec, descs]) => ({
        specialty: spec,
        total: specTotals[spec],
        descriptions: Object.entries(descs)
          .map(([name, qty]) => ({ name, percent: parseFloat(((qty / specTotals[spec]) * 100).toFixed(1)) }))
          .sort((a, b) => b.percent - a.percent),
      }));
  }, [records]);

  // 4. Timeline — category distribution per time slot
  const timeline = useMemo(() => {
    const slotData: Record<string, Record<string, number>> = {};
    const slotTotals: Record<string, number> = {};
    records.forEach((r: any) => {
      const slot = r.horario;
      if (!slotData[slot]) slotData[slot] = {};
      const cat = getCategoryName(r);
      slotData[slot][cat] = (slotData[slot][cat] || 0) + (r.quantidade || 0);
      slotTotals[slot] = (slotTotals[slot] || 0) + (r.quantidade || 0);
    });
    return measuredTimes.map((t) => {
      const total = slotTotals[t] || 0;
      const entry: any = { time: t };
      CATEGORY_ORDER.forEach((cat) => {
        entry[cat] = total > 0 ? parseFloat((((slotData[t]?.[cat] || 0) / total) * 100).toFixed(1)) : 0;
      });
      return entry;
    });
  }, [records, measuredTimes, parentCatMap]);

  const handleGenerate = () => {
    if (!date || !obraId) {
      toast({ title: "Campos obrigatórios", description: "Selecione data e contrato.", variant: "destructive" });
      return;
    }
    setGenerated(true);
  };

  const obraName = obras.find((o) => o.id === obraId)?.nome || "";
  const specName = especialidades.find((e) => e.id === especialidadeId)?.nome || "";

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">Gere relatórios detalhados de produtividade por dia</p>
        </div>

        {/* Filters */}
        <div className="stat-card mb-6 animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground mb-4">Filtros</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div>
              <Label className="text-xs text-muted-foreground">Data *</Label>
              <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setGenerated(false); }} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Contrato *</Label>
              <Select value={obraId} onValueChange={(v) => { setObraId(v); setGenerated(false); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Especialidade</Label>
              <Select value={especialidadeId || "all"} onValueChange={(v) => { setEspecialidadeId(v === "all" ? "" : v); setGenerated(false); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {especialidades.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Button onClick={handleGenerate} className="w-full gap-2">
                <FileText className="w-4 h-4" />
                Gerar Relatório
              </Button>
            </div>
          </div>
        </div>

        {/* Report */}
        {generated && records.length === 0 && (
          <div className="stat-card text-center py-12 animate-fade-in">
            <p className="text-muted-foreground">Nenhum registro encontrado para o filtro selecionado.</p>
          </div>
        )}

        {generated && records.length > 0 && (
          <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="stat-card">
              <h2 className="text-lg font-bold text-foreground">
                Relatório — {date} — {obraName}
                {specName && <span className="text-muted-foreground font-normal text-sm ml-2">({specName})</span>}
              </h2>
            </div>

            {/* 1. Resumo do Dia */}
            <div className="stat-card">
              <h3 className="text-sm font-semibold text-foreground mb-3">Resumo do Dia</h3>
              <p className="text-sm text-muted-foreground mb-2">Horários medidos:</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {measuredTimes.map((t) => (
                  <span key={t} className="px-2.5 py-1 rounded-md bg-muted text-xs font-mono font-medium text-foreground">{t}</span>
                ))}
              </div>
              <p className="text-sm font-medium text-foreground">Total: {measuredTimes.length} medições</p>
            </div>

            {/* 2. Distribuição por Categoria */}
            <div className="stat-card">
              <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição por Categoria</h3>
              <div className="space-y-3">
                {categoryDist.map((c) => (
                  <div key={c.name} className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: CATEGORY_COLORS[c.name] || "#6B7280" }} />
                    <span className="text-sm text-foreground flex-1">{c.name}</span>
                    <div className="flex-1 max-w-[200px]">
                      <div className="h-5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${c.percent}%`, backgroundColor: CATEGORY_COLORS[c.name] || "#6B7280" }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-foreground w-14 text-right">{c.percent}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Detalhamento por Especialidade */}
            <div className="stat-card">
              <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição por Descrição (por Especialidade)</h3>
              <div className="space-y-5">
                {specialtyBreakdown.map((spec) => (
                  <div key={spec.specialty}>
                    <h4 className="text-sm font-semibold text-primary mb-2">{spec.specialty}</h4>
                    <div className="space-y-1.5 pl-3">
                      {spec.descriptions.map((d) => (
                        <div key={d.name} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground flex-1">{d.name}</span>
                          <div className="flex-1 max-w-[150px]">
                            <div className="h-3 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${d.percent}%` }} />
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-foreground w-12 text-right">{d.percent}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Linha do Tempo */}
            <div className="stat-card">
              <h3 className="text-sm font-semibold text-foreground mb-4">Linha do Tempo</h3>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeline} margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        color: "hsl(var(--popover-foreground))",
                        fontSize: "12px",
                      }}
                      formatter={(value: any, name: string) => [`${value}%`, name]}
                    />
                    {CATEGORY_ORDER.map((cat) => (
                      <Bar key={cat} dataKey={cat} stackId="a" fill={CATEGORY_COLORS[cat]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-3 justify-center">
                {CATEGORY_ORDER.map((cat) => (
                  <div key={cat} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                    <span className="text-xs text-muted-foreground">{cat}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
