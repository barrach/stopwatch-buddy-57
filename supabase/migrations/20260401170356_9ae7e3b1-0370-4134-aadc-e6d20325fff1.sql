
ALTER TABLE public.observacoes
  ADD COLUMN IF NOT EXISTS ponderado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hora_real text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS peso_real numeric DEFAULT NULL;
