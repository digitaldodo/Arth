import type { StatementParseResult } from './statement-parser';

export type OcrLine = { text: string; confidence: number };
export type OcrCell = { text: string; center: number };

/** Split OCR line text using the alignment gaps preserved between statement columns. */
export function ocrLinesToTable(lines: OcrLine[]): string[][] {
  return lines.map(({ text }) => text.trim().split(/\t+|\s{2,}/).map((cell) => cell.trim())).filter((row) => row.some(Boolean));
}

/** Align sparse OCR cells to the header columns so blank debit/credit fields do not shift values. */
export function alignOcrRows(rows: OcrCell[][]): string[][] {
  const headerWords = /\b(?:date|narration|description|particulars|debit|credit|withdrawal|deposit|balance|reference|utr|amount)\b/i;
  let headerIndex = -1;
  let bestScore = 0;
  for (let index = 0; index < rows.length; index++) {
    const score = rows[index].filter((cell) => headerWords.test(cell.text)).length;
    if (score > bestScore) { headerIndex = index; bestScore = score; }
  }
  if (headerIndex < 0 || bestScore < 2) return rows.map((row) => row.map((cell) => cell.text));
  const header = rows[headerIndex];
  const centers = header.map((cell) => cell.center);
  return rows.map((row, rowIndex) => {
    if (rowIndex === headerIndex) return header.map((cell) => cell.text);
    const aligned = centers.map(() => '');
    for (const cell of row) {
      const target = centers.reduce((closest, center, index) => Math.abs(center - cell.center) < Math.abs(centers[closest] - cell.center) ? index : closest, 0);
      aligned[target] = aligned[target] ? `${aligned[target]} ${cell.text}` : cell.text;
    }
    return aligned;
  });
}

/** OCR is a source hint only: keep every extracted row unselected and visibly reviewable. */
export function requireOcrReview(result: StatementParseResult, confidence: number): StatementParseResult {
  const rounded = Math.max(0, Math.min(100, Math.round(confidence)));
  const detail = `Local OCR confidence ${rounded}%. Verify the date, narration, amount and debit/credit direction against the statement.`;
  return {
    ...result,
    ocrRequired: false,
    ocrConfidence: rounded,
    warnings: [...result.warnings, 'OCR text is not authoritative. Every OCR row is excluded from selection until you review it.', detail],
    rows: result.rows.map((row) => row.state === 'possible_duplicate' ? {
      ...row, selected: false, confidence: rounded >= 85 ? 'medium' : 'low', ocrConfidence: rounded, warning: `${row.warning || 'Possible existing entry.'} ${detail}`,
    } : {
      ...row, state: 'needs_review', selected: false, confidence: rounded >= 85 ? 'medium' : 'low', ocrConfidence: rounded, warning: detail,
    }),
  };
}
