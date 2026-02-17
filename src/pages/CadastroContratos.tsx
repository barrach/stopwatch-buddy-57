import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import CrudPage, { type CrudField } from "@/components/CrudPage";
import { useAuth } from "@/hooks/useAuth";

export default function CadastroContratos() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: obras = [] } = useQuery({
    queryKey: ["obras"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id, codigo, nome").eq("status", "Ativo").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["contratos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contratos").select("*, obras(nome)").order("codigo");
      if (error) throw error;
      return data.map((c: any) => ({ ...c, obra_nome: c.obras?.nome || "—" }));
    },
  });

  const extraFields: CrudField[] = [
    {
      key: "obra_id",
      label: "Obra",
      type: "select",
      required: true,
      options: obras.map((o: any) => ({ value: o.id, label: `${o.codigo} — ${o.nome}` })),
      placeholder: "Selecione a obra...",
    },
  ];

  const save = async (form: Record<string, string>) => {
    if (!form.obra_id) throw new Error("Obra é obrigatória.");
    const { error } = await supabase.from("contratos").insert({
      codigo: form.codigo, nome: form.nome, descricao: form.descricao || null, status: form.status, obra_id: form.obra_id, criado_por: user?.id,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["contratos"] });
  };

  const update = async (id: string, form: Record<string, string>) => {
    const updateData: any = { nome: form.nome, descricao: form.descricao || null, status: form.status, alterado_por: user?.id };
    if (form.obra_id) updateData.obra_id = form.obra_id;
    const { error } = await supabase.from("contratos").update(updateData).eq("id", id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["contratos"] });
  };

  return (
    <CrudPage
      title="Contratos"
      subtitle="Gerencie os contratos vinculados às obras"
      items={items as any}
      loading={isLoading}
      extraFields={extraFields}
      onSave={save}
      onUpdate={update}
    />
  );
}
