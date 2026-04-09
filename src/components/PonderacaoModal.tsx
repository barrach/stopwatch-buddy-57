import { useState, useMemo } from "react";
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

interface GroupState {
  horaReal: string;
  error: string;
}

export default function PonderacaoModal({ open, onOpenChange, selectedRecords, horario }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const baseHour = parseInt(horario.split(":")[0], 10);

  // Group records by especialidade
  const groups = useMemo(() => {
    const map = new Map<string, { especialidadeNome: string; records: any[] }>();
    for (const r of selectedRecords) {
      const espId = r.especialidade_id || "unknown";
      const espNome = (r.especialidades as any)?.nome || "Sem especialidade";
      if (!map.has(espId)) {
        map.set(espId, { especialidadeNome: espNome, records: [] });
      }
      map.get(espId)!.records.push(r);
    }
    return Array.from(map.entries()).map(([id, data]) => ({
      especialidadeId: id,
      especialidadeNome: data.especialidadeNome,
      records: data.records,
    }));
  }, [selectedRecords]);

  const isSingleGroup = groups.length === 1;

  // State: one hora_real per group
  const [groupStates, setGroupStates] = useState<Record<string, GroupState>>(() => {
    const initial: Record<string, GroupState> = {};
    for (const g of groups) {
      initial[g.especialidadeId] = { horaReal: "", error: "" };
    }
    return initial;
  });

  const updateGroup = (espId: string, horaReal: string) => {
    setGroupStates(prev => ({
      ...prev,
      [espId]: { horaReal, error: "" },
    }));
  };

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

  const getMinutes = (horaReal: string) => {
    const match = horaReal.match(/^(\d{1,2}):(\d{2})$/);
    return match ? parseInt(match[2], 10) : 0;
  };

  const handleApply = async () => {
    // Validate all groups
    let hasError = false;
    const newStates = { ...groupStates };
    for (const g of groups) {
      const err = validate(newStates[g.especialidadeId]?.horaReal || "");
      if (err) {
        newStates[g.especialidadeId] = { ...newStates[g.especialidadeId], error: err };
        hasError = true;
      }
    }
    if (hasError) {
      setGroupStates(newStates);
      return;
    }

    setSaving(true);
    try {
      // Apply weighting per group independently
      for (const g of groups) {
        const { horaReal } = groupStates[g.especialidadeId];
        const minutes = getMinutes(horaReal);
        const pesoReal = +(minutes / 60).toFixed(4);
        const ids = g.records.map((r: any) => r.id);

        const { error: updateError } = await supabase
          .from("observacoes")
          .update({
            ponderado: true,
            hora_real: horaReal,
            peso_real: pesoReal,
          })
          .in("id", ids);

        if (updateError) throw updateError;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["observacoes"] }),
        queryClient.refetchQueries({ queryKey: ["observacoes"] }),
      ]);

      const totalIds = selectedRecords.length;
      toast({
        title: "Ponderação aplicada",
        description: `${totalIds} registro(s) ponderados individualmente por especialidade.`,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao ponderar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const distribution = DISTRIBUTION_RULES[horario] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
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
              {groups.length > 1 && (
                <span className="ml-2 text-amber-600 font-medium">
                  — {groups.length} especialidades detectadas (ponderação independente)
                </span>
              )}
            </p>
          </div>

          {/* Per-group hora real input */}
          {groups.map((g) => {
            const state = groupStates[g.especialidadeId] || { horaReal: "", error: "" };
            const minutes = getMinutes(state.horaReal);
            const pesoReal = minutes > 0 ? +(minutes / 60).toFixed(4) : 0;
            const pesoRestante = +(1 - pesoReal).toFixed(4);

            return (
              <div key={g.especialidadeId} className="space-y-2 p-3 rounded-lg border border-border/50">
                {!isSingleGroup && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{g.especialidadeNome}</span>
                    <span className="text-xs text-muted-foreground">{g.records.length} registro(s)</span>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Hora real da medição{!isSingleGroup ? ` — ${g.especialidadeNome}` : ""}
                  </Label>
                  <Input
                    type="time"
                    value={state.horaReal}
                    onChange={(e) => updateGroup(g.especialidadeId, e.target.value)}
                    className="mt-1"
                    placeholder="HH:mm"
                  />
                  {state.error && <p className="text-xs text-destructive mt-1">{state.error}</p>}
                </div>

                {pesoReal > 0 && (
                  <div className="space-y-2 p-2 rounded bg-primary/5 border border-primary/20">
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

                    <div className="border-t border-border/50 pt-1">
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
            );
          })}
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
