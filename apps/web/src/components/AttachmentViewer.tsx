import { useEffect, useState } from 'react';
import {
  downloadFile,
  fetchAuthenticatedBlobUrl,
  formatFileSize,
  isImageMimeType,
} from '../lib/api.ts';

export function AttachmentViewer({
  externalUrl,
  attachmentName,
  attachmentMime,
  attachmentSize,
  downloadPath,
  linkLabel = 'Buka tautan referensi',
  compact = false,
}: {
  externalUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  downloadPath?: string | null;
  linkLabel?: string;
  compact?: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const isImage = Boolean(attachmentName && downloadPath && isImageMimeType(attachmentMime));

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setPreviewUrl(null);
    setPreviewError(false);

    if (!isImage || !downloadPath) {
      return () => {};
    }

    const separator = downloadPath.includes('?') ? '&' : '?';
    void fetchAuthenticatedBlobUrl(`${downloadPath}${separator}inline=1`)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPreviewUrl(url);
      })
      .catch(() => {
        if (active) setPreviewError(true);
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [isImage, downloadPath]);

  useEffect(() => {
    if (!zoomOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setZoomOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomOpen]);

  if (!externalUrl && !attachmentName) return null;

  async function handleDownload() {
    if (!downloadPath || !attachmentName) return;
    setBusy(true);
    setDownloadError('');
    try {
      await downloadFile(downloadPath, attachmentName);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Gagal mengunduh lampiran.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? 'attachment-bundle compact' : 'attachment-bundle'}>
      {externalUrl && (
        <p className="workspace-link-row">
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="workspace-external-link"
          >
            {linkLabel}
          </a>
        </p>
      )}

      {attachmentName && downloadPath && (
        <>
          {isImage && previewUrl && !previewError && (
            <figure className="attachment-image-figure">
              <button
                type="button"
                className="attachment-image-trigger"
                onClick={() => setZoomOpen(true)}
                aria-label={`Perbesar gambar ${attachmentName}`}
              >
                <img
                  src={previewUrl}
                  alt={attachmentName}
                  className="attachment-image-preview"
                />
              </button>
              <figcaption className="attachment-image-caption">
                <span>
                  {attachmentName}
                  {attachmentSize ? ` (${formatFileSize(attachmentSize)})` : ''}
                </span>
                <div className="workspace-item-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setZoomOpen(true)}
                  >
                    Perbesar
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => void handleDownload()}
                  >
                    {busy ? 'Mengunduh…' : 'Unduh'}
                  </button>
                </div>
              </figcaption>
            </figure>
          )}

          {(!isImage || previewError || !previewUrl) && (
            <div className="workspace-attachment-row">
              <span>
                {attachmentName}
                {attachmentSize ? ` (${formatFileSize(attachmentSize)})` : ''}
              </span>
              <button
                type="button"
                className="button secondary inline-btn"
                disabled={busy}
                onClick={() => void handleDownload()}
              >
                {busy ? 'Mengunduh…' : 'Unduh'}
              </button>
            </div>
          )}
        </>
      )}

      {downloadError && (
        <p className="workspace-muted" role="status">
          {downloadError}
        </p>
      )}

      {zoomOpen && previewUrl && (
        <div
          className="answer-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setZoomOpen(false);
          }}
        >
          <div className="answer-modal-dialog" role="dialog" aria-modal="true" aria-label={attachmentName ?? 'Pratinjau Gambar'}>
            <div className="answer-modal-header">
              <div>
                <h4>{attachmentName}</h4>
                {attachmentSize ? (
                  <p className="answer-modal-meta">{formatFileSize(attachmentSize)}</p>
                ) : null}
              </div>
              <div className="workspace-item-actions">
                <button
                  type="button"
                  className="button secondary inline-btn"
                  onClick={() => void handleDownload()}
                >
                  Unduh
                </button>
                <button
                  type="button"
                  className="button primary inline-btn"
                  onClick={() => setZoomOpen(false)}
                >
                  Tutup
                </button>
              </div>
            </div>
            <div className="answer-modal-body attachment-lightbox-body">
              <img src={previewUrl} alt={attachmentName ?? 'Lampiran gambar'} className="attachment-lightbox-img" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
