import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileDown, Search, X } from "lucide-react";
import { format } from "date-fns";
import { normalizeDescriptionName } from "@/lib/categoryNormalization";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface NpeRecord {
  id: string;
  data: string;
  horario: string;
  descricao: string;
  quantidade: number;
  notas: string | null;
  obra_nome: string;
  especialidade_nome: string;
  categoria_pai_nome: string;
}

interface ChartItem {
  name: string;
  value: number;
  percent: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: any[];
  externalCausas: ChartItem[];
  isExternalRecord: (r: any) => boolean;
  getHH: (r: any) => number;
  getParentCatName: (r: any) => string;
}

export default function NpeTraceabilityModal({
  open, onOpenChange, records, externalCausas, isExternalRecord, getHH, getParentCatName,
}: Props) {
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [filterDescricao, setFilterDescricao] = useState("all");

  const AG_PT = "Aguardando Liberação de PT";

  // Get exactly the same records that compose the chart
  const npeRecords = useMemo(() => {
    return records.filter((r: any) => {
      const desc = normalizeDescriptionName(r.descricao || "");
      const isNPE = isExternalRecord(r);
      const isAgPT = desc === AG_PT;
      return isNPE || isAgPT;
    }).map((r: any) => ({
      id: r.id,
      data: r.data,
      horario: r.horario,
      descricao: normalizeDescriptionName(r.descricao || ""),
      quantidade: getHH(r),
      notas: r.notas,
      obra_nome: (r.obras as any)?.nome || "—",
      especialidade_nome: (r.especialidades as any)?.nome || "—",
      categoria_pai_nome: getParentCatName(r),
    }));
  }, [records, isExternalRecord, getHH, getParentCatName]);

  // Available categories and descriptions for filters
  const availableCategorias = useMemo(() => {
    const set = new Set(npeRecords.map(r => r.categoria_pai_nome));
    return Array.from(set).sort();
  }, [npeRecords]);

  const availableDescricoes = useMemo(() => {
    const set = new Set(npeRecords.map(r => r.descricao));
    return Array.from(set).sort();
  }, [npeRecords]);

  // Apply local filters (don't affect chart)
  const filtered = useMemo(() => {
    return npeRecords
      .filter(r => {
        if (filterDateStart && r.data < filterDateStart) return false;
        if (filterDateEnd && r.data > filterDateEnd) return false;
        if (filterCategoria !== "all" && r.categoria_pai_nome !== filterCategoria) return false;
        if (filterDescricao !== "all" && r.descricao !== filterDescricao) return false;
        return true;
      })
      .sort((a, b) => {
        const dateComp = b.data.localeCompare(a.data);
        if (dateComp !== 0) return dateComp;
        return b.horario.localeCompare(a.horario);
      });
  }, [npeRecords, filterDateStart, filterDateEnd, filterCategoria, filterDescricao]);

  const totalRecords = npeRecords.length;
  const totalHH = npeRecords.reduce((s, r) => s + r.quantidade, 0);

  const clearFilters = () => {
    setFilterDateStart("");
    setFilterDateEnd("");
    setFilterCategoria("all");
    setFilterDescricao("all");
  };

  const hasFilters = filterDateStart || filterDateEnd || filterCategoria !== "all" || filterDescricao !== "all";

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const now = format(new Date(), "yyyyMMdd_HHmm");

    doc.setFontSize(14);
    doc.text("Rastreabilidade — Não Produtivo Externo", 14, 15);
    doc.setFontSize(9);
    doc.text(`Total de registros: ${filtered.length} | HH Total: ${totalHH.toFixed(1)}`, 14, 22);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 27);

    autoTable(doc, {
      startY: 32,
      head: [["Data", "Hora", "Contrato", "Especialidade", "Categoria", "Descrição", "HH", "Observação", "ID"]],
      body: filtered.map(r => [
        r.data ? format(new Date(`${r.data}T12:00:00`), "dd/MM/yyyy") : "—",
        r.horario || "—",
        r.obra_nome,
        r.especialidade_nome,
        r.categoria_pai_nome,
        r.descricao,
        r.quantidade.toFixed(2),
        r.notas || "—",
        r.id.slice(0, 8),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 7 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    doc.save(`Rastreabilidade_Nao_Produtivo_Externo_${now}.pdf`);
  };

  const getCategoryBadgeColor = (cat: string) => {
    switch (cat) {
      case "Suplementar": return "bg-green-600/20 text-green-400 border-green-600/30";
      case "Não Produtivo Externo": return "bg-orange-600/20 text-orange-400 border-orange-600/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1200px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            Rastreabilidade — Causas Externas de Parada
          </DialogTitle>
        </DialogHeader>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Registros</p>
            <p className="text-xl font-bold text-foreground">{totalRecords}</p>
          </div>
          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">HH Total</p>
            <p className="text-xl font-bold text-foreground">{totalHH.toFixed(1)}</p>
          </div>
          {externalCausas.slice(0, 2).map(c => (
            <div key={c.name} className="rounded-lg border bg-muted/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{c.name}</p>
              <p className="text-xl font-bold text-foreground">{c.percent}%</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <Label className="text-[10px] text-muted-foreground">Data Inicial</Label>
            <Input type="date" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} className="h-8 text-xs w-36" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Data Final</Label>
            <Input type="date" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} className="h-8 text-xs w-36" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Categoria</Label>
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger className="h-8 text-xs w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {availableCategorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Descrição</Label>
            <Select value={filterDescricao} onValueChange={setFilterDescricao}>
              <SelectTrigger className="h-8 text-xs w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {availableDescricoes.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 text-xs">
              <X className="w-3 h-3" /> Limpar
            </Button>
          )}
          <div className="ml-auto">
            <Button size="sm" variant="outline" onClick={handleExportPDF} className="h-8 gap-1.5 text-xs">
              <FileDown className="w-3.5 h-3.5" /> Exportar PDF
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-2">
          Exibindo <strong>{filtered.length}</strong> de {totalRecords} registros
        </p>

        {/* Table */}
        <ScrollArea className="flex-1 border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-24">Data</TableHead>
                <TableHead className="text-xs w-16">Hora</TableHead>
                <TableHead className="text-xs">Contrato</TableHead>
                <TableHead className="text-xs">Especialidade</TableHead>
                <TableHead className="text-xs">Categoria</TableHead>
                <TableHead className="text-xs">Descrição</TableHead>
                <TableHead className="text-xs w-16 text-right">HH</TableHead>
                <TableHead className="text-xs">Observação</TableHead>
                <TableHead className="text-xs w-20">ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Nenhum registro encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.data ? format(new Date(`${r.data}T12:00:00`), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell className="text-xs">{r.horario || "—"}</TableCell>
                    <TableCell className="text-xs truncate max-w-[120px]">{r.obra_nome}</TableCell>
                    <TableCell className="text-xs truncate max-w-[100px]">{r.especialidade_nome}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className={`text-[10px] ${getCategoryBadgeColor(r.categoria_pai_nome)}`}>
                        {r.categoria_pai_nome}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs truncate max-w-[180px]">{r.descricao}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{r.quantidade.toFixed(2)}</TableCell>
                    <TableCell className="text-xs truncate max-w-[120px] text-muted-foreground">{r.notas || "—"}</TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">{r.id.slice(0, 8)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
