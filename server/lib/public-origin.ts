type RequestLike = {
    protocol?: string;
    get(name: string): string | undefined;
};

const LOCAL_FALLBACK_ORIGIN = 'http://localhost:5173';

function normalizeOrigin(value: string | undefined | null): string | null {
    const trimmed = value?.trim();
    if (!trimmed)
        return null;
    return trimmed.replace(/\/+$/, '');
}

function isLocalOrigin(origin: string): boolean {
    try {
        const hostname = new URL(origin).hostname.toLowerCase();
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    }
    catch {
        return false;
    }
}

export function resolveAppPublicOrigin(req?: RequestLike): string {
    const envOrigin = normalizeOrigin(process.env.APP_PUBLIC_ORIGIN)
        ?? normalizeOrigin(process.env.BETTER_AUTH_URL)
        ?? normalizeOrigin(process.env.CORS_ORIGIN);
    if (envOrigin)
        return envOrigin;
    const host = req?.get('host');
    const requestOrigin = host ? normalizeOrigin(`${req?.protocol ?? 'http'}://${host}`) : null;
    if (requestOrigin && isLocalOrigin(requestOrigin))
        return requestOrigin;
    return LOCAL_FALLBACK_ORIGIN;
}
