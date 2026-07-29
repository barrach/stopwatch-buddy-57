CREATE INDEX IF NOT EXISTS idx_observacoes_obra_data_active ON public.observacoes (obra_id, data DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_observacoes_data_active ON public.observacoes (data DESC) WHERE deleted_at IS NULL;
ANALYZE public.observacoes;