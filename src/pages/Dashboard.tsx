import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList, Line, ComposedChart,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import StatCard, { Users, Clock, BarChart3, AlertTriangle } from "@/components/StatCard";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, X, Sparkles, Loader2, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const CATEGORY_COLORS: Record<string, string> = {
  Produtivo: "hsl(142, 70%, 45%)",
  Suplementar: "hsl(32, 95%, 50%)",
  "Não Produtivo": "hsl(0, 72%, 51%)",
};

const PIE_COLORS = [
  "hsl(32, 95%, 50%)", "hsl(220, 70%, 55%)", "hsl(142, 70%, 45%)",
  "hsl(0, 72%, 51%)", "hsl(280, 65%, 55%)", "hsl(180, 60%, 45%)",
  "hsl(45, 93%, 47%)", "hsl(340, 70%, 50%)",
];

const SPECIALTY_COLORS: Record<string, string> = {
  "Elétrica": "hsl(230, 80%, 45%)",
  "Instrumentação": "hsl(0, 100%, 45%)",
  "Mecânica": "hsl(140, 70%, 30%)",
  "Caldeiraria": "hsl(0, 0%, 15%)",
  "Caldeiraria/Solda": "hsl(0, 0%, 15%)",
  "Andaime": "hsl(0, 0%, 75%)",
  "Pintura": "hsl(50, 100%, 50%)",
  "Limpeza": "hsl(50, 100%, 50%)",
  "Isolamento": "hsl(50, 100%, 50%)",
  "Civil": "hsl(50, 100%, 50%)",
  "Máquinas": "hsl(50, 100%, 50%)",
};

const getSpecialtyColor = (name: string): string => {
  if (SPECIALTY_COLORS[name]) return SPECIALTY_COLORS[name];
  // Check partial matches for complementar group
  const complementar = ["Pintura", "Limpeza", "Isolamento", "Civil", "Máquinas"];
  if (complementar.some(c => name.toLowerCase().includes(c.toLowerCase()))) return "hsl(50, 100%, 50%)";
  return "hsl(220, 50%, 50%)";
};

const tooltipStyle = {
  background: "hsl(220, 25%, 12%)", border: "1px solid hsl(220, 20%, 20%)",
  borderRadius: "8px", color: "#fff", fontSize: "12px",
};

const renderPieLabel = ({ percent }: { percent: number }) => `${(percent * 100).toFixed(1)}%`;

type ParetoMode = "especialidade" | "categoria" | "funcao";

