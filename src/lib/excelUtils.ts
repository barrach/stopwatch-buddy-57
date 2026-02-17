import * as XLSX from "xlsx";

export interface ExportRow {
  Data: string;
  Horário: string;
  Obra: string;
  Rota: string;
  Especialidade: string;
  Categoria: string;
  Descrição: string;
  Quantidade: number;
  Empresa: string;
  Notas: string;
}

export function exportToExcel(rows: ExportRow[], filename = "observacoes.xlsx") {
  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto-size columns
  const colWidths = Object.keys(rows[0] || {}).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => String((r as any)[key] || "").length)).valueOf() + 2,
  }));
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Observações");
  XLSX.writeFile(wb, filename);
}

export interface ImportRow {
  Data: string;
  "Horário": string;
  Obra: string;
  Rota: string;
  Especialidade: string;
  Categoria: string;
  "Descrição": string;
  Quantidade: number;
  Empresa?: string;
  Notas?: string;
}

const REQUIRED_COLUMNS = ["Data", "Horário", "Obra", "Rota", "Especialidade", "Categoria", "Descrição", "Quantidade"];

export async function parseExcelFile(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<ImportRow>(ws);

        if (json.length === 0) {
          reject(new Error("Planilha vazia."));
          return;
        }

        // Validate columns
        const headers = Object.keys(json[0]);
        const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
        if (missing.length > 0) {
          reject(new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}`));
          return;
        }

        resolve(json);
      } catch (err) {
        reject(new Error("Erro ao ler arquivo Excel."));
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler arquivo."));
    reader.readAsArrayBuffer(file);
  });
}
