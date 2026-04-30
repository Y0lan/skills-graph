import crypto from 'crypto';

export interface IntakeCanonicalFile {
    field: string;
    buffer: Buffer;
    mimetype: string;
}

function normalizeValue(value: unknown): unknown {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length === 0 ? undefined : trimmed;
    }
    if (Array.isArray(value)) {
        const normalized = value
            .map(normalizeValue)
            .filter((item) => item !== undefined);
        return normalized.length === 0 ? undefined : normalized;
    }
    if (value && typeof value === 'object') {
        return normalizeObject(value as Record<string, unknown>);
    }
    return value;
}

function normalizeObject(input: Record<string, unknown>): Record<string, unknown> | undefined {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
        if (key === 'payload_sha256') {
            continue;
        }
        const canonicalKey = key === 'submission_id' ? 'submission_uuid' : key;
        const normalized = normalizeValue(input[key]);
        if (normalized !== undefined) {
            out[canonicalKey] = normalized;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeSubmissionUuid(fields: Record<string, unknown>): string | null {
    const fromUuid = typeof fields.submission_uuid === 'string' ? fields.submission_uuid.trim() : '';
    const fromLegacy = typeof fields.submission_id === 'string' ? fields.submission_id.trim() : '';
    if (fromUuid && fromLegacy && fromUuid !== fromLegacy) {
        throw new Error('submission_uuid and submission_id do not match');
    }
    return fromUuid || fromLegacy || null;
}

export function hashIntakePayload(fields: Record<string, unknown>, files: IntakeCanonicalFile[]): string {
    const normalizedFields = normalizeObject(fields) ?? {};
    const normalizedFiles = files
        .filter((file) => file.buffer.length > 0)
        .map((file) => ({
            field: file.field,
            mimetype: file.mimetype,
            sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
            size: file.buffer.byteLength,
        }))
        .sort((a, b) => a.field.localeCompare(b.field) || a.sha256.localeCompare(b.sha256));
    const canonical = JSON.stringify({
        fields: normalizedFields,
        files: normalizedFiles,
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
}