interface CrossFilters {
  categoria?: string;
  rota?: string;
  especialidade?: string;
  contrato?: string;
  horario?: string;
  descricao?: string;
  pareto?: string;
  funcao?: string;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [obraFilter, setObraFilter] = useState("all");
  const [aiReport, setAiReport] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [aiReportExpanded, setAiReportExpanded] = useState(false);
  const [dateMode, setDateMode] = useState<"all" | "day" | "period">("all");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const applyQuickFilter = (preset: "today" | "week" | "month") => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    if (preset === "today") {
      setDateMode("day");
      setSelectedDate(todayStr);
    } else if (preset === "week") {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      setStartDate(start.toISOString().slice(0, 10));
      setEndDate(todayStr);
      setDateMode("period");
    } else if (preset === "month") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(start.toISOString().slice(0, 10));
      setEndDate(todayStr);
      setDateMode("period");
    }
  };
  const [crossFilters, setCrossFilters] = useState<CrossFilters>({});
  const [paretoMode, setParetoMode] = useState<ParetoMode>(() => {
    try { return (sessionStorage.getItem("paretoMode") as ParetoMode) || "categoria"; } catch { return "categoria"; }
  });

  const handleParetoModeChange = (mode: ParetoMode) => {
    setParetoMode(mode);
    try { sessionStorage.setItem("paretoMode", mode); } catch {}
    // Clear pareto cross-filter when switching mode
    setCrossFilters(prev => ({ ...prev, pareto: undefined }));
  };

  const hasActiveFilters = Object.values(crossFilters).some(Boolean);

  const toggleCrossFilter = (key: keyof CrossFilters, value: string) => {
    setCrossFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? undefined : value,
    }));
  };

  const clearAllFilters = () => setCrossFilters({});

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
        .select("*, rotas(nome), especialidades(nome), categorias_observacao(nome, categoria_pai_id), obras(nome), funcoes(nome)")
        .is("deleted_at", null)
        .order("data", { ascending: false });
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

  const getParentCatName = useCallback((r: any) => {
    const catData = r.categorias_observacao as any;
    if (!catData) return "Sem categoria";
    if (catData.categoria_pai_id) {
      return parentCatMap[catData.categoria_pai_id] || catData.nome;
    }
    return catData.nome;
  }, [parentCatMap]);

  // Base records filtered by top-level filters (date, obra)
  const baseRecords = useMemo(() => {
    let filtered = obraFilter === "all" ? allRecords : allRecords.filter((r: any) => r.obra_id === obraFilter);
    if (dateMode === "day") {
      filtered = filtered.filter((r: any) => r.data === selectedDate);
    } else if (dateMode === "period") {
      filtered = filtered.filter((r: any) => r.data >= startDate && r.data <= endDate);
    }
    return filtered;
  }, [allRecords, obraFilter, dateMode, selectedDate, startDate, endDate]);

  // Cross-filtered records: apply all active cross-filters
  const records = useMemo(() => {
    return baseRecords.filter((r: any) => {
      if (crossFilters.categoria && getParentCatName(r) !== crossFilters.categoria) return false;
      if (crossFilters.rota && ((r.rotas as any)?.nome || "Sem rota") !== crossFilters.rota) return false;
      if (crossFilters.especialidade && ((r.especialidades as any)?.nome || "Sem especialidade") !== crossFilters.especialidade) return false;
      if (crossFilters.contrato && ((r.obras as any)?.nome || "Sem contrato") !== crossFilters.contrato) return false;
      if (crossFilters.horario && r.horario !== crossFilters.horario) return false;
      if (crossFilters.funcao && ((r as any).funcoes?.nome || "Sem função") !== crossFilters.funcao) return false;
      if (crossFilters.pareto) {
        if (paretoMode === "especialidade" && ((r.especialidades as any)?.nome || "Sem especialidade") !== crossFilters.pareto) return false;
        if (paretoMode === "categoria" && r.descricao !== crossFilters.pareto) return false;
        if (paretoMode === "funcao" && ((r as any).funcoes?.nome || "Sem função") !== crossFilters.pareto) return false;
      }
      return true;
    });
  }, [baseRecords, crossFilters, getParentCatName, paretoMode]);

  const totalSamples = useMemo(() => records.reduce((s: number, r: any) => s + (r.quantidade || 0), 0), [records]);
  const productiveCount = useMemo(
    () => records.filter((r: any) => getParentCatName(r) === "Produtivo").reduce((s: number, r: any) => s + (r.quantidade || 0), 0),
    [records, getParentCatName]
  );
  const productivePercent = totalSamples > 0 ? Math.round((productiveCount / totalSamples) * 100) : 0;
  const unproductiveCount = useMemo(
    () => records.filter((r: any) => getParentCatName(r) === "Não Produtivo").reduce((s: number, r: any) => s + (r.quantidade || 0), 0),
    [records, getParentCatName]
  );

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = { Produtivo: 0, Suplementar: 0, "Não Produtivo": 0 };
    records.forEach((r: any) => {
      const cat = getParentCatName(r);
      if (totals[cat] !== undefined) totals[cat] += r.quantidade || 0;
    });
    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [records, getParentCatName]);

  // Pareto data: dynamic by mode (especialidade or categoria/description)
  const paretoData = useMemo(() => {
    const totals: Record<string, number> = {};
    records.forEach((r: any) => {
      let key: string;
      if (paretoMode === "especialidade") {
        key = (r.especialidades as any)?.nome || "Sem especialidade";
      } else if (paretoMode === "funcao") {
        key = (r as any).funcoes?.nome || "Sem função";
      } else {
        key = r.descricao || "Sem descrição";
      }
      totals[key] = (totals[key] || 0) + (r.quantidade || 0);
    });

    // Sort descending, tie-break alphabetically
    const sorted = Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

    const total = sorted.reduce((s, c) => s + c.value, 0);
    let cumulative = 0;
    return sorted.slice(0, 10).map((item) => {
      cumulative += item.value;
      const percent = total > 0 ? Math.round((item.value / total) * 100) : 0;
      const cumPercent = total > 0 ? parseFloat(((cumulative / total) * 100).toFixed(1)) : 0;
      return { ...item, percent, cumPercent };
    });
  }, [records, paretoMode]);

  const byRoute = useMemo(() => {
    const result: Record<string, { productive: number; supplementary: number; unproductive: number }> = {};
    records.forEach((r: any) => {
      const rName = (r.rotas as any)?.nome || "Sem rota";
      if (!result[rName]) result[rName] = { productive: 0, supplementary: 0, unproductive: 0 };
      const cat = getParentCatName(r);
      if (cat === "Produtivo") result[rName].productive += r.quantidade || 0;
      else if (cat === "Suplementar") result[rName].supplementary += r.quantidade || 0;
      else result[rName].unproductive += r.quantidade || 0;
    });
    return Object.entries(result).map(([name, v]) => {
      const total = v.productive + v.supplementary + v.unproductive;
      return {
        name,
        productive: total > 0 ? +((v.productive / total) * 100).toFixed(1) : 0,
        supplementary: total > 0 ? +((v.supplementary / total) * 100).toFixed(1) : 0,
        unproductive: total > 0 ? +((v.unproductive / total) * 100).toFixed(1) : 0,
        total,
      };
    });
  }, [records, getParentCatName]);

  const bySpecialty = useMemo(() => {
    const result: Record<string, { productive: number; supplementary: number; unproductive: number }> = {};
    records.forEach((r: any) => {
      const sName = (r.especialidades as any)?.nome || "Sem especialidade";
      if (!result[sName]) result[sName] = { productive: 0, supplementary: 0, unproductive: 0 };
      const cat = getParentCatName(r);
      if (cat === "Produtivo") result[sName].productive += r.quantidade || 0;
      else if (cat === "Suplementar") result[sName].supplementary += r.quantidade || 0;
      else result[sName].unproductive += r.quantidade || 0;
    });
    return Object.entries(result).filter(([_, v]) => v.productive + v.supplementary + v.unproductive > 0).map(([name, v]) => {
      const total = v.productive + v.supplementary + v.unproductive;
      return {
        name,
        productive: total > 0 ? +((v.productive / total) * 100).toFixed(1) : 0,
        supplementary: total > 0 ? +((v.supplementary / total) * 100).toFixed(1) : 0,
        unproductive: total > 0 ? +((v.unproductive / total) * 100).toFixed(1) : 0,
        total,
      };
    });
  }, [records, getParentCatName]);

  const byTime = useMemo(() => {
    const result: Record<string, number> = {};
    records.forEach((r: any) => {
      const t = r.horario || "";
      result[t] = (result[t] || 0) + (r.quantidade || 0);
    });
    return Object.entries(result).sort(([a], [b]) => a.localeCompare(b)).map(([time, total]) => ({ time, total }));
  }, [records]);

  const byFunction = useMemo(() => {
    const result: Record<string, { productive: number; supplementary: number; unproductive: number }> = {};
    records.forEach((r: any) => {
      const fName = (r as any).funcoes?.nome || "Sem função";
      if (!result[fName]) result[fName] = { productive: 0, supplementary: 0, unproductive: 0 };
      const cat = getParentCatName(r);
      if (cat === "Produtivo") result[fName].productive += r.quantidade || 0;
      else if (cat === "Suplementar") result[fName].supplementary += r.quantidade || 0;
      else result[fName].unproductive += r.quantidade || 0;
    });
    return Object.entries(result).filter(([_, v]) => v.productive + v.supplementary + v.unproductive > 0).map(([name, v]) => {
      const total = v.productive + v.supplementary + v.unproductive;
      return {
        name,
        productive: total > 0 ? +((v.productive / total) * 100).toFixed(1) : 0,
        supplementary: total > 0 ? +((v.supplementary / total) * 100).toFixed(1) : 0,
        unproductive: total > 0 ? +((v.unproductive / total) * 100).toFixed(1) : 0,
        total,
      };
    });
  }, [records, getParentCatName]);

  const byObra = useMemo(() => {
    const result: Record<string, { productive: number; supplementary: number; unproductive: number }> = {};
    records.forEach((r: any) => {
      const oName = (r.obras as any)?.nome || "Sem contrato";
      if (!result[oName]) result[oName] = { productive: 0, supplementary: 0, unproductive: 0 };
      const cat = getParentCatName(r);
      if (cat === "Produtivo") result[oName].productive += r.quantidade || 0;
      else if (cat === "Suplementar") result[oName].supplementary += r.quantidade || 0;
      else result[oName].unproductive += r.quantidade || 0;
    });
    return Object.entries(result).map(([name, v]) => {
      const total = v.productive + v.supplementary + v.unproductive;
      return {
        name,
        productive: total > 0 ? +((v.productive / total) * 100).toFixed(1) : 0,
        supplementary: total > 0 ? +((v.supplementary / total) * 100).toFixed(1) : 0,
        unproductive: total > 0 ? +((v.unproductive / total) * 100).toFixed(1) : 0,
        total,
        prodPercent: total > 0 ? Math.round((v.productive / total) * 100) : 0,
      };
    });
  }, [records, getParentCatName]);

  // Handlers
  const handleContratoClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("contrato", e.activePayload[0].payload.name);
  };
  const handleRouteClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("rota", e.activePayload[0].payload.name);
  };
  const handleSpecialtyClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("especialidade", e.activePayload[0].payload.name);
  };
  const handleTimeClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("horario", e.activePayload[0].payload.time);
  };
  const handleParetoClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("pareto", e.activePayload[0].payload.name);
  };
  const handleFunctionClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("funcao", e.activePayload[0].payload.name);
  };
  const handlePieClick = (_: any, index: number) => {
    const entry = categoryTotals[index];
    if (entry) toggleCrossFilter("categoria", entry.name);
  };

  const exportToExcel = () => {
    import("xlsx").then((XLSX) => {
      const exportData = records.map((r: any) => ({
        Data: r.data,
        Horário: r.horario,
        Contrato: (r.obras as any)?.nome || "",
        Rota: (r.rotas as any)?.nome || "",
        Especialidade: (r.especialidades as any)?.nome || "",
        Categoria: getParentCatName(r),
        Descrição: r.descricao,
        Quantidade: r.quantidade,
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dashboard");
      XLSX.writeFile(wb, `dashboard_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    });
  };

  const exportToPDF = () => window.print();

  // ---- AI Report ----
  const aiStats = useMemo(() => {
    const total = records.reduce((s: number, r: any) => s + (r.quantidade || 0), 0);
    let prod = 0, supl = 0, naoProd = 0;
    const byEsp: Record<string, { prod: number; total: number }> = {};
    const byCat: Record<string, number> = {};

    records.forEach((r: any) => {
      const qty = r.quantidade || 0;
      const cat = getParentCatName(r);
      if (cat === "Produtivo") prod += qty;
      else if (cat === "Suplementar") supl += qty;
      else naoProd += qty;

      const espName = (r.especialidades as any)?.nome || "Sem especialidade";
      if (!byEsp[espName]) byEsp[espName] = { prod: 0, total: 0 };
      byEsp[espName].total += qty;
      if (cat === "Produtivo") byEsp[espName].prod += qty;

      byCat[r.descricao || "Sem descrição"] = (byCat[r.descricao || "Sem descrição"] || 0) + qty;
    });

    const porEspecialidade = Object.entries(byEsp)
      .sort(([, a], [, b]) => b.total - a.total).slice(0, 8)
      .map(([nome, v]) => `${nome}: ${v.total} amostras (${v.total > 0 ? Math.round((v.prod / v.total) * 100) : 0}% produtivo)`)
      .join("\n");

    const topCategorias = Object.entries(byCat)
      .sort(([, a], [, b]) => b - a).slice(0, 8)
      .map(([nome, qty]) => `${nome}: ${qty} amostras`).join("\n");

    const obraName = obraFilter === "all" ? "Todos os contratos" : obras.find(o => o.id === obraFilter)?.nome || "";

    return {
      totalAmostras: total,
      produtivo: prod,
      suplementar: supl,
      naoProdutivo: naoProd,
      produtivoPct: total > 0 ? Math.round((prod / total) * 100) : 0,
      suplementarPct: total > 0 ? Math.round((supl / total) * 100) : 0,
      naoProdutivoPct: total > 0 ? Math.round((naoProd / total) * 100) : 0,
      periodo: dateMode === "day" ? selectedDate : dateMode === "period" ? `${startDate} a ${endDate}` : "Todo o período",
      obra: obraName,
      porEspecialidade,
      topCategorias,
    };
  }, [records, getParentCatName, obraFilter, obras, dateMode, selectedDate, startDate, endDate]);

  const handleGenerateAIReport = async () => {
    if (records.length === 0) {
      toast({ title: "Sem dados", description: "Nenhuma observação encontrada para o período selecionado.", variant: "destructive" });
      return;
    }
    setIsGeneratingReport(true);
    setAiReport("");
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ type: "report", context: aiStats }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        toast({ title: resp.status === 429 ? "Limite atingido" : resp.status === 402 ? "Créditos insuficientes" : "Erro", description: err.error, variant: "destructive" });
        return;
      }
      if (!resp.body) throw new Error("Sem resposta da IA");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      while (!done) {
        const { done: sd, value } = await reader.read();
        if (sd) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) setAiReport((prev) => prev + content);
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setIsGeneratingReport(false);
      setAiReportExpanded(true);
    }
  };

  const formatAIReport = (text: string) =>
    text.split("\n").map((line, i) => {
      if (line.startsWith("## ") || line.startsWith("# "))
        return <h2 key={i} className="text-base font-bold text-foreground mt-5 mb-2">{line.replace(/^#+\s*/, "").replace(/\*\*/g, "")}</h2>;
      if (line.startsWith("**") && line.endsWith("**"))
        return <h3 key={i} className="font-semibold text-foreground mt-4 mb-1">{line.replace(/\*\*/g, "")}</h3>;
      if (line.startsWith("- ") || line.startsWith("• "))
        return <li key={i} className="ml-4 text-sm text-foreground/80 list-disc">{line.replace(/^[-•]\s*/, "")}</li>;
      if (line.trim() === "") return <br key={i} />;
      const parts = line.split(/\*\*([^*]+)\*\*/g);
      return (
        <p key={i} className="text-sm text-foreground/80 leading-relaxed">
          {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
        </p>
      );
    });

  const chartCardClass = (filterKey: keyof CrossFilters) =>
    `stat-card animate-fade-in mb-6 transition-all ${crossFilters[filterKey] ? "ring-2 ring-primary/50" : ""}`;

  const paretoLabel = paretoMode === "especialidade" ? "Especialidades" : "Categorias";

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard de Produtividade</h1>
            <p className="text-sm text-muted-foreground mt-1">Visão geral da medição de produtividade — MEGASTEAM</p>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex gap-2 items-end flex-wrap">
              {/* Quick presets */}
              <div>
                <Label className="text-xs text-muted-foreground">Atalhos</Label>
                <div className="flex gap-1 mt-1">
                  <Button variant="outline" size="sm" className="h-10 px-3 text-xs" onClick={() => applyQuickFilter("today")}>Hoje</Button>
                  <Button variant="outline" size="sm" className="h-10 px-3 text-xs" onClick={() => applyQuickFilter("week")}>Semana</Button>
                  <Button variant="outline" size="sm" className="h-10 px-3 text-xs" onClick={() => applyQuickFilter("month")}>Mês</Button>
                  {dateMode !== "all" && (
                    <Button variant="ghost" size="sm" className="h-10 px-2 text-xs text-muted-foreground" onClick={() => setDateMode("all")}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Período</Label>
                <Select value={dateMode} onValueChange={(v) => setDateMode(v as any)}>
                  <SelectTrigger className="w-32 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="day">Dia</SelectItem>
                    <SelectItem value="period">Período</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {dateMode === "day" && (
                <div>
                  <Label className="text-xs text-muted-foreground">Data</Label>
                  <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-40 mt-1" />
                </div>
              )}
              {dateMode === "period" && (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">Início</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40 mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Fim</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40 mt-1" />
                  </div>
                </>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Contrato</Label>
              <Select value={obraFilter} onValueChange={setObraFilter}>
                <SelectTrigger className="w-48 mt-1"><SelectValue placeholder="Filtrar por Contrato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Contratos</SelectItem>
                  {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={exportToExcel} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={exportToPDF} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Active cross-filters bar */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20 animate-fade-in">
            <span className="text-xs font-semibold text-muted-foreground">Filtros ativos:</span>
            {crossFilters.categoria && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("categoria", crossFilters.categoria!)}>
                Categoria: {crossFilters.categoria} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.contrato && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("contrato", crossFilters.contrato!)}>
                Contrato: {crossFilters.contrato} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.rota && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("rota", crossFilters.rota!)}>
                Rota: {crossFilters.rota} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.especialidade && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("especialidade", crossFilters.especialidade!)}>
                Especialidade: {crossFilters.especialidade} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.horario && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("horario", crossFilters.horario!)}>
                Horário: {crossFilters.horario} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.funcao && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("funcao", crossFilters.funcao!)}>
                Função: {crossFilters.funcao} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.pareto && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("pareto", crossFilters.pareto!)}>
                Pareto ({paretoLabel}): {crossFilters.pareto} <X className="w-3 h-3" />
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs h-6 px-2">
              Limpar todos
            </Button>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard title="Total de Amostras" value={totalSamples} subtitle="Observações registradas" icon={Users} />
          <StatCard title="Produtividade" value={`${productivePercent}%`} subtitle="Trabalhando + Planejando" icon={BarChart3} variant="success" />
          <StatCard title="Não Produtivo" value={unproductiveCount} subtitle="Pessoal + Ocioso" icon={AlertTriangle} variant="danger" />
          <StatCard title="Registros" value={allRecords.length} subtitle={`${allRecords.length} observações`} icon={Clock} />
        </div>

        {/* AI Analysis Section */}
        <div className="stat-card animate-fade-in mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Análise Inteligente</h3>
                <p className="text-[11px] text-muted-foreground">A IA analisa os dados do período atual e gera insights acionáveis</p>
              </div>
            </div>
            <Button
              onClick={handleGenerateAIReport}
              disabled={isGeneratingReport || records.length === 0}
              size="sm"
              className="gap-2"
            >
              {isGeneratingReport ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> {aiReport ? "Atualizar Análise" : "Gerar Análise com IA"}</>
              )}
            </Button>
          </div>

          {(aiReport || isGeneratingReport) && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground">Análise gerada — {aiStats.periodo} {aiStats.obra && `• ${aiStats.obra}`}</span>
                {isGeneratingReport && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                {!isGeneratingReport && aiReport && (
                  <button
                    onClick={() => setAiReportExpanded((v) => !v)}
                    className="ml-auto flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                  >
                    {aiReportExpanded ? (
                      <><ChevronUp className="w-4 h-4" /> Recolher</>
                    ) : (
                      <><ChevronDown className="w-4 h-4" /> Expandir</>
                    )}
                  </button>
                )}
              </div>
              {aiReportExpanded && (
                <div className="prose prose-sm max-w-none">
                  {formatAIReport(aiReport)}
                </div>
              )}
              {isGeneratingReport && !aiReport && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Analisando dados...
                </div>
              )}
            </div>
          )}

          {records.length === 0 && (
            <p className="text-xs text-muted-foreground mt-3">Selecione um período com dados para habilitar a análise.</p>
          )}
        </div>

        {/* Visão Geral por Contrato */}
        <div className={chartCardClass("contrato")}>
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Visão Geral por Contrato
            {crossFilters.contrato && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.contrato}</span>}
          </h3>
          <p className="text-[10px] text-muted-foreground mb-2">Clique em uma barra para filtrar todos os gráficos</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byObra} margin={{ bottom: 20 }} onClick={handleContratoClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(220, 10%, 45%)" }} angle={-15} textAnchor="end" />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [`${value}%`, name]} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="productive" name="Produtivo" fill="hsl(142, 70%, 45%)" stackId="a" className="cursor-pointer" />
              <Bar dataKey="supplementary" name="Suplementar" fill="hsl(32, 95%, 50%)" stackId="a" className="cursor-pointer" />
              <Bar dataKey="unproductive" name="Não Produtivo" fill="hsl(0, 72%, 51%)" stackId="a" radius={[4, 4, 0, 0]} className="cursor-pointer">
                <LabelList dataKey="prodPercent" position="top" formatter={(v: number) => `${v}% prod`} style={{ fontSize: 10, fill: "hsl(220, 10%, 45%)" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Distribution Pie */}
          <div className={`stat-card animate-fade-in transition-all ${crossFilters.categoria ? "ring-2 ring-primary/50" : ""}`}>
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Distribuição por Categoria
              {crossFilters.categoria && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.categoria}</span>}
            </h3>
            <p className="text-[10px] text-muted-foreground mb-2">Clique em uma fatia para filtrar</p>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={categoryTotals} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                  paddingAngle={3} dataKey="value" label={renderPieLabel} labelLine={false}
                  onClick={handlePieClick}
                >
                  {categoryTotals.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={CATEGORY_COLORS[entry.name] || "#666"}
                      className="cursor-pointer"
                      opacity={crossFilters.categoria && crossFilters.categoria !== entry.name ? 0.3 : 1}
                      stroke={crossFilters.categoria === entry.name ? "hsl(220, 70%, 30%)" : "none"}
                      strokeWidth={crossFilters.categoria === entry.name ? 3 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => {
                  const total = categoryTotals.reduce((s, c) => s + c.value, 0);
                  return [`${value} (${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%)`, "Amostras"];
                }} />
                <Legend wrapperStyle={{ fontSize: "12px" }} formatter={(value: string) => <span className="text-muted-foreground">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Pareto — configurable */}
          <div className={`stat-card animate-fade-in transition-all ${crossFilters.pareto ? "ring-2 ring-primary/50" : ""}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Top Causas (Pareto)
                  {crossFilters.pareto && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.pareto}</span>}
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Clique em uma barra para filtrar</p>
              </div>
              {/* Pareto mode toggle */}
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-muted-foreground mr-1">Pareto por:</span>
                <button
                  onClick={() => handleParetoModeChange("categoria")}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors border ${
                    paretoMode === "categoria"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  Categorias
                </button>
                <button
                  onClick={() => handleParetoModeChange("especialidade")}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors border ${
                    paretoMode === "especialidade"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  Especialidades
                </button>
                <button
                  onClick={() => handleParetoModeChange("funcao")}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors border ${
                    paretoMode === "funcao"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  Funções
                </button>
              </div>
            </div>

            {paretoData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[240px] text-center gap-2">
                <BarChart3 className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Sem dados para o Pareto</p>
                <p className="text-xs text-muted-foreground/70">Ajuste os filtros para ver dados</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={paretoData} layout="vertical" margin={{ left: 10, right: 60 }} onClick={handleParetoClick}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
                  <YAxis
                    dataKey="name" type="category" width={160}
                    tick={{ fontSize: 10, fill: "hsl(220, 10%, 45%)" }}
                    tickFormatter={(v: string) => v.length > 22 ? v.substring(0, 22) + "…" : v}
                  />
                  <YAxis yAxisId="right" hide />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number, name: string, entry: any) => {
                      if (name === "% Acumulado") return [`${value}%`, name];
                      return [`${value}% (${entry.payload.value} amostras)`, "Amostras"];
                    }}
                  />
                  <Bar dataKey="percent" name="Amostras" radius={[0, 4, 4, 0]} className="cursor-pointer">
                    {paretoData.map((item, i) => (
                      <Cell
                        key={i}
                        fill={paretoMode === "especialidade" ? getSpecialtyColor(item.name) : PIE_COLORS[i % PIE_COLORS.length]}
                        opacity={crossFilters.pareto && crossFilters.pareto !== item.name ? 0.3 : 1}
                      />
                    ))}
                    <LabelList dataKey="percent" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 10, fill: "hsl(220, 10%, 45%)" }} />
                  </Bar>
                  <Line
                    yAxisId="right" type="monotone" dataKey="cumPercent" name="% Acumulado"
                    stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(0, 72%, 51%)" }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Route Chart */}
        <div className={chartCardClass("rota")}>
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Produtividade por Rota
            {crossFilters.rota && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.rota}</span>}
          </h3>
          <p className="text-[10px] text-muted-foreground mb-2">Clique em uma barra para filtrar</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byRoute} onClick={handleRouteClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [`${value}%`, name]} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="productive" name="Produtivo" fill="hsl(142, 70%, 45%)" stackId="a" className="cursor-pointer" />
              <Bar dataKey="supplementary" name="Suplementar" fill="hsl(32, 95%, 50%)" stackId="a" className="cursor-pointer" />
              <Bar dataKey="unproductive" name="Não Produtivo" fill="hsl(0, 72%, 51%)" stackId="a" radius={[4, 4, 0, 0]} className="cursor-pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Specialty Chart */}
        <div className={chartCardClass("especialidade")}>
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Produtividade por Especialidade
            {crossFilters.especialidade && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.especialidade}</span>}
          </h3>
          <p className="text-[10px] text-muted-foreground mb-2">Clique em uma barra para filtrar</p>
           <ResponsiveContainer width="100%" height={320}>
            <BarChart data={bySpecialty} margin={{ bottom: 20 }} onClick={handleSpecialtyClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(220, 10%, 45%)" }} angle={-25} textAnchor="end" />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [`${value}%`, name]} />
              <Bar dataKey="productive" name="Produtivo" stackId="a" className="cursor-pointer">
                {bySpecialty.map((item, i) => (
                  <Cell key={i} fill={getSpecialtyColor(item.name)} opacity={0.9} />
                ))}
              </Bar>
              <Bar dataKey="supplementary" name="Suplementar" stackId="a" className="cursor-pointer">
                {bySpecialty.map((item, i) => (
                  <Cell key={i} fill={getSpecialtyColor(item.name)} opacity={0.6} />
                ))}
              </Bar>
              <Bar dataKey="unproductive" name="Não Produtivo" stackId="a" radius={[4, 4, 0, 0]} className="cursor-pointer">
                {bySpecialty.map((item, i) => (
                  <Cell key={i} fill={getSpecialtyColor(item.name)} opacity={0.3} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Function */}
        <div className={`stat-card animate-fade-in mb-6 transition-all ${crossFilters.funcao ? "ring-2 ring-primary/50" : ""}`}>
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Produtividade por Função
            {crossFilters.funcao && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.funcao}</span>}
          </h3>
          <p className="text-[10px] text-muted-foreground mb-2">Clique em uma barra para filtrar</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={byFunction} margin={{ bottom: 20 }} onClick={handleFunctionClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(220, 10%, 45%)" }} angle={-25} textAnchor="end" />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [`${value}%`, name]} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="productive" name="Produtivo" fill="hsl(142, 70%, 45%)" stackId="a" className="cursor-pointer" />
              <Bar dataKey="supplementary" name="Suplementar" fill="hsl(32, 95%, 50%)" stackId="a" className="cursor-pointer" />
              <Bar dataKey="unproductive" name="Não Produtivo" fill="hsl(0, 72%, 51%)" stackId="a" radius={[4, 4, 0, 0]} className="cursor-pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Time Slot */}
        <div className={chartCardClass("horario")}>
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Amostras por Horário
            {crossFilters.horario && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.horario}</span>}
          </h3>
          <p className="text-[10px] text-muted-foreground mb-2">Clique em uma barra para filtrar</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byTime} onClick={handleTimeClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="total" name="Total" fill="hsl(220, 70%, 55%)" radius={[4, 4, 0, 0]} className="cursor-pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AppLayout>
  );
}
