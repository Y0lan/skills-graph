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

function normalizeExplicitSingleOrigin(value: string | undefined | null): string | null {
    const normalized = normalizeOrigin(value);
    if (!normalized || normalized === '*' || normalized.includes(','))
        return null;
    try {
        const url = new URL(normalized);
        if ((url.pathname && url.pathname !== '/') || url.search || url.hash)
            return null;
        return url.origin;
    }
    catch {
        return null;
    }
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
    const envOrigin = normalizeExplicitSingleOrigin(process.env.APP_PUBLIC_ORIGIN)
        ?? normalizeExplicitSingleOrigin(process.env.BETTER_AUTH_URL)
        ?? normalizeExplicitSingleOrigin(process.env.CORS_ORIGIN);
    if (envOrigin)
        return envOrigin;
    const host = req?.get('host');
    const requestOrigin = host ? normalizeOrigin(`${req?.protocol ?? 'http'}://${host}`) : null;
    if (requestOrigin && isLocalOrigin(requestOrigin))
        return requestOrigin;
    return LOCAL_FALLBACK_ORIGIN;
}
