import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import CrudPage from "@/components/CrudPage";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export default function CadastroEspecialidades() {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["especialidades"],
    queryFn: async () => {
      const { data, error } = await supabase.from("especialidades").select("*").order("codigo");
      if (error) throw error;
      return data;
    },
  });

  const save = async (form: Record<string, string>) => {
    const { error } = await supabase.from("especialidades").insert({
      codigo: form.nome.trim().toUpperCase().slice(0, 20), nome: form.nome, descricao: form.descricao || null, status: form.status, criado_por: null,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["especialidades"] });
  };

  const update = async (id: string, form: Record<string, string>) => {
    const { error } = await supabase.from("especialidades").update({
      nome: form.nome, descricao: form.descricao || null, status: form.status, alterado_por: null,
    }).eq("id", id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["especialidades"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("especialidades").delete().eq("id", id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["especialidades"] });
  };

  return (
    <CrudPage title="Especialidades" subtitle="Gerencie as especialidades de amostragem" items={items as any} loading={isLoading} onSave={save} onUpdate={update} onDelete={remove} />
  );
}
