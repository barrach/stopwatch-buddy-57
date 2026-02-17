// Mock data and types based on the MEGASTEM productivity measurement spreadsheet

export const SPECIALTIES = [
  "Elétrica",
  "Instrumentação",
  "Mecânica",
  "Caldeiraria",
  "Andaime",
  "Isolamento",
  "Pintura",
  "Civil",
  "Equip./Elevação",
  "Lubrificação",
] as const;

export type Specialty = (typeof SPECIALTIES)[number];

export const OBSERVATION_CATEGORIES = {
  Produtivo: ["Trabalhando", "Planejando"],
  Suplementar: [
    "Aguardando Instruções",
    "Assistindo",
    "Aguardando Ferramenta ou Material",
    "Aguardando Liberação",
    "Transitando no local de trabalho - com ferramenta",
    "Transitando no local de trabalho - sem ferramenta",
    "Transitando fora do local de trabalho - com ferramenta",
    "Transitando fora do local de trabalho - sem ferramenta",
  ],
  "Não Produtivo": ["Pessoal", "Ocioso"],
} as const;

export type ObservationCategory = keyof typeof OBSERVATION_CATEGORIES;

export const ROUTES = ["Rota 1", "Rota 2", "Rota 3", "Rota 4"] as const;
export type Route = (typeof ROUTES)[number];

export const TIME_SLOTS = ["8:00", "9:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"] as const;

export const COMPANIES = ["MEGASTEAM"] as const;
export const OBRAS = ["MEGASTEAM - Cubatão", "MEGASTEAM - Bahia", "MEGASTEAM - Santo André"] as const;
export type Obra = (typeof OBRAS)[number];

export const SAMPLERS = ["Michel Barrach"] as const;

export interface ObservationRecord {
  id: string;
  sampler: string;
  date: string;
  time: string;
  route: Route;
  specialty: Specialty;
  company: string;
  obra: string;
  category: ObservationCategory;
  description: string;
  quantity: number;
  month: string;
  notes?: string;
}

// Mock records based on spreadsheet data
export const MOCK_RECORDS: ObservationRecord[] = [
  { id: "1", sampler: "Michel Barrach", date: "2026-02-13", time: "14:00", route: "Rota 1", specialty: "Caldeiraria", company: "UNIPAR", obra: "UNIPAR - Cubatão", category: "Produtivo", description: "Trabalhando", quantity: 4, month: "2026-02" },
  { id: "2", sampler: "Michel Barrach", date: "2026-02-13", time: "14:00", route: "Rota 1", specialty: "Andaime", company: "UNIPAR", obra: "UNIPAR - Cubatão", category: "Produtivo", description: "Trabalhando", quantity: 13, month: "2026-02" },
  { id: "3", sampler: "Michel Barrach", date: "2026-02-13", time: "14:00", route: "Rota 1", specialty: "Andaime", company: "UNIPAR", obra: "UNIPAR - Cubatão", category: "Suplementar", description: "Aguardando Instruções", quantity: 2, month: "2026-02" },
  { id: "4", sampler: "Michel Barrach", date: "2026-02-13", time: "14:00", route: "Rota 1", specialty: "Elétrica", company: "UNIPAR", obra: "UNIPAR - Cubatão", category: "Suplementar", description: "Transitando no local de trabalho - com ferramenta", quantity: 4, month: "2026-02" },
  { id: "5", sampler: "Michel Barrach", date: "2026-02-13", time: "14:00", route: "Rota 1", specialty: "Caldeiraria", company: "UNIPAR", obra: "UNIPAR - Cubatão", category: "Não Produtivo", description: "Pessoal", quantity: 4, month: "2026-02" },
  { id: "6", sampler: "Michel Barrach", date: "2026-02-14", time: "8:00", route: "Rota 2", specialty: "Mecânica", company: "UNIPAR", obra: "UNIPAR - Bahia", category: "Produtivo", description: "Trabalhando", quantity: 8, month: "2026-02" },
  { id: "7", sampler: "Michel Barrach", date: "2026-02-14", time: "8:00", route: "Rota 2", specialty: "Elétrica", company: "UNIPAR", obra: "UNIPAR - Bahia", category: "Produtivo", description: "Trabalhando", quantity: 6, month: "2026-02" },
  { id: "8", sampler: "Michel Barrach", date: "2026-02-14", time: "9:00", route: "Rota 2", specialty: "Civil", company: "UNIPAR", obra: "UNIPAR - Bahia", category: "Suplementar", description: "Aguardando Ferramenta ou Material", quantity: 3, month: "2026-02" },
  { id: "9", sampler: "Michel Barrach", date: "2026-02-14", time: "10:00", route: "Rota 3", specialty: "Instrumentação", company: "UNIPAR", obra: "UNIPAR - Santo André", category: "Produtivo", description: "Planejando", quantity: 5, month: "2026-02" },
  { id: "10", sampler: "Michel Barrach", date: "2026-02-14", time: "11:00", route: "Rota 3", specialty: "Pintura", company: "UNIPAR", obra: "UNIPAR - Santo André", category: "Não Produtivo", description: "Ocioso", quantity: 2, month: "2026-02" },
  { id: "11", sampler: "Michel Barrach", date: "2026-02-15", time: "13:00", route: "Rota 1", specialty: "Isolamento", company: "UNIPAR", obra: "UNIPAR - Cubatão", category: "Produtivo", description: "Trabalhando", quantity: 7, month: "2026-02" },
  { id: "12", sampler: "Michel Barrach", date: "2026-02-15", time: "14:00", route: "Rota 1", specialty: "Lubrificação", company: "UNIPAR", obra: "UNIPAR - Cubatão", category: "Suplementar", description: "Aguardando Liberação", quantity: 4, month: "2026-02" },
  { id: "13", sampler: "Michel Barrach", date: "2026-02-15", time: "15:00", route: "Rota 4", specialty: "Equip./Elevação", company: "UNIPAR", obra: "UNIPAR - Santo André", category: "Produtivo", description: "Trabalhando", quantity: 10, month: "2026-02" },
  { id: "14", sampler: "Michel Barrach", date: "2026-02-15", time: "16:00", route: "Rota 4", specialty: "Caldeiraria", company: "UNIPAR", obra: "UNIPAR - Cubatão", category: "Suplementar", description: "Assistindo", quantity: 3, month: "2026-02" },
  { id: "15", sampler: "Michel Barrach", date: "2026-02-16", time: "8:00", route: "Rota 2", specialty: "Andaime", company: "UNIPAR", obra: "UNIPAR - Bahia", category: "Não Produtivo", description: "Pessoal", quantity: 2, month: "2026-02" },
];

