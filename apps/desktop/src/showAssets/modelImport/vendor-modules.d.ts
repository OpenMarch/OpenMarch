// cspell:words Emscripten's
// Types for modules that ship none: gltf-validator (from the parked pipeline on
// archive/pre-convergence), and the Draco decoder `vite.modelImport.mjs` serves.
declare module "gltf-validator" {
    export interface ValidatorMessage {
        code: string;
        message: string;
        /** 0 error, 1 warning, 2 info, 3 hint. */
        severity: number;
        pointer?: string;
        offset?: number;
    }

    export interface ValidatorReport {
        issues: {
            numErrors: number;
            numWarnings: number;
            numInfos: number;
            numHints: number;
            messages: ValidatorMessage[];
            truncated: boolean;
        };
        info?: {
            version?: string;
            generator?: string;
            extensionsUsed?: string[];
            extensionsRequired?: string[];
            hasSkins?: boolean;
            totalTriangleCount?: number;
            maxInfluences?: number;
        };
    }

    export interface ValidationOptions {
        uri?: string;
        format?: "glb" | "gltf";
        externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
        writeTimestamp?: boolean;
        maxIssues?: number;
        ignoredIssues?: string[];
        severityOverrides?: Record<string, number>;
    }

    export function validateBytes(
        data: Uint8Array,
        options?: ValidationOptions,
    ): Promise<ValidatorReport>;

    export function version(): string;
}

declare module "virtual:openmarch/draco-decoder" {
    /** Emscripten's module factory for three's web build of the Draco decoder */
    const createDecoderModule: (options: {
        wasmBinary: Uint8Array;
    }) => Promise<unknown>;
    export default createDecoderModule;
    /** The decoder's WebAssembly, inlined */
    export const wasmBinary: Uint8Array;
}
