import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import CrudPage from "@/components/CrudPage";
import { useAuth } from "@/hooks/useAuth";

export default function CadastroFuncoes() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["funcoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("funcoes" as any).select("*").order("codigo");
      if (error) throw error;
      return data;
    },
  });

  const save = async (form: Record<string, string>) => {
    const { error } = await supabase.from("funcoes" as any).insert({
      codigo: form.nome.trim().toUpperCase().slice(0, 20),
      nome: form.nome,
      descricao: form.descricao || null,
      status: form.status,
      criado_por: user?.id,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["funcoes"] });
  };

  const update = async (id: string, form: Record<string, string>) => {
    const { error } = await supabase.from("funcoes" as any).update({
      nome: form.nome,
      descricao: form.descricao || null,
      status: form.status,
      alterado_por: user?.id,
    }).eq("id", id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["funcoes"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("funcoes" as any).delete().eq("id", id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["funcoes"] });
  };

  return (
    <CrudPage
      title="Funções"
      subtitle="Gerencie as funções dos trabalhadores"
      items={items as any}
      loading={isLoading}
      onSave={save}
      onUpdate={update}
      onDelete={remove}
    />
  );
}
