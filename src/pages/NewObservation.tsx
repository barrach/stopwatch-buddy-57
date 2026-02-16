import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SPECIALTIES, OBSERVATION_CATEGORIES, ROUTES, TIME_SLOTS, COMPANIES, type ObservationCategory } from "@/data/mockData";
import { Camera, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function NewObservation() {
  const { toast } = useToast();
  const [category, setCategory] = useState<ObservationCategory | "">("");
  const [description, setDescription] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [route, setRoute] = useState("");
  const [time, setTime] = useState("");
  const [company, setCompany] = useState("UNIPAR");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");

  const descriptions = category ? OBSERVATION_CATEGORIES[category as ObservationCategory] : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!specialty || !route || !time || !category || !description || !quantity) {
      toast({ title: "Campos obrigatórios", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }

    toast({ title: "Observação registrada!", description: `${specialty} — ${description} (${quantity} amostras)` });

    // Reset form
    setCategory("");
    setDescription("");
    setSpecialty("");
    setRoute("");
    setTime("");
    setQuantity("1");
    setNotes("");
  };

  const handleRepeat = () => {
    toast({ title: "Repetir último registro", description: "Campos preenchidos com a última observação." });
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Nova Observação</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registre uma nova observação de produtividade
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Date/Time Row */}
          <div className="stat-card animate-fade-in">
            <h3 className="text-sm font-semibold text-foreground mb-4">Identificação</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date" className="text-xs text-muted-foreground">Data</Label>
                <Input id="date" type="date" defaultValue="2026-02-16" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Horário</Label>
                <Select value={time} onValueChange={setTime}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Rota</Label>
                <Select value={route} onValueChange={setRoute}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {ROUTES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Empresa</Label>
                <Select value={company} onValueChange={setCompany}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPANIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Observation Details */}
          <div className="stat-card animate-fade-in">
            <h3 className="text-sm font-semibold text-foreground mb-4">Observação</h3>
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Especialidade *</Label>
                <Select value={specialty} onValueChange={setSpecialty}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a especialidade..." /></SelectTrigger>
                  <SelectContent>
                    {SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Categoria *</Label>
                <Select value={category} onValueChange={(v) => { setCategory(v as ObservationCategory); setDescription(""); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a categoria..." /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(OBSERVATION_CATEGORIES) as ObservationCategory[]).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {category && (
                <div className="animate-fade-in">
                  <Label className="text-xs text-muted-foreground">Descrição *</Label>
                  <Select value={description} onValueChange={setDescription}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a descrição..." /></SelectTrigger>
                    <SelectContent>
                      {descriptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="qty" className="text-xs text-muted-foreground">Quantidade de Amostras *</Label>
                  <Input id="qty" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1" />
                </div>
              </div>

              <div>
                <Label htmlFor="notes" className="text-xs text-muted-foreground">Observações</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações adicionais..." className="mt-1" rows={3} />
              </div>

              {/* Photo placeholder */}
              <div>
                <Label className="text-xs text-muted-foreground">Foto</Label>
                <button
                  type="button"
                  className="mt-1 w-full h-24 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <Camera className="w-6 h-6" />
                  <span className="text-xs">Tirar foto ou anexar</span>
                </button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button type="submit" className="flex-1 gap-2">
              <Save className="w-4 h-4" />
              Salvar Observação
            </Button>
            <Button type="button" variant="outline" onClick={handleRepeat} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Repetir Último
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
