import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import CrudPage, { type CrudField } from "@/components/CrudPage";

export default function CadastroFuncoes() {
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["funcoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("funcoes").select("*, especialidades(nome)").order("codigo");
      if (error) throw error;
      return data;
    },
  });

  const { data: especialidades = [] } = useQuery({
    queryKey: ["especialidades", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("especialidades").select("id, nome").eq("status", "Ativo").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const extraFields: CrudField[] = [
    {
      key: "especialidade_id",
      label: "Especialidade",
      type: "select",
      options: [
        { value: "__none__", label: "Nenhuma" },
        ...especialidades.map((e) => ({ value: e.id, label: e.nome })),
      ],
      placeholder: "Selecione a especialidade...",
    },
  ];

  // Map items to show specialty name in table
  const mappedItems = items.map((item: any) => ({
    ...item,
    especialidade_id: item.especialidade_id || "",
    especialidade_nome: (item.especialidades as any)?.nome || "—",
  }));

  const save = async (form: Record<string, string>) => {
    const { error } = await supabase.from("funcoes").insert({
      codigo: form.nome.trim().toUpperCase().slice(0, 20),
      nome: form.nome,
      descricao: form.descricao || null,
      status: form.status,
      especialidade_id: form.especialidade_id && form.especialidade_id !== "__none__" ? form.especialidade_id : null,
      criado_por: null,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["funcoes"] });
  };

  const update = async (id: string, form: Record<string, string>) => {
    const { error } = await supabase.from("funcoes").update({
      nome: form.nome,
      descricao: form.descricao || null,
      status: form.status,
      especialidade_id: form.especialidade_id && form.especialidade_id !== "__none__" ? form.especialidade_id : null,
      alterado_por: null,
    }).eq("id", id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["funcoes"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("funcoes").delete().eq("id", id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["funcoes"] });
  };

  return (
    <CrudPage
      title="Funções"
      subtitle="Gerencie as funções dos trabalhadores"
      items={mappedItems as any}
      loading={isLoading}
      extraFields={extraFields}
      onSave={save}
      onUpdate={update}
      onDelete={remove}
    />
  );
}
