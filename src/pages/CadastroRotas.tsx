import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import CrudPage from "@/components/CrudPage";
import { useAuth } from "@/hooks/useAuth";

export default function CadastroRotas() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["rotas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rotas").select("*").order("codigo");
      if (error) throw error;
      return data;
    },
  });

  const save = async (form: Record<string, string>) => {
    const { error } = await supabase.from("rotas").insert({
      codigo: form.nome.trim().toUpperCase().slice(0, 20),
      nome: form.nome,
      descricao: form.descricao || null,
      status: form.status,
      criado_por: user?.id,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["rotas"] });
  };

  const update = async (id: string, form: Record<string, string>) => {
    const { error } = await supabase.from("rotas").update({
      nome: form.nome,
      descricao: form.descricao || null,
      status: form.status,
      alterado_por: user?.id,
    }).eq("id", id);
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
      onSave={save}
      onUpdate={update}
      onDelete={remove}
    />
  );
}
