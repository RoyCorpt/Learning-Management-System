import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const DEFAULT_ANSWER_PREVIEW_WORDS = 30;

export function truncateAnswerByWords(
  text: string,
  maxWords = DEFAULT_ANSWER_PREVIEW_WORDS,
): { excerpt: string; truncated: boolean; totalWords: number } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { excerpt: '', truncated: false, totalWords: 0 };
  }

  let wordCount = 0;
  let cutEndIndex = trimmed.length;
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = wordRegex.exec(trimmed)) !== null) {
    wordCount += 1;
    if (wordCount === maxWords) {
      cutEndIndex = match.index + match[0].length;
    }
  }

  if (wordCount <= maxWords) {
    return { excerpt: trimmed, truncated: false, totalWords: wordCount };
  }

  return {
    excerpt: `${trimmed.slice(0, cutEndIndex)}…`,
    truncated: true,
    totalWords: wordCount,
  };
}

export function ExpandableAnswerText({
  text,
  maxWords = DEFAULT_ANSWER_PREVIEW_WORDS,
  className = 'workspace-body-text',
  prefixLabel,
  studentName,
  contextLabel,
}: {
  text: string;
  maxWords?: number;
  className?: string;
  prefixLabel?: string;
  studentName?: string;
  contextLabel?: string;
}) {
  const [popupOpen, setPopupOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    setPopupOpen(false);
  }, [text]);

  useEffect(() => {
    if (!popupOpen) return;

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPopupOpen(false);
        triggerRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [popupOpen]);

  const { excerpt, truncated, totalWords } = useMemo(
    () => truncateAnswerByWords(text, maxWords),
    [text, maxWords],
  );

  function closePopup() {
    setPopupOpen(false);
    triggerRef.current?.focus();
  }

  if (!truncated) {
    return (
      <p className={className}>
        {prefixLabel ? (
          <>
            <strong>{prefixLabel}</strong>{' '}
          </>
        ) : null}
        {text}
      </p>
    );
  }

  const dialogTitle = studentName
    ? `Jawaban Lengkap: ${studentName}`
    : 'Jawaban Lengkap Mahasiswa';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="answer-excerpt-toggle"
        aria-haspopup="dialog"
        aria-expanded={popupOpen}
        aria-label={`Lihat selengkapnya (${totalWords} kata)`}
        onClick={() => setPopupOpen(true)}
      >
        <span className={className}>
          {prefixLabel ? (
            <>
              <strong>{prefixLabel}</strong>{' '}
            </>
          ) : null}
          {excerpt}
        </span>
        <span className="answer-excerpt-hint">
          <span>Lihat selengkapnya</span>
          <svg
            className="answer-excerpt-chevron"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 3h6v6" />
            <path d="M9 21H3v-6" />
            <path d="M21 3l-7 7" />
            <path d="M3 21l7-7" />
          </svg>
        </span>
      </button>

      {popupOpen &&
        createPortal(
          <div
            className="answer-modal-backdrop"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closePopup();
              }
            }}
          >
            <div
              className="answer-modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              <div className="answer-modal-header">
                <div>
                  <h4 id={titleId}>{dialogTitle}</h4>
                  <p className="answer-modal-meta">
                    {contextLabel ? `${contextLabel}, ` : ''}
                    <span className="num">{totalWords}</span> kata
                  </p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="button secondary inline-btn"
                  onClick={closePopup}
                >
                  Tutup
                </button>
              </div>
              <div className="answer-modal-body">
                <p className="answer-modal-text">{text}</p>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
