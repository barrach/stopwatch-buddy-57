
-- Obras
CREATE TABLE public.obras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo')),
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  alterado_por UUID REFERENCES auth.users(id),
  alterado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rotas
CREATE TABLE public.rotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo')),
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  alterado_por UUID REFERENCES auth.users(id),
  alterado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Especialidades
CREATE TABLE public.especialidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo')),
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  alterado_por UUID REFERENCES auth.users(id),
  alterado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categorias de Observação
CREATE TABLE public.categorias_observacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria_pai_id UUID REFERENCES public.categorias_observacao(id),
  status TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo')),
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  alterado_por UUID REFERENCES auth.users(id),
  alterado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contratos (vinculado à Obra)
CREATE TABLE public.contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  obra_id UUID NOT NULL REFERENCES public.obras(id),
  status TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo')),
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  alterado_por UUID REFERENCES auth.users(id),
  alterado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.update_alterado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.alterado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_obras_alterado_em BEFORE UPDATE ON public.obras FOR EACH ROW EXECUTE FUNCTION public.update_alterado_em();
CREATE TRIGGER update_rotas_alterado_em BEFORE UPDATE ON public.rotas FOR EACH ROW EXECUTE FUNCTION public.update_alterado_em();
CREATE TRIGGER update_especialidades_alterado_em BEFORE UPDATE ON public.especialidades FOR EACH ROW EXECUTE FUNCTION public.update_alterado_em();
CREATE TRIGGER update_categorias_alterado_em BEFORE UPDATE ON public.categorias_observacao FOR EACH ROW EXECUTE FUNCTION public.update_alterado_em();
CREATE TRIGGER update_contratos_alterado_em BEFORE UPDATE ON public.contratos FOR EACH ROW EXECUTE FUNCTION public.update_alterado_em();

-- RLS
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.especialidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias_observacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado pode ler
CREATE POLICY "Authenticated read obras" ON public.obras FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read rotas" ON public.rotas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read especialidades" ON public.especialidades FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read categorias" ON public.categorias_observacao FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read contratos" ON public.contratos FOR SELECT TO authenticated USING (true);

-- Escrita: qualquer autenticado (refinamos com roles depois)
CREATE POLICY "Authenticated insert obras" ON public.obras FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update obras" ON public.obras FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete obras" ON public.obras FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated insert rotas" ON public.rotas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update rotas" ON public.rotas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete rotas" ON public.rotas FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated insert especialidades" ON public.especialidades FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update especialidades" ON public.especialidades FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete especialidades" ON public.especialidades FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated insert categorias" ON public.categorias_observacao FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update categorias" ON public.categorias_observacao FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete categorias" ON public.categorias_observacao FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated insert contratos" ON public.contratos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update contratos" ON public.contratos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete contratos" ON public.contratos FOR DELETE TO authenticated USING (true);
