import jsPDF from "jspdf";

export type RGB = [number, number, number];
export const PDF_OCEAN_RGB: RGB = [31, 78, 121];

export interface StyledPdfLine {
  prefix?: string;
  lines: string[];
}

// ── Sanitization ──────────────────────────────────────────────

/** Remove garbled/invalid characters from AI output (cid:X, Ø=Ý, þ, ', etc.) */
function sanitizeText(text: string): string {
  return text
    // Remove (cid:N) sequences (embedded font references)
    .replace(/\(cid:\d+\)/g, "")
    // Remove common garbled sequences from bad encoding
    .replace(/Ø=Ý\d*/g, "")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/þ/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Remove isolated non-printable / control chars but keep accented chars
    .replace(/[^\x20-\x7E\xA0-\xFF\u0100-\u024F\u1E00-\u1EFF\n\r\t]/g, "")
    // Clean up leftover double spaces from removals
    .replace(/ {2,}/g, " ");
}

// ── Label standardization ─────────────────────────────────────

const LABEL_ALIASES: Array<[RegExp, string]> = [
  [/^Diagn[oó]stico\s*:/i, "Diagnóstico:"],
  [/^Interpreta[çc][ãa]o\s*(?:operacional)?\s*:/i, "Interpretação Operacional:"],
  [/^A[çc][ãa]o\s*(?:recomendada)?\s*:/i, "Ação Recomendada:"],
  [/^Recomend[ae]\s*:/i, "Ação Recomendada:"],
  [/^Melhor\s*especialidade\s*:/i, "Melhor especialidade:"],
  [/^Especialidade\s*cr[ií]tica\s*:/i, "Especialidade crítica:"],
  [/^Especialidade\s*intermedi[aá]ria\s*:/i, "Especialidade intermediária:"],
  [/^Recomenda[çc][õo]es\s*:/i, "Recomendações:"],
];

function standardizeLabel(label: string): string {
  for (const [pattern, replacement] of LABEL_ALIASES) {
    if (pattern.test(label)) return replacement;
  }
  return label;
}

// ── Label detection regex ─────────────────────────────────────

const LABEL_LINE_RE = /^((?:\d+[ªº°.]?\s*)?(?:(?:Diagn[oó]stico|Interpreta[çc][ãa]o\s*[Oo]peracional|A[çc][ãa]o\s*[Rr]ecomendada|Recomend[ae]|Melhor\s*especialidade|Especialidade\s*(?:cr[ií]tica|intermedi[aá]ria)|Recomenda[çc][õo]es|[A-ZÀ-Ú][A-Za-zÀ-ú0-9]+(?:\s+[A-ZÀ-Úa-zà-ú0-9]+){0,4}))\s*:)\s*(.*)$/;

// ── Broken label repairs ──────────────────────────────────────

const BROKEN_LABEL_REPAIRS: Array<[RegExp, string]> = [
  [/Interpreta[çc][ãa]o\s*\n\s*[Oo]peracional\s*:/gi, "Interpretação Operacional:"],
  [/A[çc][ãa]o\s*\n\s*[Rr]ecomendada\s*:/gi, "Ação Recomendada:"],
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

// ── Inline list splitting ─────────────────────────────────────

/** Convert inline dash/bullet lists into separate lines:
 *  "- Produtivo: 26% - Suplementar: 18%" → "• Produtivo: 26%\n• Suplementar: 18%"
 */
function splitInlineLists(text: string): string {
  // Match patterns like "- Item: value" or "• Item: value" inline
  return text.replace(
    /\s+-\s+(?=[A-ZÀ-Ú])/g,
    "\n• "
  );
}

// ── Core helpers ──────────────────────────────────────────────

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
  // Step 1: Sanitize
  let normalized = sanitizeText(text)
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\s*\|\s*/g, "\n")
    .trim();

  // Step 2: Repair broken labels
  normalized = repairBrokenLabels(normalized);

  // Step 3: Ensure space after ":" in label-like patterns
  normalized = normalized.replace(/([A-Za-zÀ-ú]):([A-Za-zÀ-ú(])/g, "$1: $2");

  // Step 4: Split inline lists
  normalized = splitInlineLists(normalized);

  // Step 5: Normalize whitespace
  normalized = normalized
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

/**
 * Build styled lines for PDF rendering.
 * When a label (prefix) is detected, the body text is ALWAYS placed on a new line
 * to guarantee visual separation and prevent overlap.
 */
export function buildStyledPdfLines(doc: jsPDF, text: string, maxWidth: number): StyledPdfLine[] {
  return normalizePdfParagraphs(text).map((paragraph) => {
    const match = paragraph.match(LABEL_LINE_RE);
    if (!match) {
      return { lines: wrapTextByWords(doc, paragraph, maxWidth) };
    }

    const rawPrefix = match[1].replace(/\s+/g, " ").trim();
    const prefix = standardizeLabel(rawPrefix);
    const body = (match[2] || "").replace(/\s+/g, " ").trim();

    if (!body) {
      return { prefix, lines: [""] };
    }

    // Always render body on a new line after the label
    return { prefix, lines: ["", ...wrapTextByWords(doc, body, maxWidth)] };
  });
}

export function countStyledPdfLines(blocks: StyledPdfLine[]): number {
  return blocks.reduce((total, block) => total + Math.max(1, block.lines.length || 0), 0);
}
