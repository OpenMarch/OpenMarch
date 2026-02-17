/**
 * Coordinate parser: converts tokenized coordinate text into numeric
 * xSteps / ySteps values using field checkpoint data.
 *
 * Uses pattern matching on semantic tokens instead of monolithic regex,
 * making it tolerant of noise words, OCR artifacts, and formatting variations.
 */

import { tokenize, meaningful, type Token } from "./tokenizer";

type CheckpointLike = {
    name: string;
    stepsFromCenterFront: number;
    useAsReference: boolean;
};

type FieldPropsLike = {
    xCheckpoints: CheckpointLike[];
    yCheckpoints: CheckpointLike[];
};

export type ParseOk = { ok: true; steps: number };
export type ParseErr = { ok: false; code: string; message: string };
export type ParseResult = ParseOk | ParseErr;

/** Hash type the source PDF's coordinates are written in. */
export type SourceHashType = "HS" | "CH" | "PH";

/** Standard hash positions (steps from center front) by hash type. */
const STANDARD_HASH_STEPS: Record<
    SourceHashType,
    { front: number; back: number }
> = {
    HS: { front: -28, back: -56 },
    CH: { front: -32, back: -52 },
    PH: { front: -38, back: -48 },
};

// ---------------------------------------------------------------------------
// Lateral (X-axis) parsing
// ---------------------------------------------------------------------------

/**
 * Parse lateral (side-to-side) coordinate text into xSteps from center.
 *
 * Recognized patterns (after noise filtering):
 *   [SIDE] ON NUMBER [YARDLINE]           -> On yard line
 *   [SIDE] NUMBER [STEPS] INSIDE NUMBER [YARDLINE]  -> Inside yard line
 *   [SIDE] NUMBER [STEPS] OUTSIDE NUMBER [YARDLINE] -> Outside yard line
 *   ON NUMBER [YARDLINE] [SIDE]           -> On yard line (side at end)
 */
export function parseLateral(text: string, field: FieldPropsLike): ParseResult {
    if (!text?.trim())
        return { ok: false, code: "EMPTY", message: "Empty lateral text" };

    const allTokens = tokenize(text);
    const tokens = meaningful(allTokens);
    if (tokens.length === 0)
        return {
            ok: false,
            code: "NO_TOKENS",
            message: "No meaningful tokens",
        };

    const side = extractSide(tokens);

    // Pattern: [ON] NUMBER [YARDLINE] — "On 50 yd ln" or just "On 50"
    const onIdx = findToken(tokens, "ON");
    if (onIdx >= 0) {
        const numAfterOn = findToken(tokens, "NUMBER", onIdx + 1);
        if (numAfterOn >= 0) {
            const yard = parseFloat(tokens[numAfterOn].value);
            if (isValidYardline(yard)) {
                return { ok: true, steps: yardlineSteps(field, yard, side) };
            }
        }
    }

    // Pattern: NUMBER [STEPS] INSIDE/OUTSIDE NUMBER [YARDLINE]
    const dirIdx = findTokenAny(tokens, ["INSIDE", "OUTSIDE"]);
    if (dirIdx >= 0) {
        // Distance is the nearest NUMBER before the direction
        const distIdx = findNumberBefore(tokens, dirIdx);
        // Yard line is the nearest NUMBER after the direction
        const yardIdx = findToken(tokens, "NUMBER", dirIdx + 1);
        if (distIdx >= 0 && yardIdx >= 0) {
            const dist = parseFloat(tokens[distIdx].value);
            const yard = parseFloat(tokens[yardIdx].value);
            if (isValidYardline(yard) && Number.isFinite(dist)) {
                const base = yardlineSteps(field, yard, side);
                if (tokens[dirIdx].type === "INSIDE") {
                    return {
                        ok: true,
                        steps: side === 1 ? base + dist : base - dist,
                    };
                }
                return {
                    ok: true,
                    steps: side === 1 ? base - dist : base + dist,
                };
            }
        }
    }

    // Fallback: if there's exactly one NUMBER and it looks like a yard line
    const numbers = tokens.filter((t) => t.type === "NUMBER");
    if (numbers.length === 1) {
        const yard = parseFloat(numbers[0].value);
        if (isValidYardline(yard)) {
            return { ok: true, steps: yardlineSteps(field, yard, side) };
        }
    }

    return {
        ok: false,
        code: "LATERAL_UNRECOGNIZED",
        message: `Could not parse lateral: "${text}"`,
    };
}

