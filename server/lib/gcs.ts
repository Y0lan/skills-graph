import { Storage } from '@google-cloud/storage';
// Lazy singleton — avoids initialisation cost when GCS is not used (e.g. local dev)
let _storage: Storage | null = null;
function getStorage(): Storage {
    if (!_storage) {
        _storage = new Storage();
    }
    return _storage;
}
export const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET;
export const DOCUMENTS_PREFIX = process.env.DOCUMENTS_PREFIX || 'documents';

function getDocumentsBucket(): string {
    if (!DOCUMENTS_BUCKET) {
        throw new Error('DOCUMENTS_BUCKET is required for document storage');
    }
    return DOCUMENTS_BUCKET;
}
/**
 * Upload a buffer to GCS.
 * Returns the full GCS path stored in DB: `gs://bucket/prefix/candidatureId/filename`
 */
export async function uploadToGcs(candidatureId: string, uniqueFilename: string, buffer: Buffer, contentType: string, originalFilename: string): Promise<string> {
    const gcsPath = `${DOCUMENTS_PREFIX}/${candidatureId}/${uniqueFilename}`;
    const bucket = getDocumentsBucket();
    await getStorage()
        .bucket(bucket)
        .file(gcsPath)
        .save(buffer, {
        contentType,
        metadata: { originalFilename },
    });
    return `gs://${bucket}/${gcsPath}`;
}
/**
 * Download a file from GCS into memory.
 * `storedPath` is the full `gs://bucket/path` value from the DB.
 */
export async function downloadFromGcs(storedPath: string): Promise<Buffer> {
    const { bucket, filePath } = parseGcsPath(storedPath);
    const [buffer] = await getStorage().bucket(bucket).file(filePath).download();
    return Buffer.from(buffer);
}
/**
 * Download a file from GCS to a local temp path (for scanning, etc.).
 * Caller is responsible for cleanup.
 */
export async function downloadToTempFile(storedPath: string): Promise<string> {
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');
    const crypto = await import('crypto');
    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `gcs-${crypto.randomUUID()}`);
    const buffer = await downloadFromGcs(storedPath);
    fs.writeFileSync(tmpPath, buffer);
    return tmpPath;
}
/**
 * Check if a stored path is a GCS path (starts with gs://)
 */
export function isGcsPath(storedPath: string): boolean {
    return storedPath.startsWith('gs://');
}
/**
 * Parse a `gs://bucket/path/to/file` string into its components.
 */
function parseGcsPath(storedPath: string): {
    bucket: string;
    filePath: string;
} {
    // gs://bucket-name/prefix/candidatureId/filename
    const withoutScheme = storedPath.slice('gs://'.length);
    const slashIdx = withoutScheme.indexOf('/');
    if (slashIdx === -1) {
        throw new Error(`Invalid GCS path (no file path): ${storedPath}`);
    }
    return {
        bucket: withoutScheme.slice(0, slashIdx),
        filePath: withoutScheme.slice(slashIdx + 1),
    };
}
