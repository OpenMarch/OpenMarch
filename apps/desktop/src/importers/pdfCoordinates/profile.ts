export type VendorProfile = {
    name: string;
    pageHeaderAnchors: string[];
    tableHeaders: {
        setId: string[];
        measureRange: string[];
        counts: string[];
        lateralText: string[];
        fbText: string[];
    };
    footerAnchors: string[];
    columnOrder: Array<
        "setId" | "measureRange" | "counts" | "lateralText" | "fbText"
    >;
    fieldPatterns: {
        setId: RegExp;
        measureRange: RegExp;
        counts: RegExp;
        lateralTextKeywords: string[];
        fbTextKeywords: string[];
    };
    allowCountsZeroOnFirstRow: boolean;
    maxSheetsPerPage: number;

    /** Layout constants used by sheet detection, column mapping, and row bucketing. */
    layout: {
        /** Y-axis tolerance for grouping text items into rows (default: 2). */
        rowEpsilon: number;
        /** Minimum text items to consider a region a valid sheet (default: 10). */
        minItemsPerSheet: number;
        /** Gutter pixels between quadrants in fixed-quadrant fallback (default: 8). */
        gutterPx: number;
        /** Minimum vertical gap to split sheets in density mode (default: 30). */
        sheetGapPx: number;
        /** Max distance for density-based clustering (default: 50). */
        densityEpsilon: number;
        /** Expected number of data columns (default: 5). Used as hint, not requirement. */
        expectedColumns: number;
        /** Left band margin when deriving column boundaries (default: 50). */
        bandMarginLeft: number;
        /** Right band extension for last column (default: 500). */
        bandMarginRight: number;
    };

    /** Coordinate vocabulary for tokenizer and parser. */
    coordVocabulary: {
        /** Map side labels to canonical "1" or "2". */
        sideLabels: Record<string, "1" | "2">;
        /** Map hash labels to canonical "Front Hash" or "Back Hash". */
        hashLabels: Record<string, string>;
        /** Map sideline labels to canonical "Front Sideline" or "Back Sideline". */
        sidelineLabels: Record<string, string>;
        /** Keywords that identify "steps" (e.g. "steps", "stp"). */
        stepsKeywords: string[];
    };
};

export const pywareProfile: VendorProfile = {
    name: "pyware",
    pageHeaderAnchors: [
        "performer:",
        "symbol:",
        "label:",
        "id:",
        ".3dj",
        ".3dz",
    ],
    tableHeaders: {
        setId: ["set"],
        measureRange: ["measure", "measures"],
        counts: ["counts"],
        lateralText: ["side 1-side 2", "side to side"],
        fbText: ["front-back", "front to back", "front back"],
    },
    footerAnchors: ["printed", "page"],
    columnOrder: ["setId", "measureRange", "counts", "lateralText", "fbText"],
    fieldPatterns: {
        setId: /^\d+[A-Za-z]?$/,
        measureRange: /^(0|\d+\s*-\s*\d+)$/,
        counts: /^\d+$/,
        lateralTextKeywords: ["inside", "outside", "on", "yd", "line", "ln"],
        fbTextKeywords: ["front", "back", "hash", "behind", "in front of"],
    },
    allowCountsZeroOnFirstRow: true,
    maxSheetsPerPage: 4,
    layout: {
        rowEpsilon: 2,
        minItemsPerSheet: 10,
        gutterPx: 8,
        sheetGapPx: 30,
        densityEpsilon: 50,
        expectedColumns: 5,
        bandMarginLeft: 50,
        bandMarginRight: 500,
    },
    coordVocabulary: {
        sideLabels: {
            left: "1",
            right: "2",
            s1: "1",
            s2: "2",
        },
        hashLabels: {
            fh: "Front Hash",
            bh: "Back Hash",
            "home hash": "Front Hash",
            "visitor hash": "Back Hash",
            "bottom hash": "Front Hash",
            "top hash": "Back Hash",
        },
        sidelineLabels: {
            fsl: "Front Sideline",
            bsl: "Back Sideline",
            "home sideline": "Front Sideline",
            "visitor sideline": "Back Sideline",
        },
        stepsKeywords: ["steps", "step", "stps", "stp"],
    },
};
