
CREATE TABLE public.observacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  horario text NOT NULL,
  rota_id uuid NOT NULL REFERENCES public.rotas(id),
  especialidade_id uuid NOT NULL REFERENCES public.especialidades(id),
  categoria_id uuid NOT NULL REFERENCES public.categorias_observacao(id),
  obra_id uuid NOT NULL REFERENCES public.obras(id),
  contrato_id uuid REFERENCES public.contratos(id),
  empresa text NOT NULL DEFAULT 'UNIPAR',
  descricao text NOT NULL,
  quantidade integer NOT NULL DEFAULT 1,
  notas text,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  alterado_por uuid,
  alterado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.observacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read observacoes"
  ON public.observacoes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert observacoes"
  ON public.observacoes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update observacoes"
  ON public.observacoes FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated delete observacoes"
  ON public.observacoes FOR DELETE
  TO authenticated
  USING (true);

CREATE TRIGGER update_observacoes_alterado_em
  BEFORE UPDATE ON public.observacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_alterado_em();
