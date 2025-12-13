import type { NormalizedSheet, ParsedSheet, NormalizedRow } from "./types";

const LATERAL_REGEX =
    /(?:On|on)|(?:(\d+(?:\.\d+)?)\s*(?:steps?|stp?s?)?\s*(Inside|Outside)\s*(\d{1,2})\s*(?:yd|yard|yds)\s*(?:ln|line|ln\.|line\.|In|in))/i;
// Front-to-back regex handles:
// - Hash marks: "Front Hash", "Back Hash", "FH", "BH" with optional (HS), (CH), (PH) designations
// - Side lines: "Front side line", "Back side line", "FSL", "BSL"
// - Relative positions: "X steps In Front Of/Behind [Hash/Side line]"
// Pattern 1: "On Front Hash (HS)" - captures: [1]=Front/Back/F/B, [2]=Hash/Side line/SL/H, [3]=HS/CH/PH
// Pattern 2: "4.0 steps In Front Of Front Hash (HS)" - captures: [4]=dist, [5]=relation, [6]=Front/Back/F/B, [7]=Hash/Side line/SL/H, [8]=HS/CH/PH
const FB_REGEX =
    /^(?:On|on)\s*(?:(Front|Back|F|B)\s*(Hash|Side\s*line|Sideline|H|SL)|(FSL|BSL|FH|BH))(?:\s*\(?(HS|CH|PH)\)?)?|^(\d+(?:\.\d+)?)\s*(?:steps?|stp?s?)?\s*(In Front Of|Behind)\s*(?:(Front|Back|F|B)\s*(Hash|Side\s*line|Sideline|H|SL)|(FSL|BSL|FH|BH))(?:\s*\(?(HS|CH|PH)\)?)?/i;

type CheckpointLike = {
    name: string;
    stepsFromCenterFront: number;
    useAsReference: boolean;
};

type FieldPropsLike = {
    xCheckpoints: CheckpointLike[];
    yCheckpoints: CheckpointLike[];
};

export function normalizeSheets(
    sheets: ParsedSheet[],
    fieldProperties: FieldPropsLike,
): NormalizedSheet[] {
    return sheets.map((s) => ({
        pageIndex: s.pageIndex,
        quadrant: s.quadrant,
        header: s.header,
        rows: s.rows.map((r) => normalizeRow(r, fieldProperties)),
    }));
}

function normalizeRow(
    row: any,
    fieldProperties: FieldPropsLike,
): NormalizedRow {
    const xSteps = parseLateral(row.lateralText, fieldProperties);
    const ySteps = parseFrontBack(row.fbText, fieldProperties);
    return {
        setId: row.setId,
        counts: row.counts,
        xSteps,
        ySteps,
        lateralText: row.lateralText,
        fbText: row.fbText,
        source: row.source,
        conf: row.conf,
    };
}

function getYCheckpoint(
    field: FieldPropsLike,
    which: "Front" | "Back",
    target: "Hash" | "Sideline",
    hashType?: "HS" | "CH" | "PH",
): CheckpointLike {
    const lc = which.toLowerCase();

    // If looking for Hash
    if (target === "Hash") {
        // Try to find hash mark with specific type first
        if (hashType) {
            const typeMap: Record<string, string> = {
                HS: "high school",
                CH: "college",
                PH: "pro|nfl",
            };
            const typePattern = typeMap[hashType] || "";
            const candidates = field.yCheckpoints.filter((c) => {
                const nameLc = c.name.toLowerCase();
                return (
                    /hash/i.test(c.name) &&
                    nameLc.includes(lc) &&
                    new RegExp(typePattern, "i").test(nameLc)
                );
            });
            if (candidates.length > 0) {
                const preferred =
                    candidates.find((c) => c.useAsReference) || candidates[0];
                return preferred;
            }
        }

        // Fallback: try to find any hash mark (front/back)
        const nameNeedle = lc === "front" ? "front hash" : "back hash";
        const candidates = field.yCheckpoints.filter(
            (c) =>
                /hash/i.test(c.name) &&
                c.name.toLowerCase().includes(nameNeedle),
        );
        if (candidates.length > 0) {
            const preferred =
                candidates.find((c) => c.useAsReference) || candidates[0];
            return preferred;
        }
    } else {
        // Looking for Sideline
        const sidelineNeedle =
            lc === "front" ? "front sideline" : "back sideline";
        const sidelineCandidates = field.yCheckpoints.filter((c) =>
            c.name.toLowerCase().includes(sidelineNeedle),
        );
        if (sidelineCandidates.length > 0) {
            const preferred =
                sidelineCandidates.find((c) => c.useAsReference) ||
                sidelineCandidates[0];
            return preferred;
        }
    }

    throw new Error(
        `No ${which} ${target} found in field properties${hashType ? ` (type: ${hashType})` : ""}`,
    );
}

