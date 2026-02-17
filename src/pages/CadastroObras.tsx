import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import CrudPage from "@/components/CrudPage";
import { useAuth } from "@/hooks/useAuth";

export default function CadastroObras() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["obras"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("*").order("codigo");
      if (error) throw error;
      return data;
    },
  });

  const save = async (form: Record<string, string>) => {
    const { error } = await supabase.from("obras").insert({
      codigo: form.nome.trim().toUpperCase().slice(0, 20), nome: form.nome, descricao: form.descricao || null, status: form.status, criado_por: user?.id,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["obras"] });
  };

  const update = async (id: string, form: Record<string, string>) => {
    const { error } = await supabase.from("obras").update({
      nome: form.nome, descricao: form.descricao || null, status: form.status, alterado_por: user?.id,
    }).eq("id", id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["obras"] });
  };

  return (
    <CrudPage title="Obras" subtitle="Gerencie as obras/projetos" items={items as any} loading={isLoading} onSave={save} onUpdate={update} />
  );
}
