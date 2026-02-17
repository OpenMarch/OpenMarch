/**
 * Tokenizer for drill chart coordinate text.
 *
 * Converts raw strings like "Side 1: 4.0 steps Inside 25 yd ln" into
 * a sequence of semantic tokens that the coordinate parser can match
 * against known patterns — tolerating noise words, OCR artifacts, and
 * formatting variations.
 */

export type TokenType =
    | "NUMBER"
    | "SIDE"
    | "ON"
    | "STEPS"
    | "INSIDE"
    | "OUTSIDE"
    | "INFRONT"
    | "BEHIND"
    | "YARDLINE"
    | "HASH"
    | "SIDELINE"
    | "TAG"
    | "NOISE";

export type Token = {
    type: TokenType;
    value: string;
    /** How many source words this token consumed. */
    span: number;
};

// Multi-word phrases checked first (longest-match).
// Order matters: longer phrases before shorter sub-phrases.
// Pyware lets users customize all terminology — these cover known defaults
// and common alternatives: Home/Visitor, Front/Back, Top/Bottom, A/B, etc.
const MULTI_WORD: Array<{ words: string[]; type: TokenType; value: string }> = [
    { words: ["in", "front", "of"], type: "INFRONT", value: "In Front Of" },
    // Sideline: front/back/home/visitor/top/bottom + "side line" or "sideline"
    {
        words: ["front", "side", "line"],
        type: "SIDELINE",
        value: "Front Sideline",
    },
    {
        words: ["home", "side", "line"],
        type: "SIDELINE",
        value: "Front Sideline",
    },
    {
        words: ["visitor", "side", "line"],
        type: "SIDELINE",
        value: "Back Sideline",
    },
    {
        words: ["bottom", "side", "line"],
        type: "SIDELINE",
        value: "Front Sideline",
    },
    {
        words: ["top", "side", "line"],
        type: "SIDELINE",
        value: "Back Sideline",
    },
    {
        words: ["back", "side", "line"],
        type: "SIDELINE",
        value: "Back Sideline",
    },
    { words: ["home", "sideline"], type: "SIDELINE", value: "Front Sideline" },
    {
        words: ["visitor", "sideline"],
        type: "SIDELINE",
        value: "Back Sideline",
    },
    {
        words: ["bottom", "sideline"],
        type: "SIDELINE",
        value: "Front Sideline",
    },
    { words: ["top", "sideline"], type: "SIDELINE", value: "Back Sideline" },
    { words: ["front", "sideline"], type: "SIDELINE", value: "Front Sideline" },
    { words: ["back", "sideline"], type: "SIDELINE", value: "Back Sideline" },
    // Hash: front/back/home/visitor/top/bottom
    { words: ["home", "hash"], type: "HASH", value: "Front Hash" },
    { words: ["visitor", "hash"], type: "HASH", value: "Back Hash" },
    { words: ["bottom", "hash"], type: "HASH", value: "Front Hash" },
    { words: ["top", "hash"], type: "HASH", value: "Back Hash" },
    { words: ["front", "hash"], type: "HASH", value: "Front Hash" },
    { words: ["back", "hash"], type: "HASH", value: "Back Hash" },
    // Yard line variants
    { words: ["yd", "ln"], type: "YARDLINE", value: "yd ln" },
    { words: ["yd", "line"], type: "YARDLINE", value: "yd ln" },
    { words: ["yard", "line"], type: "YARDLINE", value: "yd ln" },
    { words: ["yard", "ln"], type: "YARDLINE", value: "yd ln" },
    // Side: Side 1/2, Side A/B
    { words: ["side", "1"], type: "SIDE", value: "1" },
    { words: ["side", "2"], type: "SIDE", value: "2" },
    { words: ["side", "a"], type: "SIDE", value: "1" },
    { words: ["side", "b"], type: "SIDE", value: "2" },
];

// Single-word lookup (after multi-word check fails).
const SINGLE_WORD: Record<string, { type: TokenType; value: string }> = {
    on: { type: "ON", value: "On" },
    inside: { type: "INSIDE", value: "Inside" },
    outside: { type: "OUTSIDE", value: "Outside" },
    behind: { type: "BEHIND", value: "Behind" },
    steps: { type: "STEPS", value: "steps" },
    step: { type: "STEPS", value: "steps" },
    stps: { type: "STEPS", value: "steps" },
    stp: { type: "STEPS", value: "steps" },
    left: { type: "SIDE", value: "1" },
    right: { type: "SIDE", value: "2" },
    s1: { type: "SIDE", value: "1" },
    s2: { type: "SIDE", value: "2" },
    fh: { type: "HASH", value: "Front Hash" },
    bh: { type: "HASH", value: "Back Hash" },
    fsl: { type: "SIDELINE", value: "Front Sideline" },
    bsl: { type: "SIDELINE", value: "Back Sideline" },
    yd: { type: "YARDLINE", value: "yd ln" },
    hash: { type: "HASH", value: "Hash" },
};

