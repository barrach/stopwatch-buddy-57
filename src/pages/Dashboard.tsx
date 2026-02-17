import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import StatCard, { Users, Clock, BarChart3, AlertTriangle } from "@/components/StatCard";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

const tooltipStyle = {
  background: "hsl(220, 25%, 12%)", border: "1px solid hsl(220, 20%, 20%)",
  borderRadius: "8px", color: "#fff", fontSize: "12px",
};

const renderPieLabel = ({ percent }: { percent: number }) => `${(percent * 100).toFixed(1)}%`;

export default function Dashboard() {
  const [obraFilter, setObraFilter] = useState("all");
  const [dateMode, setDateMode] = useState<"all" | "day" | "period">("all");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [activeChart, setActiveChart] = useState<string | null>(null);
  const [drillData, setDrillData] = useState<{ title: string; data: any[] } | null>(null);

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
        .select("*, rotas(nome), especialidades(nome), categorias_observacao(nome, categoria_pai_id), obras(nome)")
        .order("data", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch parent categories to resolve category hierarchy
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

  const records = useMemo(() => {
    let filtered = obraFilter === "all" ? allRecords : allRecords.filter((r: any) => r.obra_id === obraFilter);
    if (dateMode === "day") {
      filtered = filtered.filter((r: any) => r.data === selectedDate);
    } else if (dateMode === "period") {
      filtered = filtered.filter((r: any) => r.data >= startDate && r.data <= endDate);
    }
    return filtered;
  }, [allRecords, obraFilter, dateMode, selectedDate, startDate, endDate]);

  // Resolve parent category name for each record
  const getParentCatName = useCallback((r: any) => {
    const catData = r.categorias_observacao as any;
    if (!catData) return "Sem categoria";
    if (catData.categoria_pai_id) {
      return parentCatMap[catData.categoria_pai_id] || catData.nome;
    }
    return catData.nome;
  }, [parentCatMap]);

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

  // Aggregations
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = { Produtivo: 0, Suplementar: 0, "Não Produtivo": 0 };
    records.forEach((r: any) => {
      const cat = getParentCatName(r);
      if (totals[cat] !== undefined) totals[cat] += r.quantidade || 0;
    });
    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [records, getParentCatName]);

  const byDescription = useMemo(() => {
    const totals: Record<string, number> = {};
    records.forEach((r: any) => {
      const key = r.descricao || "Sem descrição";
      totals[key] = (totals[key] || 0) + (r.quantidade || 0);
    });
    return Object.entries(totals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [records]);

  const byCategoryWithPercent = useMemo(() => {
    const total = byDescription.reduce((s, c) => s + c.value, 0);
    return byDescription.slice(0, 8).map((c) => ({
      ...c, percent: total > 0 ? Math.round((c.value / total) * 100) : 0,
    }));
  }, [byDescription]);

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
    return Object.entries(result).map(([name, v]) => ({ name, ...v, total: v.productive + v.supplementary + v.unproductive }));
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
    return Object.entries(result).filter(([_, v]) => v.productive + v.supplementary + v.unproductive > 0).map(([name, v]) => ({ name, ...v }));
  }, [records, getParentCatName]);

  const byTime = useMemo(() => {
    const result: Record<string, number> = {};
    records.forEach((r: any) => {
      const t = r.horario || "";
      result[t] = (result[t] || 0) + (r.quantidade || 0);
    });
    return Object.entries(result).sort(([a], [b]) => a.localeCompare(b)).map(([time, total]) => ({ time, total }));
  }, [records]);

  const byObra = useMemo(() => {
    const source = obraFilter === "all" ? records : records;
    const result: Record<string, { productive: number; supplementary: number; unproductive: number }> = {};
    source.forEach((r: any) => {
      const oName = (r.obras as any)?.nome || "Sem contrato";
      if (!result[oName]) result[oName] = { productive: 0, supplementary: 0, unproductive: 0 };
      const cat = getParentCatName(r);
      if (cat === "Produtivo") result[oName].productive += r.quantidade || 0;
      else if (cat === "Suplementar") result[oName].supplementary += r.quantidade || 0;
      else result[oName].unproductive += r.quantidade || 0;
    });
    return Object.entries(result).map(([name, v]) => ({
      name,
      ...v,
      total: v.productive + v.supplementary + v.unproductive,
      prodPercent: Math.round((v.productive / (v.productive + v.supplementary + v.unproductive)) * 100) || 0,
    }));
  }, [records, getParentCatName, obraFilter]);

  // Interactive drill-down handler
  const handleBarClick = (chartTitle: string, data: any[], entry: any) => {
    if (!entry || !entry.activePayload) return;
    const clicked = entry.activePayload[0]?.payload;
    if (!clicked) return;
    
    // Show drill-down details
    const details = records.filter((r: any) => {
      if (chartTitle.includes("Rota")) return (r.rotas as any)?.nome === clicked.name;
      if (chartTitle.includes("Especialidade")) return (r.especialidades as any)?.nome === clicked.name;
      if (chartTitle.includes("Contrato")) return (r.obras as any)?.nome === clicked.name;
      if (chartTitle.includes("Horário")) return r.horario === clicked.time;
      return false;
    });

    const drillDetails = details.map((r: any) => ({
      descricao: r.descricao,
      categoria: getParentCatName(r),
      especialidade: (r.especialidades as any)?.nome || "—",
      quantidade: r.quantidade,
      data: r.data,
    }));

    setDrillData({ title: `Detalhes: ${clicked.name || clicked.time}`, data: drillDetails });
  };

  // Export functions
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

  const exportToPDF = () => {
    window.print();
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard de Produtividade</h1>
            <p className="text-sm text-muted-foreground mt-1">Visão geral da medição de produtividade — MEGASTEM</p>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            {/* Date filter */}
            <div className="flex gap-2 items-end">
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
            {/* Obra filter */}
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
            {/* Export */}
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

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard title="Total de Amostras" value={totalSamples} subtitle="Observações registradas" icon={Users} />
          <StatCard title="Produtividade" value={`${productivePercent}%`} subtitle="Trabalhando + Planejando" icon={BarChart3} variant="success" />
          <StatCard title="Não Produtivo" value={unproductiveCount} subtitle="Pessoal + Ocioso" icon={AlertTriangle} variant="danger" />
          <StatCard title="Registros" value={records.length} subtitle={`${records.length} observações`} icon={Clock} />
        </div>

        {/* Drill-down panel */}
        {drillData && (
          <div className="stat-card animate-fade-in mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">{drillData.title}</h3>
              <Button variant="ghost" size="sm" onClick={() => setDrillData(null)}>Fechar</Button>
            </div>
            <div className="max-h-60 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 font-semibold">Data</th>
                    <th className="text-left py-1.5 font-semibold">Categoria</th>
                    <th className="text-left py-1.5 font-semibold">Especialidade</th>
                    <th className="text-left py-1.5 font-semibold">Descrição</th>
                    <th className="text-right py-1.5 font-semibold">Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {drillData.data.map((d, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1">{d.data}</td>
                      <td className="py-1">{d.categoria}</td>
                      <td className="py-1">{d.especialidade}</td>
                      <td className="py-1">{d.descricao}</td>
                      <td className="py-1 text-right font-bold">{d.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Visão Geral por Contrato */}
        <div className="stat-card animate-fade-in mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Visão Geral por Contrato</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byObra} margin={{ bottom: 20 }} onClick={(e) => handleBarClick("Contrato", byObra, e)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(220, 10%, 45%)" }} angle={-15} textAnchor="end" />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string, entry: any) => {
                const total = entry.payload.total;
                return [`${value} (${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%)`, name];
              }} />
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
          <div className="stat-card animate-fade-in">
            <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição por Categoria</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={categoryTotals} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={renderPieLabel} labelLine={false}>
                  {categoryTotals.map((entry) => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || "#666"} className="cursor-pointer" />
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

          {/* Pareto */}
          <div className="stat-card animate-fade-in">
            <h3 className="text-sm font-semibold text-foreground mb-4">Top Causas (Pareto)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byCategoryWithPercent} layout="vertical" margin={{ left: 20, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
                <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 10, fill: "hsl(220, 10%, 45%)" }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number, _: string, entry: any) => [`${value} (${entry.payload.percent}%)`, "Amostras"]} />
                <Bar dataKey="value" name="Amostras" radius={[0, 4, 4, 0]} className="cursor-pointer">
                  {byCategoryWithPercent.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                  <LabelList dataKey="percent" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 10, fill: "hsl(220, 10%, 45%)" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Route Chart */}
        <div className="stat-card animate-fade-in mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Produtividade por Rota</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byRoute} onClick={(e) => handleBarClick("Rota", byRoute, e)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string, entry: any) => {
                const total = entry.payload.total;
                return [`${value} (${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%)`, name];
              }} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="productive" name="Produtivo" fill="hsl(142, 70%, 45%)" stackId="a" className="cursor-pointer" />
              <Bar dataKey="supplementary" name="Suplementar" fill="hsl(32, 95%, 50%)" stackId="a" className="cursor-pointer" />
              <Bar dataKey="unproductive" name="Não Produtivo" fill="hsl(0, 72%, 51%)" stackId="a" radius={[4, 4, 0, 0]} className="cursor-pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Specialty Chart */}
        <div className="stat-card animate-fade-in mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Produtividade por Especialidade</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={bySpecialty} margin={{ bottom: 20 }} onClick={(e) => handleBarClick("Especialidade", bySpecialty, e)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(220, 10%, 45%)" }} angle={-25} textAnchor="end" />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="productive" name="Produtivo" fill="hsl(142, 70%, 45%)" stackId="a" className="cursor-pointer" />
              <Bar dataKey="supplementary" name="Suplementar" fill="hsl(32, 95%, 50%)" stackId="a" className="cursor-pointer" />
              <Bar dataKey="unproductive" name="Não Produtivo" fill="hsl(0, 72%, 51%)" stackId="a" radius={[4, 4, 0, 0]} className="cursor-pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Time Slot */}
        <div className="stat-card animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground mb-4">Amostras por Horário</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byTime} onClick={(e) => handleBarClick("Horário", byTime, e)}>
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
