import { useMemo, type ElementType } from 'react';
import katex from 'katex';
import { containsLatexMath, splitMathSegments } from '../lib/math.ts';

function renderKatexHtml(expr: string, displayMode: boolean): string {
  return katex.renderToString(expr, {
    displayMode,
    throwOnError: false,
    strict: 'ignore',
    trust: false,
    output: 'htmlAndMathml',
  });
}

export function MathText({
  text,
  as: Component = 'span',
  className,
}: {
  text: string;
  as?: ElementType;
  className?: string;
}) {
  const segments = useMemo(() => splitMathSegments(text), [text]);

  if (!text) return null;

  return (
    <Component className={className}>
      {segments.map((seg, idx) => {
        if (seg.type === 'text') {
          return <span key={idx}>{seg.content}</span>;
        }
        const html = renderKatexHtml(seg.content, seg.display);
        return (
          <span
            key={idx}
            className={seg.display ? 'math-display-block' : 'math-inline-span'}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </Component>
  );
}

export function MathPreviewBox({
  text,
  title = 'Pratinjau rumus LaTeX',
}: {
  text: string;
  title?: string;
}) {
  if (!containsLatexMath(text)) return null;
  return (
    <div className="math-preview-box" aria-live="polite">
      <span className="math-preview-label">{title}</span>
      <MathText text={text} as="div" className="workspace-body-text" />
    </div>
  );
}