// Parenthesized tags
const TAG_REGEX = /^\(?(hs|ch|ph|college|pro|nfl|high\s*school)\)?$/i;
const TAG_MAP: Record<string, string> = {
    hs: "HS",
    "high school": "HS",
    highschool: "HS",
    ch: "CH",
    college: "CH",
    ph: "PH",
    pro: "PH",
    nfl: "PH",
};

// Number (integer or decimal): "4.0", "50", "2.5"
const NUMBER_REGEX = /^\d+(?:\.\d+)?$/;

// Noise words that are common in coordinate text but carry no semantic meaning
const NOISE_WORDS = new Set([
    "the",
    "a",
    "an",
    "of",
    "at",
    "to",
    "from",
    "is",
    "are",
    "was",
    ":",
    ".",
    ",",
    ";",
    "-",
    "/",
    "|",
]);

/**
 * Tokenize a coordinate text string into semantic tokens.
 * Splits on whitespace, then greedily matches multi-word phrases
 * before falling back to single-word recognition.
 */
export function tokenize(text: string): Token[] {
    if (!text || !text.trim()) return [];

    // Normalize: strip leading/trailing colons, collapse whitespace
    const cleaned = text
        .replace(/^[:\s]+/, "")
        .replace(/[:\s]+$/, "")
        .replace(/\s+/g, " ")
        .trim();

    const rawWords = cleaned.split(" ").filter(Boolean);
    // Split compound number+unit tokens: "4.0steps" -> "4.0", "steps" (common in OCR)
    const words = rawWords.flatMap((w) => {
        const m = /^(\d+(?:\.\d+)?)(steps?|stps?|stp)$/i.exec(w);
        return m ? [m[1], m[2]] : [w];
    });
    const tokens: Token[] = [];
    let i = 0;

    while (i < words.length) {
        const lc = words[i].toLowerCase();

        // 1. Try multi-word phrases (longest match first)
        let matched = false;
        for (const mw of MULTI_WORD) {
            if (i + mw.words.length > words.length) continue;
            const slice = words
                .slice(i, i + mw.words.length)
                .map((w) => w.toLowerCase().replace(/[:\s]/g, ""));
            if (slice.every((w, idx) => w === mw.words[idx])) {
                tokens.push({
                    type: mw.type,
                    value: mw.value,
                    span: mw.words.length,
                });
                i += mw.words.length;
                matched = true;
                break;
            }
        }
        if (matched) continue;

        // 2. Try parenthesized tags: (HS), (CH), (PH)
        const tagMatch = TAG_REGEX.exec(words[i]);
        if (tagMatch) {
            const key = tagMatch[1].toLowerCase().replace(/\s+/g, "");
            tokens.push({
                type: "TAG",
                value: TAG_MAP[key] || key.toUpperCase(),
                span: 1,
            });
            i++;
            continue;
        }

        // 3. Try number
        if (NUMBER_REGEX.test(words[i])) {
            tokens.push({ type: "NUMBER", value: words[i], span: 1 });
            i++;
            continue;
        }

        // 4. Try single-word lookup (strip trailing punctuation for matching)
        const stripped = lc.replace(/[:.;,]+$/, "");
        if (SINGLE_WORD[stripped]) {
            const { type, value } = SINGLE_WORD[stripped];
            tokens.push({ type, value, span: 1 });
            i++;
            continue;
        }

        // 5. Check for side patterns: "Side1:", "1:", "2:", "A:", "B:"
        const sideEmbed = /^(?:side)?([12ab])[:.]$/i.exec(words[i]);
        if (sideEmbed) {
            const v = sideEmbed[1].toLowerCase();
            tokens.push({
                type: "SIDE",
                value: v === "1" || v === "a" ? "1" : "2",
                span: 1,
            });
            i++;
            continue;
        }

        // 6. Noise
        if (NOISE_WORDS.has(stripped) || stripped.length === 0) {
            tokens.push({ type: "NOISE", value: words[i], span: 1 });
            i++;
            continue;
        }

        // 7. Unknown — treat as noise to avoid breaking the pipeline
        tokens.push({ type: "NOISE", value: words[i], span: 1 });
        i++;
    }

    return tokens;
}

/** Filter out NOISE tokens for pattern matching. */
export function meaningful(tokens: Token[]): Token[] {
    return tokens.filter((t) => t.type !== "NOISE");
}
