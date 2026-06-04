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
        // "On yd ln" with no yard number — unlabeled center column, assume 50
        const yardlineAfterOn = findToken(tokens, "YARDLINE", onIdx + 1);
        if (yardlineAfterOn >= 0) {
            return { ok: true, steps: yardlineSteps(field, 50, side) };
        }
    }

    // Pattern: NUMBER [STEPS] INSIDE/OUTSIDE NUMBER [YARDLINE]
    // Also accepts INFRONT/BEHIND in lateral context (some formats use it for
    // "outside/beyond the yard line", e.g. "0.75 steps In Front Of yd ln").
    const dirIdx = findTokenAny(tokens, [
        "INSIDE",
        "OUTSIDE",
        "INFRONT",
        "BEHIND",
    ]);
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
        // No yard number after direction — unlabeled center column, assume 50
        const yardlineAfterDir = findToken(tokens, "YARDLINE", dirIdx + 1);
        if (distIdx >= 0 && yardlineAfterDir >= 0) {
            const dist = parseFloat(tokens[distIdx].value);
            if (Number.isFinite(dist)) {
                const base = yardlineSteps(field, 50, side);
                if (tokens[dirIdx].type === "INSIDE") {
                    return {
                        ok: true,
                        steps: side === 1 ? base + dist : base - dist,
                    };
                }
                // OUTSIDE, INFRONT, BEHIND all treated as "outside center"
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

    // Letter-prefixed yard line used in Home/Visitor (front-back) column:
    // "C yd ln" = front hash, "B yd ln" = back hash, "D/E yd ln" = back sideline
    const ycp = tokens.find((t) => t.type === "YCHECKPOINT");
    if (ycp) {
        const v = ycp.value.toLowerCase();
        if (v === "c yd ln") return { which: "Front", target: "Hash" };
        if (v === "b yd ln") return { which: "Back", target: "Hash" };
        if (v === "d yd ln" || v === "e yd ln")
            return { which: "Back", target: "Sideline" };
        return { which: "Front", target: "Sideline" }; // "A yd ln" or unknown
    }

    // Bare "yd ln" (no letter prefix) in the front-back column = front sideline
    const yl = tokens.find((t) => t.type === "YARDLINE");
    if (yl) return { which: "Front", target: "Sideline" };

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

// ---------------------------------------------------------------------------
// Indoor field detection and parsers
// ---------------------------------------------------------------------------

/**
 * Returns true when the field uses non-yard-line lateral checkpoints
 * (e.g., indoor drill with "5 line", "Left Edge", etc.).
 */
export function isIndoorField(field: FieldPropsLike): boolean {
    if (field.xCheckpoints.length === 0) return false;
    return !field.xCheckpoints.some((c) => /\byard\s*line\b/i.test(c.name));
}

/**
 * Normalize a checkpoint name for fuzzy matching.
 * Converts "yd ln", "yd line", "yard line" → "line" so that
 * "D yd ln", "D line", "D yard line" all match each other.
 */
function normalizeIndoorName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\byard\s*line\b/g, "line")
        .replace(/\byd\s*line\b/g, "line")
        .replace(/\byd\s*ln\b/g, "line")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Find the best-matching checkpoint by normalized name,
 * preferring `useAsReference` checkpoints when multiple match.
 */
function findCheckpointByName(
    checkpoints: CheckpointLike[],
    name: string,
): CheckpointLike | null {
    const normalized = normalizeIndoorName(name);
    const exact = checkpoints.filter(
        (c) => normalizeIndoorName(c.name) === normalized,
    );
    if (exact.length > 0)
        return exact.find((c) => c.useAsReference) || exact[0];
    return null;
}

/**
 * Find a checkpoint whose normalized name appears in the text.
 * Searches the provided checkpoint list and returns the longest match.
 * Works with any naming convention: "1 line", "1 yd ln", "D line", "Left Edge", etc.
 */
function findCheckpointInText(
    text: string,
    checkpoints: CheckpointLike[],
): CheckpointLike | null {
    const normalizedText = normalizeIndoorName(text);
    // Deduplicate and sort by length descending to match longest first
    const seen = new Set<string>();
    const names: { normalized: string; original: CheckpointLike }[] = [];
    for (const cp of checkpoints) {
        const n = normalizeIndoorName(cp.name);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        names.push({ normalized: n, original: cp });
    }
    names.sort((a, b) => b.normalized.length - a.normalized.length);

    for (const { normalized, original } of names) {
        const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`\\b${escaped}\\b`).test(normalizedText)) {
            return original;
        }
    }
    return null;
}

