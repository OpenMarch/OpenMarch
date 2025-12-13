import type { NormalizedSheet, ParsedSheet, NormalizedRow } from "./types";

const LATERAL_REGEX =
    /(?:On|on)|(?:(\d+(?:\.\d+)?)\s*(?:steps?|stp?s?)?\s*(Inside|Outside)\s*(\d{1,2})\s*(?:yd|yard|yds)\s*(?:ln|line|ln\.|line\.|In|in))/i;
// Front-to-back regex handles:
// - Hash marks: "Front Hash", "Back Hash" with optional (HS), (CH), (PH) designations
// - Side lines: "Front side line", "Back side line", "Front sideline", "Back sideline"
// - Relative positions: "X steps In Front Of/Behind [Hash/Side line]"
// Pattern 1: "On Front Hash (HS)" - captures: [1]=Front/Back, [2]=HS/CH/PH
// Pattern 2: "4.0 steps In Front Of Front Hash (HS)" - captures: [3]=dist, [4]=relation, [5]=Front/Back, [6]=HS/CH/PH
const FB_REGEX =
    /^(?:On|on)\s*(Front|Back)\s*(?:Hash|side\s*line|sideline)(?:\s*\(?(HS|CH|PH)\)?)?|^(\d+(?:\.\d+)?)\s*(?:steps?|stp?s?)?\s*(In Front Of|Behind)\s*(Front|Back)\s*(?:Hash|side\s*line|sideline)(?:\s*\(?(HS|CH|PH)\)?)?/i;

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
    hashType?: "HS" | "CH" | "PH",
): CheckpointLike {
    const lc = which.toLowerCase();

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
            /hash/i.test(c.name) && c.name.toLowerCase().includes(nameNeedle),
    );
    if (candidates.length > 0) {
        const preferred =
            candidates.find((c) => c.useAsReference) || candidates[0];
        return preferred;
    }

    // Fallback: try side line
    const sidelineNeedle = lc === "front" ? "front sideline" : "back sideline";
    const sidelineCandidates = field.yCheckpoints.filter((c) =>
        c.name.toLowerCase().includes(sidelineNeedle),
    );
    if (sidelineCandidates.length > 0) {
        const preferred =
            sidelineCandidates.find((c) => c.useAsReference) ||
            sidelineCandidates[0];
        return preferred;
    }

    throw new Error(
        `No ${which} hash or sideline found in field properties${hashType ? ` (type: ${hashType})` : ""}`,
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
        // Try simple patterns: "On Front Hash", "On Back side line", etc.
        const simpleHash = text.match(
            /On\s+(Front|Back)\s+Hash(?:\s*\(?(HS|CH|PH)\)?)?/i,
        );
        if (simpleHash) {
            const which = simpleHash[1] as "Front" | "Back";
            const hashType = simpleHash[2] as "HS" | "CH" | "PH" | undefined;
            const base = getYCheckpoint(
                field,
                which,
                hashType,
            ).stepsFromCenterFront;
            return base;
        }
        const simpleSideline = text.match(/On\s+(Front|Back)\s+side\s*line/i);
        if (simpleSideline) {
            const which = simpleSideline[1] as "Front" | "Back";
            const base = getYCheckpoint(field, which).stepsFromCenterFront;
            return base;
        }
        return 0;
    }

    // Check which pattern matched by seeing which groups are populated
    // Pattern 1: "On Front Hash (HS)" - m[1] and m[2] are set
    // Pattern 2: "4.0 steps In Front Of Front Hash (HS)" - m[3], m[4], m[5], m[6] are set
    if (m[1] && m[0].toLowerCase().startsWith("on")) {
        // Pattern 1: "On [Front/Back] [Hash/Side line]"
        const which = m[1] as "Front" | "Back";
        const hashType = m[2] as "HS" | "CH" | "PH" | undefined;
        return getYCheckpoint(field, which, hashType).stepsFromCenterFront;
    }

    if (m[3] && m[4] && m[5]) {
        // Pattern 2: "X steps In Front Of/Behind [Front/Back] [Hash/Side line]"
        const dist = parseFloat(m[3]);
        const relation = m[4];
        const which = m[5] as "Front" | "Back";
        const hashType = m[6] as "HS" | "CH" | "PH" | undefined;
        const base = getYCheckpoint(
            field,
            which,
            hashType,
        ).stepsFromCenterFront;

        // Coordinate system: Y axis - behind the front is negative, in front is positive
        // Front sideline = 0, back sideline = negative
        // "In Front Of Front Hash" = move towards front (more positive) = base + dist
        // "Behind Front Hash" = move towards back (more negative) = base - dist
        if (/In Front Of/i.test(relation)) {
            return base + dist;
        }
        return base - dist;
    }

    return 0;
}