// ---------------------------------------------------------------------------
// Front-back (Y-axis) parsing
// ---------------------------------------------------------------------------

/**
 * Parse front-back coordinate text into ySteps from center front.
 *
 * Recognized patterns:
 *   ON HASH/SIDELINE [TAG]                           -> On reference
 *   NUMBER [STEPS] INFRONT HASH/SIDELINE [TAG]       -> In front of
 *   NUMBER [STEPS] BEHIND HASH/SIDELINE [TAG]        -> Behind
 */
export function parseFrontBack(
    text: string,
    field: FieldPropsLike,
    sourceHashType?: SourceHashType,
): ParseResult {
    if (!text?.trim())
        return { ok: false, code: "EMPTY", message: "Empty FB text" };

    const allTokens = tokenize(text);
    const tokens = meaningful(allTokens);
    if (tokens.length === 0)
        return {
            ok: false,
            code: "NO_TOKENS",
            message: "No meaningful tokens",
        };

    // User-selected source hash type overrides any tag inferred from the text
    const tag = sourceHashType ?? extractTag(tokens);
    const ref = extractReference(tokens);

    if (!ref) {
        return {
            ok: false,
            code: "FB_NO_REFERENCE",
            message: `No hash/sideline reference found: "${text}"`,
        };
    }

    const checkpoint = getYCheckpoint(field, ref.which, ref.target, tag);
    if (!checkpoint) {
        return {
            ok: false,
            code: "FB_CHECKPOINT_NOT_FOUND",
            message: `No ${ref.which} ${ref.target} checkpoint in field properties`,
        };
    }

    // Pattern: ON HASH/SIDELINE [TAG]
    const onIdx = findToken(tokens, "ON");
    const dirIdx = findTokenAny(tokens, ["INFRONT", "BEHIND"]);

    if (dirIdx < 0) {
        // No direction keyword — must be "On [reference]"
        return { ok: true, steps: checkpoint.stepsFromCenterFront };
    }

    // Pattern: NUMBER [STEPS] INFRONT/BEHIND HASH/SIDELINE [TAG]
    const distIdx = findNumberBefore(tokens, dirIdx);
    if (distIdx < 0) {
        // Direction without distance — try to find a number anywhere before the reference
        const anyNum = tokens.find((t) => t.type === "NUMBER");
        if (anyNum) {
            const dist = parseFloat(anyNum.value);
            if (Number.isFinite(dist)) {
                const base = checkpoint.stepsFromCenterFront;
                return {
                    ok: true,
                    steps:
                        tokens[dirIdx].type === "INFRONT"
                            ? base + dist
                            : base - dist,
                };
            }
        }
        return {
            ok: false,
            code: "FB_NO_DISTANCE",
            message: `Direction without distance: "${text}"`,
        };
    }

    const dist = parseFloat(tokens[distIdx].value);
    const base = checkpoint.stepsFromCenterFront;

    if (tokens[dirIdx].type === "INFRONT") {
        return { ok: true, steps: base + dist };
    }
    return { ok: true, steps: base - dist };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSide(tokens: Token[]): 1 | 2 {
    const side = tokens.find((t) => t.type === "SIDE");
    return side?.value === "2" ? 2 : 1;
}

function extractTag(tokens: Token[]): "HS" | "CH" | "PH" | undefined {
    const tag = tokens.find((t) => t.type === "TAG");
    return tag?.value as "HS" | "CH" | "PH" | undefined;
}

type RefInfo = { which: "Front" | "Back"; target: "Hash" | "Sideline" };

function extractReference(tokens: Token[]): RefInfo | null {
    // Look for HASH or SIDELINE tokens
    const hash = tokens.find((t) => t.type === "HASH");
    if (hash) {
        const v = hash.value.toLowerCase();
        const which = v.includes("back") ? "Back" : "Front";
        // Generic "Hash" without front/back — infer from nearby tokens
        if (!v.includes("front") && !v.includes("back")) {
            // Look for a preceding "Front" or "Back" noise/other token
            const idx = tokens.indexOf(hash);
            for (let i = idx - 1; i >= 0; i--) {
                const lc = tokens[i].value.toLowerCase();
                if (lc === "back" || lc === "b")
                    return { which: "Back", target: "Hash" };
                if (lc === "front" || lc === "f")
                    return { which: "Front", target: "Hash" };
            }
            return { which: "Front", target: "Hash" };
        }
        return { which, target: "Hash" };
    }

    const sl = tokens.find((t) => t.type === "SIDELINE");
    if (sl) {
        const which = sl.value.toLowerCase().includes("back")
            ? "Back"
            : "Front";
        return { which, target: "Sideline" };
    }

    return null;
}

function findToken(tokens: Token[], type: string, from = 0): number {
    for (let i = from; i < tokens.length; i++) {
        if (tokens[i].type === type) return i;
    }
    return -1;
}

function findTokenAny(tokens: Token[], types: string[], from = 0): number {
    for (let i = from; i < tokens.length; i++) {
        if (types.includes(tokens[i].type)) return i;
    }
    return -1;
}

function findNumberBefore(tokens: Token[], beforeIdx: number): number {
    for (let i = beforeIdx - 1; i >= 0; i--) {
        if (tokens[i].type === "NUMBER") return i;
        // Skip STEPS token (e.g., "4.0 steps Inside" — the number is before "steps")
        if (tokens[i].type === "STEPS") continue;
        break;
    }
    // Broaden: look for any number before the direction
    for (let i = beforeIdx - 1; i >= 0; i--) {
        if (tokens[i].type === "NUMBER") return i;
    }
    return -1;
}

function isValidYardline(yard: number): boolean {
    return Number.isFinite(yard) && yard >= 0 && yard <= 100;
}

function yardlineSteps(
    field: FieldPropsLike,
    yardNum: number,
    side: 1 | 2,
): number {
    const name = `${yardNum} yard line`;
    const checkpoints = field.xCheckpoints.filter((c) => c.name === name);
    if (checkpoints.length === 0) {
        // Fallback: compute from standard 8-to-5
        const steps = ((yardNum - 50) / 5) * 8;
        return side === 1 ? -Math.abs(steps) : Math.abs(steps);
    }
    const desiredSign = side === 1 ? -1 : 1;
    const match =
        checkpoints.find(
            (c) => Math.sign(c.stepsFromCenterFront) === desiredSign,
        ) || checkpoints[0];
    return match.stepsFromCenterFront;
}

function getYCheckpoint(
    field: FieldPropsLike,
    which: "Front" | "Back",
    target: "Hash" | "Sideline",
    hashType?: "HS" | "CH" | "PH",
): CheckpointLike | null {
    const lc = which.toLowerCase();

    if (target === "Hash") {
        if (hashType) {
            const typePatterns: Record<string, RegExp> = {
                HS: /\bhs\b/i,
                CH: /\b(ncaa|college)\b/i,
                PH: /\b(pro|nfl)\b/i,
            };
            const pattern = typePatterns[hashType];
            if (pattern) {
                const candidates = field.yCheckpoints.filter((c) => {
                    const n = c.name.toLowerCase();
                    return /hash/i.test(n) && n.includes(lc) && pattern.test(n);
                });
                if (candidates.length > 0)
                    return (
                        candidates.find((c) => c.useAsReference) ||
                        candidates[0]
                    );
            }
        }
        // No hash type specified — match any hash with the right front/back direction
        const candidates = field.yCheckpoints.filter(
            (c) => /hash/i.test(c.name) && c.name.toLowerCase().includes(lc),
        );
        if (candidates.length > 0)
            return candidates.find((c) => c.useAsReference) || candidates[0];
    } else {
        const candidates = field.yCheckpoints.filter((c) =>
            c.name.toLowerCase().includes(`${lc} sideline`),
        );
        if (candidates.length > 0)
            return candidates.find((c) => c.useAsReference) || candidates[0];
    }

    // Field doesn't have checkpoints for this hash type — use standard positions
    if (target === "Hash" && hashType) {
        const std = STANDARD_HASH_STEPS[hashType];
        return {
            name: `${hashType} ${lc} hash`,
            stepsFromCenterFront: which === "Front" ? std.front : std.back,
            useAsReference: true,
        };
    }
    return null;
}
