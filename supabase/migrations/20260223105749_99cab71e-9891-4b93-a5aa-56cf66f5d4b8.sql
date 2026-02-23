
-- Create funcoes dimension table
CREATE TABLE public.funcoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'Ativo',
  criado_por UUID,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  alterado_por UUID,
  alterado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.funcoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read funcoes" ON public.funcoes FOR SELECT USING (true);
CREATE POLICY "Authenticated insert funcoes" ON public.funcoes FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated update funcoes" ON public.funcoes FOR UPDATE USING (true);
CREATE POLICY "Authenticated delete funcoes" ON public.funcoes FOR DELETE USING (true);

-- Add funcao_id to observacoes (nullable for backward compat)
ALTER TABLE public.observacoes ADD COLUMN funcao_id UUID REFERENCES public.funcoes(id);
