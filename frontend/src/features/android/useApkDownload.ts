'use client';

import { useCallback, useRef, useState } from 'react';

export type ApkDownloadStatus =
  | 'available'
  | 'downloading'
  | 'complete'
  | 'failed'
  | 'unavailable';

export interface UseApkDownloadOptions {
  downloadUrl: string;
  fileName: string;
  available: boolean;
}

export interface ApkDownloadController {
  status: ApkDownloadStatus;
  isDownloading: boolean;
  bytesReceived: number;
  totalBytes: number | null;
  progressPercent: number | null;
  errorMessage: string | null;
  downloadedFileName: string | null;
  startDownload: () => Promise<boolean>;
  resetError: () => void;
}

function parseDispositionFilename(header: string | null, fallback: string): string {
  if (header) {
    const quotedMatch = /filename="([^"]+)"/i.exec(header);
    const bareMatch = /filename=([^;\s]+)/i.exec(header);
    const raw = (quotedMatch?.[1] || bareMatch?.[1] || '').trim();
    if (raw && raw.toLowerCase().endsWith('.apk') && !raw.toLowerCase().endsWith('.json')) {
      return raw;
    }
  }
  return fallback.toLowerCase().endsWith('.apk') ? fallback : 'SpendSense.apk';
}

function isValidApkHeaderBytes(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/**
 * Stateful Android APK download controller.
 * Validates MIME type, Content-Disposition filename, and ZIP/APK magic bytes before
 * saving to disk so an API error or JSON metadata response can never become SpendSense.apk.json.
 */
export function useApkDownload({
  downloadUrl,
  fileName,
  available,
}: UseApkDownloadOptions): ApkDownloadController {
  const [downloadState, setDownloadState] = useState<
    'idle' | 'downloading' | 'complete' | 'failed'
  >('idle');
  const [bytesReceived, setBytesReceived] = useState(0);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadedFileName, setDownloadedFileName] = useState<string | null>(null);
  const activeDownloadRef = useRef(false);

  const status: ApkDownloadStatus = !available
    ? 'unavailable'
    : downloadState === 'idle'
      ? 'available'
      : downloadState;

  const progressPercent =
    totalBytes && totalBytes > 0
      ? Math.min(100, Math.round((bytesReceived / totalBytes) * 100))
      : null;

  const resetError = useCallback(() => {
    if (!activeDownloadRef.current) {
      setErrorMessage(null);
      setDownloadState('idle');
    }
  }, []);

  const startDownload = useCallback(async (): Promise<boolean> => {
    if (!available) {
      setErrorMessage('This Android release package is currently unavailable.');
      return false;
    }

    if (activeDownloadRef.current) {
      return false;
    }

    activeDownloadRef.current = true;
    setDownloadState('downloading');
    setErrorMessage(null);
    setBytesReceived(0);
    setTotalBytes(null);
    setDownloadedFileName(null);

    try {
      const response = await fetch(downloadUrl, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });

      const contentType = (response.headers.get('content-type') || '').toLowerCase();

      if (!response.ok) {
        let serverError = `Could not download ${fileName} (HTTP ${response.status}).`;
        if (contentType.includes('json')) {
          try {
            const data = (await response.json()) as { error?: string };
            if (typeof data.error === 'string' && data.error.trim()) {
              serverError = data.error.trim();
            }
          } catch {
            // Keep default HTTP status message
          }
        }
        setErrorMessage(serverError);
        setDownloadState('failed');
        return false;
      }

      const isAllowedBinaryType =
        contentType.includes('application/vnd.android.package-archive') ||
        contentType.includes('application/octet-stream');

      if (
        !isAllowedBinaryType ||
        contentType.includes('json') ||
        contentType.includes('html') ||
        contentType.includes('text/plain')
      ) {
        setErrorMessage(
          `Server returned unexpected content type (${contentType || 'unknown'}) instead of an Android APK.`
        );
        setDownloadState('failed');
        return false;
      }

      const headerLength = Number(response.headers.get('content-length') || 0);
      if (Number.isFinite(headerLength) && headerLength > 0) {
        setTotalBytes(headerLength);
      }

      const resolvedName = parseDispositionFilename(
        response.headers.get('content-disposition'),
        fileName
      );

      let blob: Blob;
      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks: BlobPart[] = [];
        let received = 0;
        let leadingBytes = new Uint8Array(0);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            chunks.push(value);
            received += value.byteLength;
            setBytesReceived(received);
            if (leadingBytes.byteLength < 4) {
              const combined = new Uint8Array(
                Math.min(4, leadingBytes.byteLength + value.byteLength)
              );
              combined.set(leadingBytes, 0);
              const copyLen = Math.min(4 - leadingBytes.byteLength, value.byteLength);
              combined.set(value.subarray(0, copyLen), leadingBytes.byteLength);
              leadingBytes = combined;
            }
          }
        }

        if (!isValidApkHeaderBytes(leadingBytes)) {
          setErrorMessage('Downloaded payload is not a valid Android APK archive.');
          setDownloadState('failed');
          return false;
        }

        blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
      } else {
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (!isValidApkHeaderBytes(bytes)) {
          setErrorMessage('Downloaded payload is not a valid Android APK archive.');
          setDownloadState('failed');
          return false;
        }
        setBytesReceived(bytes.byteLength);
        blob = new Blob([buffer], { type: 'application/vnd.android.package-archive' });
      }

      if (blob.size <= 0) {
        setErrorMessage('Downloaded APK file was empty.');
        setDownloadState('failed');
        return false;
      }

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = resolvedName;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);

      setDownloadedFileName(resolvedName);
      setDownloadState('complete');
      return true;
    } catch {
      setErrorMessage(
        `Network error while downloading ${fileName}. Check your connection and try again.`
      );
      setDownloadState('failed');
      return false;
    } finally {
      activeDownloadRef.current = false;
    }
  }, [available, downloadUrl, fileName]);

  return {
    status,
    isDownloading: status === 'downloading',
    bytesReceived,
    totalBytes,
    progressPercent,
    errorMessage,
    downloadedFileName,
    startDownload,
    resetError,
  };
}
