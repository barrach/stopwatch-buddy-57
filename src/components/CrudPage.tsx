import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Search, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface CrudField {
  key: string;
  label: string;
  type?: "text" | "textarea" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface CrudItem {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string | null;
  status: string;
  criado_em: string;
  [key: string]: any;
}

interface CrudPageProps {
  title: string;
  subtitle: string;
  items: CrudItem[];
  loading: boolean;
  extraFields?: CrudField[];
  onSave: (data: Record<string, string>) => Promise<void>;
  onUpdate: (id: string, data: Record<string, string>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export default function CrudPage({ title, subtitle, items, loading, extraFields = [], onSave, onUpdate, onDelete }: CrudPageProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<CrudItem | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ nome: "", descricao: "", status: "Ativo" });
  const [saving, setSaving] = useState(false);

  const filtered = items.filter((item) => {
    if (filterStatus !== "all" && item.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return item.nome.toLowerCase().includes(q);
    }
    return true;
  });

  const openNew = () => {
    setEditItem(null);
    setForm({ nome: "", descricao: "", status: "Ativo" });
    setDialogOpen(true);
  };

  const openEdit = (item: CrudItem) => {
    setEditItem(item);
    const formData: Record<string, string> = {
      nome: item.nome,
      descricao: item.descricao || "",
      status: item.status,
    };
    extraFields.forEach((f) => {
      formData[f.key] = item[f.key] || "";
    });
    setForm(formData);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast({ title: "Campo obrigatório", description: "Nome é obrigatório.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editItem) {
        await onUpdate(editItem.id, form);
        toast({ title: "Atualizado!", description: `${form.nome} atualizado com sucesso.` });
      } else {
        await onSave(form);
        toast({ title: "Criado!", description: `${form.nome} criado com sucesso.` });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: CrudItem) => {
    if (!onDelete) return;
    try {
      await onDelete(item.id);
      toast({ title: "Excluído!", description: `${item.nome} foi removido.` });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
  };

  const toggleStatus = async (item: CrudItem) => {
    const newStatus = item.status === "Ativo" ? "Inativo" : "Ativo";
    try {
      await onUpdate(item.id, { ...item, status: newStatus });
      toast({ title: `${item.nome} ${newStatus === "Ativo" ? "ativado" : "inativado"}` });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Novo
          </Button>
        </div>

        {/* Filters */}
        <div className="stat-card mb-6 animate-fade-in">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="w-40">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Ativo">Ativos</SelectItem>
                  <SelectItem value="Inativo">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="stat-card animate-fade-in overflow-hidden p-0">
          {loading ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Carregando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold">Nome</TableHead>
                  <TableHead className="text-xs font-semibold">Descrição</TableHead>
                  {extraFields.map((f) => (
                    <TableHead key={f.key} className="text-xs font-semibold">{f.label}</TableHead>
                  ))}
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs font-medium">{item.nome}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{item.descricao || "—"}</TableCell>
                    {extraFields.map((f) => (
                      <TableCell key={f.key} className="text-xs">{item[f.key] || "—"}</TableCell>
                    ))}
                    <TableCell>
                      <button
                        onClick={() => toggleStatus(item)}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer transition-colors ${
                          item.status === "Ativo"
                            ? "bg-success/15 text-success border-success/30 hover:bg-success/25"
                            : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                        }`}
                      >
                        {item.status}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {onDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir {item.nome}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita. O item será removido permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(item)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4 + extraFields.length} className="text-center py-8 text-sm text-muted-foreground">
                      Nenhum item encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">{filtered.length} item(ns)</p>

        {/* Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editItem ? "Editar" : "Novo"} {title.replace(/s$/, "")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs text-muted-foreground">Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Descrição</Label>
                <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="mt-1" rows={2} />
              </div>
              {extraFields.map((f) => (
                <div key={f.key}>
                  <Label className="text-xs text-muted-foreground">{f.label} {f.required ? "*" : ""}</Label>
                  {f.type === "select" && f.options ? (
                    <Select value={form[f.key] || ""} onValueChange={(v) => setForm({ ...form, [f.key]: v })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder={f.placeholder || "Selecione..."} /></SelectTrigger>
                      <SelectContent>
                        {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="mt-1" placeholder={f.placeholder} />
                  )}
                </div>
              ))}
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
