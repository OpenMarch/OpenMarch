/**
 * Universal intermediate representation for all import formats.
 * Every importer adapter produces an ImportManifest; all validation,
 * preview, and commit logic works on this shape alone.
 */

export type ImportManifest = {
    source: { format: string; filename: string };
    fieldHints?: {
        type: "outdoor" | "indoor";
        hashType?: "HS" | "CH" | "PH";
    };
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

/**
 * An importer adapter knows how to read a specific file format
 * and produce an ImportManifest. The shared pipeline handles
 * everything downstream (validation, preview, commit).
 */
export type ImporterAdapter = {
    id: string;
    name: string;
    /** Can this adapter handle the given file? */
    accepts: (file: File) => boolean;
    /** Parse the file into a universal manifest. */
    parse: (
        file: File,
        options: Record<string, unknown>,
    ) => Promise<ImportManifest>;
    /**
     * Optional React component for format-specific configuration
     * (e.g. hash type selection for PDF imports).
     * Receives onUpdate callback to push config changes upstream.
     */
    configComponent?: React.ComponentType<AdapterConfigProps>;
};

export type AdapterConfigProps = {
    manifest: ImportManifest;
    onUpdate: (options: Record<string, unknown>) => void;
};
