-- Ajusta a observação dinâmica para a fórmula HH exata solicitada
-- HH_total_dia = soma(qtd_original * duração) de TODOS os registros do dia+obra
-- total_amostras_dia = soma(qtd_original) de TODOS os registros do dia+obra
-- nova_quantidade = (HH_registro / HH_total_dia) * total_amostras_dia

CREATE OR REPLACE FUNCTION public.recalculate_dynamic_observations(
  p_date date,
  p_obra_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hh_total numeric := 0;
  total_amostras_dia numeric := 0;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN;
  END IF;

  UPDATE public.observacoes o
  SET quantidade_base = COALESCE(o.quantidade_base, o.quantidade, 1.00)
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.deleted_at IS NULL;

  SELECT
    COALESCE(SUM(COALESCE(o.quantidade_base, o.quantidade, 1.00) * COALESCE(o.duracao_horas, 1.0)), 0),
    COALESCE(SUM(COALESCE(o.quantidade_base, o.quantidade, 1.00)), 0)
  INTO hh_total, total_amostras_dia
  FROM public.observacoes o
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.deleted_at IS NULL;

  IF hh_total <= 0 OR total_amostras_dia <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.observacoes o
  SET quantidade = GREATEST(
    ROUND(
      ((COALESCE(o.quantidade_base, o.quantidade, 1.00) * COALESCE(o.duracao_horas, 1.0)) / hh_total) * total_amostras_dia,
      2
    ),
    0.01
  )
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.deleted_at IS NULL
    AND o.is_dinamico = true
    AND (
      (o.descricao = 'Aguardando Liberação de PT' AND EXISTS (
        SELECT 1
        FROM public.categorias_observacao c
        WHERE c.id = o.categoria_id
          AND c.nome = 'Suplementar'
      ))
      OR o.descricao IN (
        'Fatores Climáticos e Consequências',
        'Interferências Operacionais'
      )
    );
END;
$function$;