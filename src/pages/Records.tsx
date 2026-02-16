import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MOCK_RECORDS, SPECIALTIES, type ObservationCategory } from "@/data/mockData";
import { Search } from "lucide-react";

const categoryBadgeVariant: Record<string, string> = {
  Produtivo: "bg-success/15 text-success border-success/30",
  Suplementar: "bg-primary/15 text-primary border-primary/30",
  "Não Produtivo": "bg-destructive/15 text-destructive border-destructive/30",
};

export default function Records() {
  const [search, setSearch] = useState("");
  const [filterSpecialty, setFilterSpecialty] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const filtered = MOCK_RECORDS.filter((r) => {
    if (filterSpecialty !== "all" && r.specialty !== filterSpecialty) return false;
    if (filterCategory !== "all" && r.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.description.toLowerCase().includes(q) ||
        r.specialty.toLowerCase().includes(q) ||
        r.sampler.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Registros</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Todas as observações de produtividade registradas
          </p>
        </div>

        {/* Filters */}
        <div className="stat-card mb-6 animate-fade-in">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar registros..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-48">
              <Select value={filterSpecialty} onValueChange={setFilterSpecialty}>
                <SelectTrigger><SelectValue placeholder="Especialidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Especialidades</SelectItem>
                  {SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Categorias</SelectItem>
                  <SelectItem value="Produtivo">Produtivo</SelectItem>
                  <SelectItem value="Suplementar">Suplementar</SelectItem>
                  <SelectItem value="Não Produtivo">Não Produtivo</SelectItem>
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
                <TableHead className="text-xs font-semibold">ID</TableHead>
                <TableHead className="text-xs font-semibold">Data</TableHead>
                <TableHead className="text-xs font-semibold">Hora</TableHead>
                <TableHead className="text-xs font-semibold">Rota</TableHead>
                <TableHead className="text-xs font-semibold">Especialidade</TableHead>
                <TableHead className="text-xs font-semibold">Categoria</TableHead>
                <TableHead className="text-xs font-semibold">Descrição</TableHead>
                <TableHead className="text-xs font-semibold text-right">Qtd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer">
                  <TableCell className="text-xs font-mono text-muted-foreground">{r.id}</TableCell>
                  <TableCell className="text-xs">{r.date}</TableCell>
                  <TableCell className="text-xs">{r.time}</TableCell>
                  <TableCell className="text-xs">{r.route}</TableCell>
                  <TableCell className="text-xs font-medium">{r.specialty}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${categoryBadgeVariant[r.category]}`}>
                      {r.category}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{r.description}</TableCell>
                  <TableCell className="text-xs text-right font-bold">{r.quantity}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
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
