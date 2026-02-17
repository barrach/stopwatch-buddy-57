
-- Trigger function to set criado_por on insert
CREATE OR REPLACE FUNCTION public.set_criado_por()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.criado_por = auth.uid();
  NEW.alterado_por = auth.uid();
  RETURN NEW;
END;
$$;

-- Trigger function to set alterado_por on update
CREATE OR REPLACE FUNCTION public.set_alterado_por()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.alterado_por = auth.uid();
  NEW.alterado_em = now();
  RETURN NEW;
END;
$$;

-- Apply triggers to observacoes
CREATE TRIGGER trg_observacoes_criado_por
  BEFORE INSERT ON public.observacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_criado_por();

CREATE TRIGGER trg_observacoes_alterado_por
  BEFORE UPDATE ON public.observacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_alterado_por();

-- Apply triggers to rotas
CREATE TRIGGER trg_rotas_criado_por
  BEFORE INSERT ON public.rotas
  FOR EACH ROW EXECUTE FUNCTION public.set_criado_por();

CREATE TRIGGER trg_rotas_alterado_por
  BEFORE UPDATE ON public.rotas
  FOR EACH ROW EXECUTE FUNCTION public.set_alterado_por();

-- Apply triggers to obras
CREATE TRIGGER trg_obras_criado_por
  BEFORE INSERT ON public.obras
  FOR EACH ROW EXECUTE FUNCTION public.set_criado_por();

CREATE TRIGGER trg_obras_alterado_por
  BEFORE UPDATE ON public.obras
  FOR EACH ROW EXECUTE FUNCTION public.set_alterado_por();

-- Apply triggers to especialidades
CREATE TRIGGER trg_especialidades_criado_por
  BEFORE INSERT ON public.especialidades
  FOR EACH ROW EXECUTE FUNCTION public.set_criado_por();

CREATE TRIGGER trg_especialidades_alterado_por
  BEFORE UPDATE ON public.especialidades
  FOR EACH ROW EXECUTE FUNCTION public.set_alterado_por();

-- Apply triggers to categorias_observacao
CREATE TRIGGER trg_categorias_criado_por
  BEFORE INSERT ON public.categorias_observacao
  FOR EACH ROW EXECUTE FUNCTION public.set_criado_por();

CREATE TRIGGER trg_categorias_alterado_por
  BEFORE UPDATE ON public.categorias_observacao
  FOR EACH ROW EXECUTE FUNCTION public.set_alterado_por();

-- Apply triggers to contratos
CREATE TRIGGER trg_contratos_criado_por
  BEFORE INSERT ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.set_criado_por();

CREATE TRIGGER trg_contratos_alterado_por
  BEFORE UPDATE ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.set_alterado_por();
