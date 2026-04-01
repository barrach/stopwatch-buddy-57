import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRecords: any[];
  horario: string;
}

/** Distribution rules per time slot for the non-observed fraction */
const DISTRIBUTION_RULES: Record<string, Array<{ descricao: string; fraction: number }>> = {
  "08:00": [
    { descricao: "Aguardando Liberação de PT", fraction: 1.0 },
  ],
  "13:00": [
    { descricao: "Aguardando Ferramenta ou Material", fraction: 0.30 },
    { descricao: "Transitando no local de trabalho - com ferramenta", fraction: 0.40 },
    { descricao: "Transitando no local de trabalho - sem ferramenta", fraction: 0.30 },
  ],
};

export default function PonderacaoModal({ open, onOpenChange, selectedRecords, horario }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [horaReal, setHoraReal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const baseHour = parseInt(horario.split(":")[0], 10);

  const validate = (value: string): string | null => {
    if (!value) return "Informe a hora real da medição";
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return "Formato inválido. Use HH:mm";
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h !== baseHour) return `A hora deve estar entre ${horario} e ${String(baseHour).padStart(2, "0")}:59`;
    if (m < 0 || m > 59) return "Minutos devem estar entre 00 e 59";
    if (m === 0) return "A hora real deve ser diferente do horário nominal (ex: 08:50)";
    return null;
  };

  const handleApply = async () => {
    const validationError = validate(horaReal);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setSaving(true);

    try {
      const minutes = parseInt(horaReal.split(":")[1], 10);
      const pesoReal = +(minutes / 60).toFixed(4);

      // Update all selected records with weighting metadata
      const ids = selectedRecords.map((r) => r.id);
      const { error: updateError } = await supabase
        .from("observacoes")
        .update({
          ponderado: true,
          hora_real: horaReal,
          peso_real: pesoReal,
        })
        .in("id", ids);

      if (updateError) throw updateError;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["observacoes"] }),
        queryClient.refetchQueries({ queryKey: ["observacoes"] }),
      ]);

      toast({
        title: "Ponderação aplicada",
        description: `${ids.length} registro(s) ponderados com hora real ${horaReal} (peso ${(pesoReal * 100).toFixed(0)}%).`,
      });
      onOpenChange(false);
      setHoraReal("");
    } catch (err: any) {
      toast({ title: "Erro ao ponderar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const minutes = horaReal.match(/^(\d{1,2}):(\d{2})$/) ? parseInt(horaReal.split(":")[1], 10) : 0;
  const pesoReal = minutes > 0 ? +(minutes / 60).toFixed(4) : 0;
  const pesoRestante = +(1 - pesoReal).toFixed(4);
  const distribution = DISTRIBUTION_RULES[horario] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            Ponderar Registros — {horario}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50 text-sm">
            <p className="font-medium text-foreground">{selectedRecords.length} registro(s) selecionado(s)</p>
            <p className="text-xs text-muted-foreground mt-1">
              Horário nominal: <strong>{horario}</strong>
            </p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Hora real da medição</Label>
            <Input
              type="time"
              value={horaReal}
              onChange={(e) => { setHoraReal(e.target.value); setError(""); }}
              className="mt-1"
              placeholder="HH:mm"
            />
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          </div>

          {pesoReal > 0 && (
            <div className="space-y-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="text-xs font-semibold text-foreground">Prévia do Cálculo</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Tempo observado</p>
                  <p className="font-bold text-foreground">{minutes} min → {(pesoReal * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tempo não observado</p>
                  <p className="font-bold text-foreground">{60 - minutes} min → {(pesoRestante * 100).toFixed(1)}%</p>
                </div>
              </div>

              <div className="border-t border-border/50 pt-2">
                <p className="text-[10px] text-muted-foreground mb-1">Distribuição do tempo não observado:</p>
                {distribution.map((d) => (
                  <div key={d.descricao} className="flex justify-between text-xs py-0.5">
                    <span className="text-muted-foreground">{d.descricao}</span>
                    <span className="font-medium text-foreground">{(d.fraction * pesoRestante * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleApply} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Aplicar Ponderação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}