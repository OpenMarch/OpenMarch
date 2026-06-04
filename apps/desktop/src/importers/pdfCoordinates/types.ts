import { z } from "zod";

/**
 * Matches valid set IDs: numeric ("1", "2A", "12B") or word-based
 * start markers ("Start", "Beg", "Bgn", "Opener", "Open").
 */
export const SET_ID_REGEX = /^(\d+[A-Za-z]?|Start|Beg|Bgn|Opener|Open)$/i;

/** Start-type set IDs that represent the initial position (0 counts). */
export const START_SET_IDS = /^(start|beg|bgn|opener|open)$/i;

export const PerformerHeaderSchema = z.object({
    label: z.string().min(1).trim().optional(),
    symbol: z.string().trim().optional(),
    performer: z.string().trim().optional(),
    /** Parsed from PDF when label/symbol/performer are not unique (e.g. "Id: 1") */
    id: z.string().trim().optional(),
});

export type PerformerHeader = z.infer<typeof PerformerHeaderSchema>;

/** Unique key for a performer sheet; includes id when present to distinguish duplicates */
export function getSheetKey(sheet: { header: PerformerHeader }): string {
    const base = (
        sheet.header.label ||
        sheet.header.symbol ||
        sheet.header.performer ||
        "?"
    ).toLowerCase();
    return sheet.header.id ? `${base}-${sheet.header.id}` : base;
}

/** Short keys for sheets: when id exists, use sequential indices (1,2,3) per base instead of raw id */
export function getNormalizedSheetKeys(
    sheets: { header: PerformerHeader }[],
): string[] {
    const keys: string[] = [];
    const nextIndexPerBase = new Map<string, number>();
    for (const sheet of sheets) {
        const base = (
            sheet.header.label ||
            sheet.header.symbol ||
            sheet.header.performer ||
            "?"
        ).toLowerCase();
        if (sheet.header.id) {
            const next = (nextIndexPerBase.get(base) ?? 0) + 1;
            nextIndexPerBase.set(base, next);
            keys.push(`${base}-${next}`);
        } else {
            keys.push(base);
        }
    }
    return keys;
}

/** Derive drill_prefix and drill_order from a sheet key (e.g. "s-1" → S/1, "bd1" → BD/1) */
export function keyToDrillPrefixAndOrder(
    key: string,
    fallbackOrder: number,
): { prefix: string; order: number } {
    const idMatch = key.match(/^(.+)-(\d+)$/);
    if (idMatch) {
        const [, base, idNum] = idMatch;
        const letterPart = (base || "").replace(/\d/g, "").toUpperCase();
        const prefix =
            letterPart && /[A-Za-z]/.test(letterPart) ? letterPart : "P";
        return { prefix, order: parseInt(idNum, 10) || fallbackOrder };
    }
    const match =
        key.match(/^([A-Za-z]+)(\d+)$/i) || key.match(/^([A-Za-z]+)/i);
    const prefix =
        match?.[1] && /[A-Za-z]/.test(match[1]) ? match[1].toUpperCase() : "P";
    const order = match?.[2] ? parseInt(match[2], 10) : fallbackOrder;
    return { prefix, order };
}

export const ParsedRowSchema = z.object({
    setId: z.string().min(1),
    measureRange: z.string(),
    counts: z.coerce.number().int().nonnegative(),
    lateralText: z.string(),
    fbText: z.string(),
    source: z.string().optional(),
    conf: z.number().min(0).max(1).optional(),
});
export type ParsedRow = z.infer<typeof ParsedRowSchema>;

export const QuadrantSchema = z.enum(["TL", "TR", "BL", "BR"]);
export type Quadrant = z.infer<typeof QuadrantSchema>;

export const ParsedSheetSchema = z.object({
    pageIndex: z.number().int().nonnegative(),
    quadrant: QuadrantSchema,
    header: PerformerHeaderSchema,
    rows: z.array(ParsedRowSchema).min(1),
    rawText: z.string().optional(),
});
export type ParsedSheet = z.infer<typeof ParsedSheetSchema>;

export const NormalizedRowSchema = z.object({
    setId: z.string().min(1),
    counts: z.number().int().nonnegative(),
    xSteps: z.number(),
    ySteps: z.number(),
    lateralText: z.string(),
    fbText: z.string(),
    source: z.string().optional(),
    conf: z.number().min(0).max(1).optional(),
    /** Detailed parse error code from coordParser when lateral parse fails. */
    xParseError: z.string().optional(),
    /** Detailed parse error code from coordParser when front-back parse fails. */
    yParseError: z.string().optional(),
});
export type NormalizedRow = z.infer<typeof NormalizedRowSchema>;

export const NormalizedSheetSchema = z.object({
    pageIndex: z.number().int().nonnegative(),
    quadrant: QuadrantSchema,
    header: PerformerHeaderSchema,
    rows: z.array(NormalizedRowSchema),
});
export type NormalizedSheet = z.infer<typeof NormalizedSheetSchema>;

export type DryRunIssue = {
    type: "error" | "warning";
    code: string;
    message: string;
    pageIndex?: number;
    quadrant?: Quadrant;
    setId?: string;
    field?: keyof ParsedRow;
    confidence?: number;
};

export type DryRunReport = {
    issues: DryRunIssue[];
    stats: {
        sheets: number;
        rows: number;
        performers: number;
    };
};
