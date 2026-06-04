/**
 * Universal intermediate representation for all import formats.
 * Every importer adapter produces an ImportManifest; all validation,
 * preview, and commit logic works on this shape alone.
 */

export type ImportManifest = {
    source: { format: string; filename: string };
    marchers: ImportMarcher[];
    sets: ImportSet[];
    positions: ImportPosition[];
    timing?: { bpm?: number };
    /** Aggregate parse confidence 0–1 across all positions. */
    confidence?: number;
};

export type ImportMarcher = {
    /** Unique within this import (e.g. "bd-1", "t-3"). */
    key: string;
    drillPrefix: string;
    drillOrder: number;
    label?: string;
    section?: string;
    name?: string;
};

export type ImportSet = {
    setId: string;
    counts: number;
    /** Sequential order in the show. */
    order: number;
    isSubset?: boolean;
};

export type ImportPosition = {
    /** References ImportMarcher.key */
    marcherKey: string;
    /** References ImportSet.setId */
    setId: string;
    /** Steps from center, negative = side 1, positive = side 2 */
    xSteps: number;
    /** Steps from center-front, negative = toward back */
    ySteps: number;
    /** Per-position parse confidence 0–1 */
    confidence?: number;
};

export type ImportIssue = {
    type: "error" | "warning";
    code: string;
    message: string;
    marcherKey?: string;
    setId?: string;
    field?: string;
    confidence?: number;
};

export type ImportValidationReport = {
    issues: ImportIssue[];
    stats: {
        marchers: number;
        sets: number;
        positions: number;
    };
};

// ── Adapter interface ────────────────────────────────────────────────

export type AdapterConfig = Record<string, unknown>;

export type AdapterParseResult = {
    manifest: ImportManifest;
    /** Format-specific validation issues (merged with shared validation in the wizard). */
    issues: ImportIssue[];
    /**
     * Field conversion data matching the template/field used during parsing.
     * Commit MUST use these values to convert steps → pixels correctly.
     * If omitted, the current file's field properties are used (only safe
     * when the user chose "use current field").
     */
    fieldForCommit?: {
        pixelsPerStep: number;
        centerFrontPoint: { xPixels: number; yPixels: number };
    };
};

/**
 * Props passed to each adapter config step component.
 * Config step components can also use React hooks for app state (e.g. field properties).
 */
export type AdapterStepProps = {
    preprocessed: unknown;
    config: AdapterConfig;
    onConfigChange: (updates: AdapterConfig) => void;
    onNext: () => void;
    onBack: () => void;
};

export type AdapterConfigStep = {
    id: string;
    label: string;
    component: React.ComponentType<AdapterStepProps>;
    /** Return false to skip this step based on current config. */
    shouldShow?: (config: AdapterConfig) => boolean;
};

/**
 * An importer adapter knows how to read a specific file format
 * and produce an ImportManifest. The shared pipeline handles
 * everything downstream (validation, preview, commit).
 *
 * Two-phase design: preprocess() does heavy one-time work (e.g. PDF text extraction),
 * parse() does fast re-computation based on user config choices.
 * This keeps the wizard responsive when users tweak settings.
 */
export type ImporterAdapter = {
    id: string;
    name: string;
    /** File extensions this adapter handles (e.g. [".pdf"]) */
    extensions: string[];
    /** Can this adapter handle the given file? */
    accepts: (file: File) => boolean;
    /** Wizard steps for format-specific configuration. */
    configSteps: AdapterConfigStep[];
    /** Heavy one-time file processing (e.g. PDF text extraction). */
    preprocess: (file: File) => Promise<unknown>;
    /** Produce manifest from preprocessed data + user config. Should be fast. */
    parse: (preprocessed: unknown, config: AdapterConfig) => AdapterParseResult;
};
