import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import CrudPage, { type CrudField } from "@/components/CrudPage";
import { useAuth } from "@/hooks/useAuth";

export default function CadastroCategorias() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["categorias_observacao"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_observacao").select("*").order("codigo");
      if (error) throw error;
      return data;
    },
  });

  const parentOptions = items
    .filter((i: any) => !i.categoria_pai_id && i.status === "Ativo")
    .map((i: any) => ({ value: i.id, label: `${i.codigo} — ${i.nome}` }));

  const extraFields: CrudField[] = [
    {
      key: "categoria_pai_id",
      label: "Categoria Pai",
      type: "select",
      options: [{ value: "__none__", label: "Nenhuma (raiz)" }, ...parentOptions],
      placeholder: "Selecione...",
    },
  ];

  const save = async (form: Record<string, string>) => {
    const { error } = await supabase.from("categorias_observacao").insert({
      codigo: form.codigo,
      nome: form.nome,
      descricao: form.descricao || null,
      status: form.status,
      categoria_pai_id: form.categoria_pai_id && form.categoria_pai_id !== "__none__" ? form.categoria_pai_id : null,
      criado_por: user?.id,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["categorias_observacao"] });
  };

  const update = async (id: string, form: Record<string, string>) => {
    const { error } = await supabase.from("categorias_observacao").update({
      nome: form.nome,
      descricao: form.descricao || null,
      status: form.status,
      categoria_pai_id: form.categoria_pai_id && form.categoria_pai_id !== "__none__" ? form.categoria_pai_id : null,
      alterado_por: user?.id,
    }).eq("id", id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["categorias_observacao"] });
  };

  return (
    <CrudPage
      title="Categorias de Observação"
      subtitle="Gerencie categorias e subcategorias"
      items={items as any}
      loading={isLoading}
      extraFields={extraFields}
      onSave={save}
      onUpdate={update}
    />
  );
}
