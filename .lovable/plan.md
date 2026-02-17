

# Plano: Integrar Observacoes com Banco de Dados

## Problema Identificado

Existem 3 desconexoes no app:

1. **Nova Observacao** -- o formulario apenas exibe um toast ao salvar; nao grava dados em lugar nenhum.
2. **Dashboard e Registros** -- leem dados mock em memoria (`MOCK_RECORDS`), nao do banco de dados.
3. **Selects do formulario** -- usam listas fixas do `mockData.ts` (ex.: `SPECIALTIES`, `ROUTES`) em vez de buscar das tabelas ja criadas no banco (`rotas`, `especialidades`, `categorias_observacao`).
4. **Cadastros CRUD** -- funcionam corretamente com o banco, porem os dados cadastrados nao alimentam o formulario nem o dashboard.

---

## O Que Sera Feito

### 1. Criar tabela `observacoes` no banco de dados

Nova tabela para persistir as observacoes de produtividade:

| Coluna | Tipo | Obrigatorio |
|---|---|---|
| id | uuid (PK) | Sim |
| data | date | Sim |
| horario | text | Sim |
| rota_id | uuid (FK -> rotas) | Sim |
| especialidade_id | uuid (FK -> especialidades) | Sim |
| categoria_id | uuid (FK -> categorias_observacao) | Sim |
| obra_id | uuid (FK -> obras) | Sim |
| contrato_id | uuid (FK -> contratos) | Nao |
| empresa | text | Sim |
| descricao | text | Sim |
| quantidade | integer | Sim |
| notas | text | Nao |
| criado_por | uuid | Nao |
| criado_em | timestamptz | Sim (default now()) |
| alterado_por | uuid | Nao |
| alterado_em | timestamptz | Sim (default now()) |

RLS: usuarios autenticados podem ler/inserir/atualizar/excluir.
Trigger `update_alterado_em` sera adicionado.

### 2. Atualizar formulario "Nova Observacao"

- Substituir selects fixos por consultas ao banco:
  - **Rota** -> buscar de `rotas` (status = Ativo)
  - **Especialidade** -> buscar de `especialidades` (status = Ativo)
  - **Categoria** -> buscar de `categorias_observacao` (status = Ativo)
  - **Obra** -> buscar de `obras` (status = Ativo)
  - **Contrato** -> buscar de `contratos` filtrado pela obra selecionada
- Ao salvar, inserir registro na tabela `observacoes` via Supabase
- Adicionar campo **Contrato** (filtrado por obra selecionada)

### 3. Atualizar pagina "Registros"

- Substituir `useRecords()` (mock) por query ao banco `observacoes` com joins para exibir nomes de rota, especialidade, categoria e obra
- Manter filtros e funcionalidade de exclusao, agora operando no banco
- Buscar listas de filtros (obras, especialidades) do banco

### 4. Atualizar Dashboard

- Substituir dados mock por queries ao banco `observacoes`
- Recalcular agregacoes (por categoria, especialidade, rota, horario) a partir dos dados reais
- Filtro de obra buscado do banco

### 5. Remover dependencia de dados mock

- O arquivo `mockData.ts` deixara de ser a fonte de dados para observacoes
- Tipos e constantes reutilizaveis (ex.: `TIME_SLOTS`, `COMPANIES`) permanecem por conveniencia

---

## Secao Tecnica

### Migracao SQL

```text
CREATE TABLE public.observacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  horario text NOT NULL,
  rota_id uuid NOT NULL REFERENCES rotas(id),
  especialidade_id uuid NOT NULL REFERENCES especialidades(id),
  categoria_id uuid NOT NULL REFERENCES categorias_observacao(id),
  obra_id uuid NOT NULL REFERENCES obras(id),
  contrato_id uuid REFERENCES contratos(id),
  empresa text NOT NULL DEFAULT 'UNIPAR',
  descricao text NOT NULL,
  quantidade integer NOT NULL DEFAULT 1,
  notas text,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  alterado_por uuid,
  alterado_em timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE observacoes ENABLE ROW LEVEL SECURITY;
-- Politicas para authenticated (SELECT, INSERT, UPDATE, DELETE)

-- Trigger de auditoria
CREATE TRIGGER update_observacoes_alterado_em
  BEFORE UPDATE ON observacoes
  FOR EACH ROW EXECUTE FUNCTION update_alterado_em();
```

### Arquivos que serao modificados

- `src/pages/NewObservation.tsx` -- queries para buscar dimensoes do banco + insert no submit
- `src/pages/Records.tsx` -- query `observacoes` com joins, remover `useRecords`
- `src/pages/Dashboard.tsx` -- query `observacoes` com joins, remover `useRecords`
- `src/hooks/useRecords.ts` -- sera removido (substituido por queries diretas)

### Arquivos que serao mantidos

- `src/data/mockData.ts` -- tipos e constantes auxiliares permanecem
- Todas as paginas de CRUD -- ja funcionam corretamente

### Padrao de consulta (React Query + Supabase)

Todas as paginas usarao `useQuery` do TanStack React Query para buscar dados e `useMutation` para salvar, com `invalidateQueries` para manter cache atualizado (mesmo padrao ja usado nos CRUDs).

