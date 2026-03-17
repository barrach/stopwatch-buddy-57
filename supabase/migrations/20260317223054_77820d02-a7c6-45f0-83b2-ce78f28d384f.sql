
CREATE TABLE public.relatorios_salvos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  criado_por UUID NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  titulo TEXT NOT NULL,
  date_mode TEXT NOT NULL DEFAULT 'single',
  data_unica DATE,
  data_inicio DATE,
  data_fim DATE,
  obra_id UUID NOT NULL,
  obra_nome TEXT NOT NULL,
  especialidade_id UUID,
  especialidade_nome TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.relatorios_salvos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read relatorios_salvos" ON public.relatorios_salvos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert relatorios_salvos" ON public.relatorios_salvos FOR INSERT TO authenticated WITH CHECK (auth.uid() = criado_por);
CREATE POLICY "Authenticated delete relatorios_salvos" ON public.relatorios_salvos FOR DELETE TO authenticated USING (auth.uid() = criado_por OR public.has_role(auth.uid(), 'admin'));
