
-- Add soft delete fields to observacoes
ALTER TABLE public.observacoes 
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_reason text DEFAULT NULL;

-- Index for performance on soft delete filtering
CREATE INDEX IF NOT EXISTS idx_observacoes_deleted_at ON public.observacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_observacoes_obra_id ON public.observacoes(obra_id);
CREATE INDEX IF NOT EXISTS idx_observacoes_especialidade_id ON public.observacoes(especialidade_id);
CREATE INDEX IF NOT EXISTS idx_observacoes_categoria_id ON public.observacoes(categoria_id);
CREATE INDEX IF NOT EXISTS idx_observacoes_criado_em ON public.observacoes(criado_em);
