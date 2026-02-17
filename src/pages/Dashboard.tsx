import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import StatCard, { Users, Clock, BarChart3, AlertTriangle } from "@/components/StatCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OBRAS,
  aggregateByCategory,
  aggregateBySpecialty,
  aggregateByTimeSlot,
  aggregateByRoute,
} from "@/data/mockData";
import { useRecords } from "@/hooks/useRecords";

const CATEGORY_COLORS: Record<string, string> = {
  Produtivo: "hsl(142, 70%, 45%)",
  Suplementar: "hsl(32, 95%, 50%)",
  "Não Produtivo": "hsl(0, 72%, 51%)",
};

const PIE_COLORS = [
  "hsl(32, 95%, 50%)",
  "hsl(220, 70%, 55%)",
  "hsl(142, 70%, 45%)",
  "hsl(0, 72%, 51%)",
  "hsl(280, 65%, 55%)",
  "hsl(180, 60%, 45%)",
  "hsl(45, 93%, 47%)",
  "hsl(340, 70%, 50%)",
];

const tooltipStyle = {
  background: "hsl(220, 25%, 12%)",
  border: "1px solid hsl(220, 20%, 20%)",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "12px",
};

const renderPieLabel = ({ name, percent }: { name: string; percent: number }) =>
  `${(percent * 100).toFixed(1)}%`;

export default function Dashboard() {
  const { records: allRecords } = useRecords();
  const [obraFilter, setObraFilter] = useState("all");

  const records = useMemo(
    () => obraFilter === "all" ? allRecords : allRecords.filter((r) => r.obra === obraFilter),
    [allRecords, obraFilter]
  );

  const totalSamples = useMemo(() => records.reduce((s, r) => s + r.quantity, 0), [records]);
  const productiveCount = useMemo(
    () => records.filter((r) => r.category === "Produtivo").reduce((s, r) => s + r.quantity, 0),
    [records]
  );
  const productivePercent = totalSamples > 0 ? Math.round((productiveCount / totalSamples) * 100) : 0;
  const unproductiveCount = useMemo(
    () => records.filter((r) => r.category === "Não Produtivo").reduce((s, r) => s + r.quantity, 0),
    [records]
  );

  const byCategory = useMemo(() => aggregateByCategory(records), [records]);
  const bySpecialty = useMemo(() => aggregateBySpecialty(records), [records]);
  const byTime = useMemo(() => aggregateByTimeSlot(records), [records]);
  const byRoute = useMemo(() => aggregateByRoute(records), [records]);

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = { Produtivo: 0, Suplementar: 0, "Não Produtivo": 0 };
    records.forEach((r) => (totals[r.category] += r.quantity));
    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [records]);

  // Add percentage to Pareto data
  const byCategoryWithPercent = useMemo(() => {
    const total = byCategory.reduce((s, c) => s + c.value, 0);
    return byCategory.slice(0, 8).map((c) => ({
      ...c,
      percent: total > 0 ? Math.round((c.value / total) * 100) : 0,
    }));
  }, [byCategory]);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard de Produtividade</h1>
            <p className="text-sm text-muted-foreground mt-1">Visão geral da medição de produtividade — UNIPAR</p>
          </div>
          <div className="w-56">
            <Select value={obraFilter} onValueChange={setObraFilter}>
              <SelectTrigger><SelectValue placeholder="Filtrar por Obra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Obras</SelectItem>
                {OBRAS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard title="Total de Amostras" value={totalSamples} subtitle="Fev 2026" icon={Users} trend={{ value: "+12%", positive: true }} />
          <StatCard title="Produtividade" value={`${productivePercent}%`} subtitle="Trabalhando + Planejando" icon={BarChart3} variant="success" trend={{ value: "+5%", positive: true }} />
          <StatCard title="Não Produtivo" value={unproductiveCount} subtitle="Pessoal + Ocioso" icon={AlertTriangle} variant="danger" />
          <StatCard title="Registros" value={records.length} subtitle={`${records.length} observações`} icon={Clock} />
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
                    <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || "#666"} />
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

          {/* Pareto - Top Causes */}
          <div className="stat-card animate-fade-in">
            <h3 className="text-sm font-semibold text-foreground mb-4">Top Causas (Pareto)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byCategoryWithPercent} layout="vertical" margin={{ left: 20, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
                <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 10, fill: "hsl(220, 10%, 45%)" }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number, _: string, entry: any) => [`${value} (${entry.payload.percent}%)`, "Amostras"]} />
                <Bar dataKey="value" name="Amostras" radius={[0, 4, 4, 0]}>
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
            <BarChart data={byRoute}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string, entry: any) => {
                const total = entry.payload.total;
                return [`${value} (${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%)`, name];
              }} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="productive" name="Produtivo" fill="hsl(142, 70%, 45%)" stackId="a" />
              <Bar dataKey="supplementary" name="Suplementar" fill="hsl(32, 95%, 50%)" stackId="a" />
              <Bar dataKey="unproductive" name="Não Produtivo" fill="hsl(0, 72%, 51%)" stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Specialty Chart */}
        <div className="stat-card animate-fade-in mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Produtividade por Especialidade</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={bySpecialty} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(220, 10%, 45%)" }} angle={-25} textAnchor="end" />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="productive" name="Produtivo" fill="hsl(142, 70%, 45%)" stackId="a" />
              <Bar dataKey="supplementary" name="Suplementar" fill="hsl(32, 95%, 50%)" stackId="a" />
              <Bar dataKey="unproductive" name="Não Produtivo" fill="hsl(0, 72%, 51%)" stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Time Slot */}
        <div className="stat-card animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground mb-4">Amostras por Horário</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" opacity={0.3} />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 45%)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="total" name="Total" fill="hsl(220, 70%, 55%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AppLayout>
  );
}
