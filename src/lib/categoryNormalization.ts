export const LEGACY_DESCRIPTION_MAP: Record<string, string> = {
  "Aguardando Movimentação de Carga": "Assistindo / Stand By",
  "Aguardando movimentação de carga": "Assistindo / Stand By",
  "Assistindo": "Assistindo / Stand By",
  "Causas Naturais": "Fatores Climáticos e Consequências",
  "Causas Naturais / Clima": "Fatores Climáticos e Consequências",
  "Causas naturais": "Fatores Climáticos e Consequências",
  "Vazamento / Interferência da Planta": "Interferências Operacionais",
  "Vazamento/Interferência": "Interferências Operacionais",
  "Vazamento / Interferência": "Interferências Operacionais",
};

export const HIDDEN_LEGACY_DESCRIPTION_NAMES = new Set(Object.keys(LEGACY_DESCRIPTION_MAP));

export function normalizeDescriptionName(name?: string | null): string {
  if (!name) return "";
  return LEGACY_DESCRIPTION_MAP[name] || name;
}

export function isVisibleDescriptionOption(name?: string | null): boolean {
  if (!name) return false;
  return !HIDDEN_LEGACY_DESCRIPTION_NAMES.has(name);
}

export function normalizeDescriptionOptions<T extends { nome: string }>(items: T[]): Array<T & { nome: string }> {
  const seen = new Set<string>();

  return items
    .filter((item) => isVisibleDescriptionOption(item.nome))
    .map((item) => ({ ...item, nome: normalizeDescriptionName(item.nome) }))
    .filter((item) => {
      if (seen.has(item.nome)) return false;
      seen.add(item.nome);
      return true;
    });
}