// Helper to aggregate data
export function aggregateByCategory(records: ObservationRecord[]) {
  const totals: Record<string, number> = {};
  records.forEach((r) => {
    const key = r.description;
    totals[key] = (totals[key] || 0) + r.quantity;
  });
  return Object.entries(totals)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function aggregateBySpecialty(records: ObservationRecord[]) {
  const result: Record<string, { productive: number; supplementary: number; unproductive: number }> = {};
  SPECIALTIES.forEach((s) => (result[s] = { productive: 0, supplementary: 0, unproductive: 0 }));
  records.forEach((r) => {
    if (!result[r.specialty]) return;
    if (r.category === "Produtivo") result[r.specialty].productive += r.quantity;
    else if (r.category === "Suplementar") result[r.specialty].supplementary += r.quantity;
    else result[r.specialty].unproductive += r.quantity;
  });
  return Object.entries(result)
    .filter(([_, v]) => v.productive + v.supplementary + v.unproductive > 0)
    .map(([name, v]) => ({ name, ...v }));
}

export function aggregateByTimeSlot(records: ObservationRecord[]) {
  const result: Record<string, number> = {};
  TIME_SLOTS.forEach((t) => (result[t] = 0));
  records.forEach((r) => {
    if (result[r.time] !== undefined) result[r.time] += r.quantity;
  });
  return Object.entries(result).map(([time, total]) => ({ time, total }));
}

export function aggregateByRoute(records: ObservationRecord[]) {
  const result: Record<string, { productive: number; supplementary: number; unproductive: number }> = {};
  ROUTES.forEach((r) => (result[r] = { productive: 0, supplementary: 0, unproductive: 0 }));
  records.forEach((r) => {
    if (!result[r.route]) return;
    if (r.category === "Produtivo") result[r.route].productive += r.quantity;
    else if (r.category === "Suplementar") result[r.route].supplementary += r.quantity;
    else result[r.route].unproductive += r.quantity;
  });
  return Object.entries(result)
    .filter(([_, v]) => v.productive + v.supplementary + v.unproductive > 0)
    .map(([name, v]) => ({ name, ...v, total: v.productive + v.supplementary + v.unproductive }));
}
