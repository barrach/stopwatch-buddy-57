-- Add status and obra_id columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL;

-- Set existing users as 'aprovado' (they were already using the system)
UPDATE public.profiles SET status = 'aprovado';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_obra_id ON public.profiles(obra_id);

-- Update handle_new_user to set status as pendente by default
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, nome, status, obra_id)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    'pendente',
    CASE 
      WHEN NEW.raw_user_meta_data->>'obra_id' IS NOT NULL 
        AND NEW.raw_user_meta_data->>'obra_id' != '' 
      THEN (NEW.raw_user_meta_data->>'obra_id')::uuid 
      ELSE NULL 
    END
  );
  RETURN NEW;
END;
$function$;