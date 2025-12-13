import { z } from "zod";

export const PerformerHeaderSchema = z.object({
    label: z.string().min(1).trim().optional(),
    symbol: z.string().trim().optional(),
    performer: z.string().trim().optional(),
});

export type PerformerHeader = z.infer<typeof PerformerHeaderSchema>;

export const ParsedRowSchema = z.object({
    setId: z.string().min(1),
    measureRange: z.string().min(1),
    counts: z.coerce.number().int().nonnegative(),
    lateralText: z.string().min(1),
    fbText: z.string().min(1),
    source: z.literal("ocr").optional(),
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
    source: z.literal("ocr").optional(),
    conf: z.number().min(0).max(1).optional(),
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
