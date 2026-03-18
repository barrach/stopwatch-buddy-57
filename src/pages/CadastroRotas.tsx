import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import CrudPage, { CrudField } from "@/components/CrudPage";
import { useMemo } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export default function CadastroRotas() {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const qc = useQueryClient();

  const { data: obras = [] } = useQuery({
    queryKey: ["obras", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id, nome").eq("status", "Ativo").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["rotas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rotas").select("*, obras(nome)").order("nome");
      if (error) throw error;
      return data.map((r: any) => ({
        ...r,
        contrato_nome: r.obras?.nome || "—",
      }));
    },
  });

  const extraFields: CrudField[] = useMemo(() => [
    {
      key: "obra_id",
      label: "Contrato",
      type: "select" as const,
      required: true,
      options: obras.map((o) => ({ value: o.id, label: o.nome })),
      placeholder: "Selecione o contrato...",
      displayKey: "contrato_nome",
    },
  ], [obras]);

  const save = async (form: Record<string, string>) => {
    if (!form.obra_id) throw new Error("Selecione um contrato para a rota");
    const { error } = await supabase.from("rotas").insert({
      codigo: form.nome.trim().toUpperCase().slice(0, 20),
      nome: form.nome,
      obra_id: form.obra_id,
      descricao: form.descricao || null,
      status: form.status,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["rotas"] });
  };

  const update = async (id: string, form: Record<string, string>) => {
    const updateData: Record<string, any> = {
      nome: form.nome,
      descricao: form.descricao || null,
      status: form.status,
    };
    if (form.obra_id) updateData.obra_id = form.obra_id;
    const { error } = await supabase.from("rotas").update(updateData).eq("id", id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["rotas"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("rotas").delete().eq("id", id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["rotas"] });
  };

  return (
    <CrudPage
      title="Rotas"
      subtitle="Gerencie as rotas de amostragem"
      items={items as any}
      loading={isLoading}
      extraFields={extraFields}
      onSave={save}
      onUpdate={update}
      onDelete={remove}
    />
  );
}
