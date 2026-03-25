-- Observação Dinâmica: quantidade = HH real (qtd_original × duração)
-- Sem conversão proporcional — o valor direto em HH

CREATE OR REPLACE FUNCTION public.recalculate_dynamic_observations(
  p_date date,
  p_obra_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN;
  END IF;

  -- Garantir que quantidade_base esteja preenchida
  UPDATE public.observacoes o
  SET quantidade_base = COALESCE(o.quantidade_base, o.quantidade, 1.00)
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.deleted_at IS NULL;

  -- Para registros dinâmicos: quantidade = quantidade_base × duracao_horas (HH real)
  UPDATE public.observacoes o
  SET quantidade = GREATEST(
    ROUND(
      COALESCE(o.quantidade_base, 1.00) * COALESCE(o.duracao_horas, 1.0),
      2
    ),
    0.01
  )
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.deleted_at IS NULL
    AND o.is_dinamico = true
    AND o.descricao IN (
      'Aguardando Liberação de PT',
      'Fatores Climáticos e Consequências',
      'Interferências Operacionais'
    );
END;
$function$;