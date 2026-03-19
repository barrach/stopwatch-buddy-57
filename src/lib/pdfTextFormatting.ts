import jsPDF from "jspdf";

export type RGB = [number, number, number];
export const PDF_OCEAN_RGB: RGB = [31, 78, 121];

export interface StyledPdfLine {
  prefix?: string;
  lines: string[];
}

const LABEL_LINE_RE = /^((?:\d+[ªº°.]?\s*)?(?:[A-ZÀ-Ú][A-Za-zÀ-ú0-9]+(?:\s+[A-ZÀ-Úa-zà-ú0-9]+){0,6})\s*:)\s*(.*)$/;

const BROKEN_LABEL_REPAIRS: Array<[RegExp, string]> = [
  [/Interpreta[çc][ãa]o\s*\n\s*operacional:/gi, "Interpretação operacional:"],
  [/A[çc][ãa]o\s*\n\s*recomendada:/gi, "Ação recomendada:"],
  [/N[ãa]o\s*\n\s*Produtivo\s*Externo:/gi, "Não Produtivo Externo:"],
  [/N[ãa]o\s*\n\s*Produtivo:/gi, "Não Produtivo:"],
  [/Especialidade\s*\n\s*cr[ií]tica:/gi, "Especialidade crítica:"],
  [/Especialidade\s*\n\s*intermedi[aá]ria:/gi, "Especialidade intermediária:"],
  [/Melhor\s*\n\s*especialidade:/gi, "Melhor especialidade:"],
  [/Recomenda[çc][õo]es:/gi, "Recomendações:"],
  [/(\d+[ªº°.]?)\s*\n\s*([A-ZÀ-Ú][A-Za-zÀ-ú0-9]+(?:\s+[A-ZÀ-Úa-zà-ú0-9]+){0,4}:)/g, "$1 $2"],
  [/([A-ZÀ-Úa-zà-ú0-9]+)\s*\n\s*([A-ZÀ-Ú][A-Za-zÀ-ú0-9]+(?:\s+[A-ZÀ-Úa-zà-ú0-9]+){0,3}:)/g, "$1 $2"],
];

function repairBrokenLabels(text: string): string {
  let current = text;
  let previous = "";

  while (current !== previous) {
    previous = current;
    for (const [pattern, replacement] of BROKEN_LABEL_REPAIRS) {
      current = current.replace(pattern, replacement);
    }
  }

  return current;
}

export function wrapTextByWords(doc: jsPDF, text: string, maxWidth: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || doc.getTextWidth(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

export function normalizePdfParagraphs(text: string): string[] {
  let normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\s*\|\s*/g, "\n")
    .trim();

  normalized = repairBrokenLabels(normalized)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ");

  const rawLines = normalized.split("\n").map((line) => line.replace(/\s+/g, " ").trim());
  const paragraphs: string[] = [];
  let current = "";

  for (const line of rawLines) {
    if (!line) {
      if (current) paragraphs.push(current.trim());
      current = "";
      continue;
    }

    const startsLabeledBlock = LABEL_LINE_RE.test(line);
    if (startsLabeledBlock && current) {
      paragraphs.push(current.trim());
      current = line;
    } else {
      current = current ? `${current} ${line}` : line;
    }
  }

  if (current) paragraphs.push(current.trim());
  return paragraphs;
}

export function buildStyledPdfLines(doc: jsPDF, text: string, maxWidth: number): StyledPdfLine[] {
  return normalizePdfParagraphs(text).map((paragraph) => {
    const match = paragraph.match(LABEL_LINE_RE);
    if (!match) {
      return { lines: wrapTextByWords(doc, paragraph, maxWidth) };
    }

    const prefix = match[1].replace(/\s+/g, " ").trim();
    const body = (match[2] || "").replace(/\s+/g, " ").trim();
    const firstLineWidth = maxWidth - doc.getTextWidth(prefix) - 1.5;

    if (!body) {
      return { prefix, lines: [""] };
    }

    if (firstLineWidth < 24) {
      return { prefix, lines: ["", ...wrapTextByWords(doc, body, maxWidth)] };
    }

    const firstPass = wrapTextByWords(doc, body, firstLineWidth);
    const firstLine = firstPass[0] || "";
    const remaining = firstPass.slice(1).join(" ");

    return {
      prefix,
      lines: [firstLine, ...wrapTextByWords(doc, remaining, maxWidth)],
    };
  });
}

export function countStyledPdfLines(blocks: StyledPdfLine[]): number {
  return blocks.reduce((total, block) => total + Math.max(1, block.lines.length || 0), 0);
}
