
-- Drop all restrictive policies and replace with anon+authenticated access

-- categorias_observacao
DROP POLICY IF EXISTS "Authenticated delete categorias " ON public.categorias_observacao;
DROP POLICY IF EXISTS "Authenticated insert categorias " ON public.categorias_observacao;
DROP POLICY IF EXISTS "Authenticated read categorias " ON public.categorias_observacao;
DROP POLICY IF EXISTS "Authenticated update categorias " ON public.categorias_observacao;
CREATE POLICY "Public read categorias" ON public.categorias_observacao FOR SELECT USING (true);
CREATE POLICY "Public insert categorias" ON public.categorias_observacao FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update categorias" ON public.categorias_observacao FOR UPDATE USING (true);
CREATE POLICY "Public delete categorias" ON public.categorias_observacao FOR DELETE USING (true);

-- contratos
DROP POLICY IF EXISTS "Authenticated delete contratos " ON public.contratos;
DROP POLICY IF EXISTS "Authenticated insert contratos " ON public.contratos;
DROP POLICY IF EXISTS "Authenticated read contratos " ON public.contratos;
DROP POLICY IF EXISTS "Authenticated update contratos " ON public.contratos;
CREATE POLICY "Public read contratos" ON public.contratos FOR SELECT USING (true);
CREATE POLICY "Public insert contratos" ON public.contratos FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update contratos" ON public.contratos FOR UPDATE USING (true);
CREATE POLICY "Public delete contratos" ON public.contratos FOR DELETE USING (true);

-- especialidades
DROP POLICY IF EXISTS "Authenticated delete especialidades " ON public.especialidades;
DROP POLICY IF EXISTS "Authenticated insert especialidades " ON public.especialidades;
DROP POLICY IF EXISTS "Authenticated read especialidades " ON public.especialidades;
DROP POLICY IF EXISTS "Authenticated update especialidades " ON public.especialidades;
CREATE POLICY "Public read especialidades" ON public.especialidades FOR SELECT USING (true);
CREATE POLICY "Public insert especialidades" ON public.especialidades FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update especialidades" ON public.especialidades FOR UPDATE USING (true);
CREATE POLICY "Public delete especialidades" ON public.especialidades FOR DELETE USING (true);

-- funcoes
DROP POLICY IF EXISTS "Authenticated delete funcoes " ON public.funcoes;
DROP POLICY IF EXISTS "Authenticated insert funcoes " ON public.funcoes;
DROP POLICY IF EXISTS "Authenticated read funcoes " ON public.funcoes;
DROP POLICY IF EXISTS "Authenticated update funcoes " ON public.funcoes;
CREATE POLICY "Public read funcoes" ON public.funcoes FOR SELECT USING (true);
CREATE POLICY "Public insert funcoes" ON public.funcoes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update funcoes" ON public.funcoes FOR UPDATE USING (true);
CREATE POLICY "Public delete funcoes" ON public.funcoes FOR DELETE USING (true);

-- obras
DROP POLICY IF EXISTS "Authenticated delete obras " ON public.obras;
DROP POLICY IF EXISTS "Authenticated insert obras " ON public.obras;
DROP POLICY IF EXISTS "Authenticated read obras " ON public.obras;
DROP POLICY IF EXISTS "Authenticated update obras " ON public.obras;
CREATE POLICY "Public read obras" ON public.obras FOR SELECT USING (true);
CREATE POLICY "Public insert obras" ON public.obras FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update obras" ON public.obras FOR UPDATE USING (true);
CREATE POLICY "Public delete obras" ON public.obras FOR DELETE USING (true);

-- observacoes
DROP POLICY IF EXISTS "Authenticated delete observacoes " ON public.observacoes;
DROP POLICY IF EXISTS "Authenticated insert observacoes " ON public.observacoes;
DROP POLICY IF EXISTS "Authenticated read observacoes " ON public.observacoes;
DROP POLICY IF EXISTS "Authenticated update observacoes " ON public.observacoes;
CREATE POLICY "Public read observacoes" ON public.observacoes FOR SELECT USING (true);
CREATE POLICY "Public insert observacoes" ON public.observacoes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update observacoes" ON public.observacoes FOR UPDATE USING (true);
CREATE POLICY "Public delete observacoes" ON public.observacoes FOR DELETE USING (true);

-- rotas
DROP POLICY IF EXISTS "Authenticated delete rotas " ON public.rotas;
DROP POLICY IF EXISTS "Authenticated insert rotas " ON public.rotas;
DROP POLICY IF EXISTS "Authenticated read rotas " ON public.rotas;
DROP POLICY IF EXISTS "Authenticated update rotas " ON public.rotas;
CREATE POLICY "Public read rotas" ON public.rotas FOR SELECT USING (true);
CREATE POLICY "Public insert rotas" ON public.rotas FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update rotas" ON public.rotas FOR UPDATE USING (true);
CREATE POLICY "Public delete rotas" ON public.rotas FOR DELETE USING (true);

-- profiles (make public too)
DROP POLICY IF EXISTS "Admins can delete profiles " ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles " ON public.profiles;
DROP POLICY IF EXISTS "Admins can select profiles " ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles " ON public.profiles;
CREATE POLICY "Public read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Public insert profiles" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update profiles" ON public.profiles FOR UPDATE USING (true);
CREATE POLICY "Public delete profiles" ON public.profiles FOR DELETE USING (true);

-- user_roles (make public too)
DROP POLICY IF EXISTS "Admins can delete roles " ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles " ON public.user_roles;
DROP POLICY IF EXISTS "Admins can select roles " ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles " ON public.user_roles;
CREATE POLICY "Public read roles" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "Public insert roles" ON public.user_roles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update roles" ON public.user_roles FOR UPDATE USING (true);
CREATE POLICY "Public delete roles" ON public.user_roles FOR DELETE USING (true);
