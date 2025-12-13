export type VendorProfile = {
    name: string;
    pageHeaderAnchors: string[]; // e.g., Performer:, Symbol:, Label:, ID:, .3dj/.3dz
    tableHeaders: {
        setId: string[];
        measureRange: string[];
        counts: string[];
        lateralText: string[];
        fbText: string[];
    };
    footerAnchors: string[]; // e.g., Printed, Page
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
};
