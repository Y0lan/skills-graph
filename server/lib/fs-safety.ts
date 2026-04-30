import path from 'path';
export function resolveSafePath(baseDir: string, ...segments: string[]): string {
    const resolved = path.resolve(baseDir, ...segments);
    const base = path.resolve(baseDir);
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
        throw new Error('Path traversal attempt blocked');
    }
    return resolved;
}
