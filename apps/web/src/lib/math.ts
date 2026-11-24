export type MathSegment =
  | { type: 'text'; content: string }
  | { type: 'math'; content: string; display: boolean };

/**
 * Splits prose containing LaTeX delimiters (`$$...$$`, `\[...\]`, `$...$`, `\(...\)`)
 * into safe text and math segments without tripping over escaped `\$` or currency like `$50`.
 */
export function splitMathSegments(input: string): MathSegment[] {
  if (!input) return [];

  const segments: MathSegment[] = [];
  let i = 0;
  let textStart = 0;

  const pushText = (end: number) => {
    if (end > textStart) {
      segments.push({ type: 'text', content: input.slice(textStart, end) });
    }
  };

  while (i < input.length) {
    const ch = input[i];

    // Skip escaped characters like \$
    if (ch === '\\' && i + 1 < input.length) {
      const next = input[i + 1];
      if (next === '(' || next === '[') {
        const closeSeq = next === '(' ? '\\)' : '\\]';
        const display = next === '[';
        const closeIdx = input.indexOf(closeSeq, i + 2);
        if (closeIdx !== -1) {
          const expr = input.slice(i + 2, closeIdx);
          if (expr.trim().length > 0) {
            pushText(i);
            segments.push({ type: 'math', content: expr.trim(), display });
            i = closeIdx + 2;
            textStart = i;
            continue;
          }
        }
      }
      i += 2;
      continue;
    }

    // Block $$...$$
    if (ch === '$' && input[i + 1] === '$') {
      const closeIdx = findClosingDoubleDollar(input, i + 2);
      if (closeIdx !== -1) {
        const expr = input.slice(i + 2, closeIdx);
        if (expr.trim().length > 0) {
          pushText(i);
          segments.push({ type: 'math', content: expr.trim(), display: true });
          i = closeIdx + 2;
          textStart = i;
          continue;
        }
      }
      i += 2;
      continue;
    }

    // Inline $...$
    if (ch === '$') {
      const afterOpen = input[i + 1];
      // Guard against currency "$ 10" or trailing "$" or single-token "$50" with space later
      if (afterOpen && !/\s/.test(afterOpen) && afterOpen !== '$') {
        const closeIdx = findClosingSingleDollar(input, i + 1);
        if (closeIdx !== -1) {
          const expr = input.slice(i + 1, closeIdx);
          if (expr.trim().length > 0) {
            pushText(i);
            segments.push({ type: 'math', content: expr, display: false });
            i = closeIdx + 1;
            textStart = i;
            continue;
          }
        }
      }
    }

    i += 1;
  }

  pushText(input.length);
  return segments;
}

function findClosingDoubleDollar(input: string, fromIndex: number): number {
  let idx = fromIndex;
  while (idx < input.length - 1) {
    if (input[idx] === '\\') {
      idx += 2;
      continue;
    }
    if (input[idx] === '$' && input[idx + 1] === '$') {
      return idx;
    }
    idx += 1;
  }
  return -1;
}

function findClosingSingleDollar(input: string, fromIndex: number): number {
  let idx = fromIndex;
  while (idx < input.length) {
    const ch = input[idx];
    if (ch === '\\') {
      idx += 2;
      continue;
    }
    if (ch === '\n') {
      // Inline $...$ should stay within a paragraph line
      return -1;
    }
    if (ch === '$' && input[idx + 1] !== '$') {
      const beforeClose = input[idx - 1];
      if (beforeClose && !/\s/.test(beforeClose)) {
        return idx;
      }
      return -1;
    }
    idx += 1;
  }
  return -1;
}

export function containsLatexMath(input: string): boolean {
  if (!input) return false;
  return splitMathSegments(input).some((seg) => seg.type === 'math');
}
