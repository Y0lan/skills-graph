declare namespace NodeJS {
    interface ProcessEnv {
        BETTER_AUTH_SECRET?: string;
        BETTER_AUTH_URL?: string;
        APP_PUBLIC_ORIGIN?: string;
        APP_DEV_ORIGIN?: string;
        CORS_ORIGIN?: string;
        SKILL_RADAR_SKIP_BOOTSTRAP_SEED?: string;
        RESEND_API_KEY?: string;
        VIRUSTOTAL_API_KEY?: string;
        CLAMAV_SOCKET?: string;
        CLAMAV_HOST?: string;
        CLAMAV_PORT?: string;
    }
}
declare module 'clamscan' {
    interface ClamScanOptions {
        removeInfected?: boolean;
        quarantineInfected?: boolean | string;
        debugMode?: boolean;
        scanLog?: string | null;
        fileList?: string | null;
        scanRecursively?: boolean;
        clamscan?: {
            active?: boolean;
            path?: string;
            db?: string | null;
            scanArchives?: boolean;
        };
        clamdscan?: {
            socket?: string | null;
            host?: string;
            port?: number;
            timeout?: number;
            active?: boolean;
            path?: string;
        };
    }
    interface ScanResult {
        isInfected: boolean | null;
        file: string;
        viruses: string[];
    }
    class NodeClam {
        init(options?: ClamScanOptions): Promise<NodeClam>;
        isInfected(filePath: string): Promise<ScanResult>;
        scanFile(filePath: string): Promise<ScanResult>;
        ping(): Promise<boolean>;
    }
    export default NodeClam;
}