function yardlineSteps(
    field: FieldPropsLike,
    yardNum: number,
    side: 1 | 2,
): number {
    const name = `${yardNum} yard line`;
    const checkpoints = field.xCheckpoints.filter((c) => c.name === name);
    if (checkpoints.length === 0) {
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

function detectSide(text: string): 1 | 2 {
    const lc = text.toLowerCase();
    // Handle multiple naming conventions used in drill charts:
    // - Side A = Side 1, Side B = Side 2 (common in some systems)
    // - Left = Side 1, Right = Side 2 (directional)
    // - S1 = Side 1, S2 = Side 2 (abbreviated)
    // - Side 1, Side 2 (numeric)
    //
    // Examples that should match Side 1:
    //   "Side 1", "Side A", "Side A:", "S1", "Left", "side 1", "side a"
    // Examples that should match Side 2:
    //   "Side 2", "Side B", "Side B:", "S2", "Right", "side 2", "side b"
    if (/(^|\s)(s1|side\s*1|side\s*a\b|side\s*a:|left)(\b|$)/.test(lc))
        return 1;
    if (/(^|\s)(s2|side\s*2|side\s*b\b|side\s*b:|right)(\b|$)/.test(lc))
        return 2;
    return 1; // Default to Side 1 if unclear
}

export function parseLateral(text: string, field: FieldPropsLike): number {
    const side = detectSide(text);
    if (/^\s*(?:Side\s*[12ab]|Left|Right)\s*:\s*On\s*(\d{1,2})/i.test(text)) {
        const yard = parseInt(
            text.match(/(\d{1,2})\s*(?:yd|yard|yds)/i)?.[1] || "50",
            10,
        );
        return yardlineSteps(field, yard, side);
    }
    const m = text.match(LATERAL_REGEX);
    if (!m) return 0;
    const dist = m[1] ? parseFloat(m[1]) : 0;
    const relation = (m[2] || "On").toLowerCase();
    const yard = m[3] ? parseInt(m[3], 10) : 50;
    const base = yardlineSteps(field, yard, side);
    if (!dist || relation === "on") return base;

    // "Inside" means towards the center of the field (50 yd line / 0,0 coordinate)
    // "Outside" means away from the center
    //
    // Coordinate system:
    // - Side 1 (left) has negative xSteps (e.g., -8 for 45 yd line)
    // - Side 2 (right) has positive xSteps (e.g., +8 for 45 yd line)
    // - Center (50 yd line) is at 0
    //
    // Examples:
    // - Side 1, "4 steps Inside 45 yd ln": base=-8, move towards 0 → -8 + 4 = -4
    // - Side 1, "4 steps Outside 45 yd ln": base=-8, move away from 0 → -8 - 4 = -12
    // - Side 2, "4 steps Inside 45 yd ln": base=+8, move towards 0 → +8 - 4 = +4
    // - Side 2, "4 steps Outside 45 yd ln": base=+8, move away from 0 → +8 + 4 = +12
    if (relation.toLowerCase() === "inside") {
        // Move towards center (0): Side 1 adds (less negative), Side 2 subtracts (less positive)
        return side === 1 ? base + dist : base - dist;
    } else {
        // Move away from center (0): Side 1 subtracts (more negative), Side 2 adds (more positive)
        return side === 1 ? base - dist : base + dist;
    }
}

export function parseFrontBack(text: string, field: FieldPropsLike): number {
    const m = text.match(FB_REGEX);
    if (!m) {
        // Try simple patterns that might not match complex regex
        // e.g. "On Front Hash"
        if (/On\s+(?:Front|Back)/i.test(text)) {
            const lc = text.toLowerCase();
            const which = lc.includes("front") ? "Front" : "Back";
            const target =
                lc.includes("side") || lc.includes("sl") ? "Sideline" : "Hash";
            const hashType = text.match(/\((HS|CH|PH)\)/i)?.[1] as
                | "HS"
                | "CH"
                | "PH"
                | undefined;
            return getYCheckpoint(field, which, target, hashType)
                .stepsFromCenterFront;
        }
        return 0;
    }

    const resolve = (
        dir: string | undefined,
        type: string | undefined,
        combined: string | undefined,
    ) => {
        if (combined) {
            const u = combined.toUpperCase();
            if (u === "FSL")
                return { which: "Front" as const, target: "Sideline" as const };
            if (u === "BSL")
                return { which: "Back" as const, target: "Sideline" as const };
            if (u === "FH")
                return { which: "Front" as const, target: "Hash" as const };
            if (u === "BH")
                return { which: "Back" as const, target: "Hash" as const };
        }
        if (dir) {
            const w = dir[0].toUpperCase() === "F" ? "Front" : "Back";
            let t: "Hash" | "Sideline" = "Hash";
            if (type && /side|sl/i.test(type)) t = "Sideline";
            return { which: w as "Front" | "Back", target: t };
        }
        return null;
    };

    // Pattern 1: "On ..."
    // Groups: 1=Dir, 2=Type, 3=Combined, 4=Tag
    if (m[0].toLowerCase().startsWith("on")) {
        const info = resolve(m[1], m[2], m[3]);
        if (info) {
            const tag = m[4] as "HS" | "CH" | "PH" | undefined;
            return getYCheckpoint(field, info.which, info.target, tag)
                .stepsFromCenterFront;
        }
    }

    // Pattern 2: "X steps ..."
    // Groups: 5=Dist, 6=Rel, 7=Dir, 8=Type, 9=Combined, 10=Tag
    if (m[5] && m[6]) {
        const dist = parseFloat(m[5]);
        const relation = m[6];
        const info = resolve(m[7], m[8], m[9]);

        if (info) {
            const tag = m[10] as "HS" | "CH" | "PH" | undefined;
            const base = getYCheckpoint(
                field,
                info.which,
                info.target,
                tag,
            ).stepsFromCenterFront;

            // Calculate final steps based on relative position.
            // The coordinate system defines positive Y towards the Front (audience)
            // and negative Y towards the Back.
            // "In Front Of" adds distance (more positive).
            // "Behind" subtracts distance (more negative).

            if (/In Front Of/i.test(relation)) {
                return base + dist;
            }
            return base - dist;
        }
    }

    return 0;
}