/**
 * Resolve indoor lateral (x-axis) steps for a named checkpoint,
 * choosing the correct side copy when both sides are present.
 * Uses normalized name comparison for robust matching.
 */
function indoorXSteps(
    checkpoints: CheckpointLike[],
    name: string,
    side: 1 | 2,
): number | null {
    const normalized = normalizeIndoorName(name);
    const matches = checkpoints.filter(
        (c) => normalizeIndoorName(c.name) === normalized,
    );
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0].stepsFromCenterFront;
    const desiredSign = side === 1 ? -1 : 1;
    return (
        matches.find((c) => Math.sign(c.stepsFromCenterFront) === desiredSign)
            ?.stepsFromCenterFront ?? matches[0].stepsFromCenterFront
    );
}

/**
 * Parse lateral (x-axis) coordinate text for indoor fields.
 * Matches checkpoint names from `field.xCheckpoints` directly against
 * the text (with normalization), so any naming convention works:
 * "1 line", "1 yd ln", "Left Edge", etc.
 */
export function parseLateralIndoor(
    text: string,
    field: FieldPropsLike,
): ParseResult {
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

    // Find checkpoint by matching field checkpoint names against the text
    const match = findCheckpointInText(text, field.xCheckpoints);
    let base: number | null = null;

    if (match) {
        base = indoorXSteps(field.xCheckpoints, match.name, side);
        if (base === null) base = match.stepsFromCenterFront;
    } else {
        // Edge fallback: "left edge" → most-negative, "right edge" → most-positive
        const nt = normalizeIndoorName(text);
        if (/\bleft\s*edge\b/.test(nt) || /\bright\s*edge\b/.test(nt)) {
            const refs = field.xCheckpoints.filter((c) => c.useAsReference);
            if (refs.length > 0) {
                const sorted = [...refs].sort(
                    (a, b) => a.stepsFromCenterFront - b.stepsFromCenterFront,
                );
                base = /\bleft\b/.test(nt)
                    ? sorted[0].stepsFromCenterFront
                    : sorted[sorted.length - 1].stepsFromCenterFront;
            }
        }
    }

    if (base === null) {
        return {
            ok: false,
            code: "LATERAL_UNRECOGNIZED",
            message: `No indoor lateral checkpoint found: "${text}"`,
        };
    }

    // Apply INSIDE/OUTSIDE offset
    const dirIdx = findTokenAny(tokens, ["INSIDE", "OUTSIDE"]);
    if (dirIdx >= 0) {
        const distIdx = findNumberBefore(tokens, dirIdx);
        if (distIdx >= 0) {
            const dist = parseFloat(tokens[distIdx].value);
            if (Number.isFinite(dist)) {
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

    return { ok: true, steps: base };
}

/**
 * Parse front-back (y-axis) coordinate text for indoor fields.
 * Matches checkpoint names from `field.yCheckpoints` directly against
 * the text (with normalization), so any naming convention works:
 * "D line", "D yd ln", "Front Edge", etc.
 */
export function parseFrontBackIndoor(
    text: string,
    field: FieldPropsLike,
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

    // Find checkpoint by matching field checkpoint names against the text
    let checkpoint = findCheckpointInText(text, field.yCheckpoints);

    if (!checkpoint) {
        // Edge fallback: "front edge" → frontmost, "back edge" → backmost
        const nt = normalizeIndoorName(text);
        if (/\bfront\s*edge\b/.test(nt) || /\bback\s*edge\b/.test(nt)) {
            const refs = field.yCheckpoints.filter((c) => c.useAsReference);
            if (refs.length > 0) {
                const sorted = [...refs].sort(
                    (a, b) => b.stepsFromCenterFront - a.stepsFromCenterFront,
                );
                checkpoint = /\bfront\b/.test(nt)
                    ? sorted[0]
                    : sorted[sorted.length - 1];
            }
        }
    }

    if (!checkpoint) {
        return {
            ok: false,
            code: "FB_CHECKPOINT_NOT_FOUND",
            message: `No indoor FB checkpoint found: "${text}"`,
        };
    }

    const dirIdx = findTokenAny(tokens, ["INFRONT", "BEHIND"]);
    if (dirIdx < 0) {
        return { ok: true, steps: checkpoint.stepsFromCenterFront };
    }

    const distIdx = findNumberBefore(tokens, dirIdx);
    if (distIdx < 0) {
        return {
            ok: false,
            code: "FB_NO_DISTANCE",
            message: `Direction without distance: "${text}"`,
        };
    }

    const dist = parseFloat(tokens[distIdx].value);
    const base = checkpoint.stepsFromCenterFront;
    return {
        ok: true,
        steps: tokens[dirIdx].type === "INFRONT" ? base + dist : base - dist,
    };
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
