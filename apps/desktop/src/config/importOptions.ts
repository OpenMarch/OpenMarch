export type ImportConfig = {
    ocr: {
        enabled: boolean;
        dpi: number; // rasterization scale proxy
        minConfidence: number; // 0..1, warn below
    };
    gating: {
        blockOnMissingCritical: boolean;
        blockOnSetMismatch: boolean;
    };
};

export const defaultImportConfig: ImportConfig = {
    ocr: {
        enabled: true,
        dpi: 300,
        minConfidence: 0.5,
    },
    gating: {
        blockOnMissingCritical: true,
        blockOnSetMismatch: true,
    },
};
