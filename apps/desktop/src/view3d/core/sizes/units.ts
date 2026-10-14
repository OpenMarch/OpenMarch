/**
 * Real-world lengths (ADR 0002 D-9 "Units", docs/3d/props-spec.md §3).
 *
 * Meters in storage, full-precision floats, never rounded on write. Feet and
 * inches convert exactly at 0.3048 m/ft. Display rounds only: ft-in to the
 * nearest ⅛ in, or meters to the nearest cm. A value typed in feet or inches
 * re-displays as typed.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
// cspell:words millimet centimet milli
import type { MeasurementSystem } from "@openmarch/core";

export type ImperialUnit = "in" | "ft";
export type MetricUnit = "m" | "cm" | "mm";
export type LengthUnit = ImperialUnit | MetricUnit;

/** Exact by definition (international foot, 1959). */
export const METERS_PER_FOOT = 0.3048;
export const METERS_PER_INCH = 0.0254;

/**
 * A length as stored: meters at full precision, plus the text as typed when it
 * was typed in feet or inches, so it can re-display as typed.
 */
export interface Length {
    readonly m: number;
    readonly typed?: string;
}

/**
 * Imperial values go through inches as `inches × 254 / 10000`. For the
 * eighth-inch and half-foot values people type, `inches × 254` is an exact
 * double, so the result is the correctly rounded meter value, and `4'6"`,
 * `4.5 ft` and `54 in` give the same bits (`4.5 × 0.3048` does not).
 */
function inchesToMeters(inches: number): number {
    return (inches * 254) / 10000;
}

export function toMeters(value: number, unit: LengthUnit): number {
    switch (unit) {
        case "in":
            return inchesToMeters(value);
        case "ft":
            return inchesToMeters(value * 12);
        case "m":
            return value;
        case "cm":
            return value / 100;
        case "mm":
            return value / 1000;
    }
}

export function fromMeters(m: number, unit: LengthUnit): number {
    switch (unit) {
        case "in":
            return (m * 10000) / 254;
        case "ft":
            return (m * 10000) / 254 / 12;
        case "m":
            return m;
        case "cm":
            return m * 100;
        case "mm":
            return m * 1000;
    }
}

export function isImperialUnit(unit: LengthUnit): unit is ImperialUnit {
    return unit === "in" || unit === "ft";
}

// ---------------------------------------------------------------- parsing

export interface ParsedLength {
    readonly m: number;
    /** The unit of the last number typed (`4'6"` is "in"). */
    readonly unit: LengthUnit;
    /** The input, trimmed with runs of spaces collapsed. */
    readonly typed: string;
}

export interface ParseOptions {
    /** The unit for a bare number such as `36`. Without it, a bare number doesn't parse. */
    readonly defaultUnit?: LengthUnit;
}

const UNICODE_FRACTIONS: Record<string, string> = {
    "¼": " 1/4",
    "½": " 1/2",
    "¾": " 3/4",
    "⅛": " 1/8",
    "⅜": " 3/8",
    "⅝": " 5/8",
    "⅞": " 7/8",
};

const NUM = String.raw`(?:\d+(?:\.\d*)?|\.\d+)`;
/** A decimal, a fraction, or a whole number and a fraction: `4.5`, `1/8`, `54 1/2`. */
const MIXED = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|${NUM})`;
const FEET_MARK = String.raw`(?:'|ft\.?|foot|feet)`;
const INCH_MARK = String.raw`(?:"|in\.?|inch|inches)`;

const IMPERIAL_RE = new RegExp(
    String.raw`^(?:(${MIXED})\s*${FEET_MARK})?\s*,?\s*(?:(${MIXED})\s*(${INCH_MARK})?)?$`,
);
const METRIC_RE = new RegExp(
    String.raw`^(${NUM})\s*(mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|m|met(?:er|re)s?)$`,
);
const BARE_RE = new RegExp(String.raw`^(${MIXED})$`);

function parseMixed(text: string): number | null {
    const parts = text.trim().split(/\s+/);
    let total = 0;
    for (const part of parts) {
        const slash = part.indexOf("/");
        if (slash >= 0) {
            const num = Number(part.slice(0, slash));
            const den = Number(part.slice(slash + 1));
            if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0)
                return null;
            total += num / den;
        } else {
            const value = Number(part);
            if (!Number.isFinite(value)) return null;
            total += value;
        }
    }
    return total;
}

function metricUnit(word: string): MetricUnit {
    if (word.startsWith("mm") || word.startsWith("milli")) return "mm";
    if (word.startsWith("c")) return "cm";
    return "m";
}

function normalize(text: string): string {
    let s = text.trim().replace(/\s+/g, " ");
    for (const [glyph, ascii] of Object.entries(UNICODE_FRACTIONS))
        s = s.split(glyph).join(ascii);
    return s
        .replace(/[′‘’]/g, "'")
        .replace(/[″“”]/g, '"')
        .replace(/''/g, '"')
        .toLowerCase()
        .trim();
}

/**
 * Parses a typed length: `4'6"`, `4' 6 1/2"`, `4 ft 6 in`, `4.5 ft`, `54 in`,
 * `54"`, `1.83 m`, `183 cm`, `25 mm`. Returns null for anything else or a
 * negative value.
 */
export function parseLength(
    text: string,
    options: ParseOptions = {},
): ParsedLength | null {
    const typed = text.trim().replace(/\s+/g, " ");
    const s = normalize(text);
    if (s === "") return null;

    const metric = METRIC_RE.exec(s);
    if (metric) {
        const value = Number(metric[1]);
        const unit = metricUnit(metric[2]);
        return { m: toMeters(value, unit), unit, typed };
    }

    const bare = BARE_RE.exec(s);
    if (bare) {
        if (!options.defaultUnit) return null;
        const value = parseMixed(bare[1]);
        if (value === null) return null;
        const unit = options.defaultUnit;
        return { m: toMeters(value, unit), unit, typed };
    }

    const imperial = IMPERIAL_RE.exec(s);
    if (!imperial) return null;
    const [, feetText, inchText, inchMark] = imperial;
    // A bare trailing number means inches only after a feet part (`4'6`).
    if (inchText !== undefined && inchMark === undefined && !feetText)
        return null;
    if (feetText === undefined && inchText === undefined) return null;
    const feet = feetText === undefined ? 0 : parseMixed(feetText);
    const inches = inchText === undefined ? 0 : parseMixed(inchText);
    if (feet === null || inches === null) return null;
    return {
        m: inchesToMeters(feet * 12 + inches),
        unit: inchText === undefined ? "ft" : "in",
        typed,
    };
}

/**
 * A typed value ready to store: meters, plus the typed text when it was in
 * feet or inches.
 */
export function enterLength(
    text: string,
    options: ParseOptions = {},
): Length | null {
    const parsed = parseLength(text, options);
    if (!parsed) return null;
    if (!isImperialUnit(parsed.unit)) return { m: parsed.m };
    // A bare number keeps its unit so the text re-parses on its own.
    const typed = BARE_RE.test(normalize(text))
        ? `${parsed.typed} ${parsed.unit}`
        : parsed.typed;
    return { m: parsed.m, typed };
}

/** A length in a given unit, with the text it re-displays as (`36 in`). */
export function lengthOf(value: number, unit: LengthUnit): Length {
    const m = toMeters(value, unit);
    return isImperialUnit(unit) ? { m, typed: `${value} ${unit}` } : { m };
}

// ---------------------------------------------------------------- display

/** Rounds to the nearest ⅛ in, in eighths of an inch. */
export function toEighthInches(m: number): number {
    return Math.round(fromMeters(m, "in") * 8);
}

function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
}

/** `4' 6 1/8"`, or `11 1/2"` under a foot. Rounds to the nearest ⅛ in. */
export function formatFeetInches(m: number): string {
    const eighths = toEighthInches(Math.abs(m));
    const sign = m < 0 && eighths > 0 ? "-" : "";
    const feet = Math.floor(eighths / 96);
    const rest = eighths - feet * 96;
    const whole = Math.floor(rest / 8);
    const frac = rest % 8;
    let inches = String(whole);
    if (frac > 0) {
        const d = gcd(frac, 8);
        const fraction = `${frac / d}/${8 / d}`;
        inches = whole > 0 ? `${whole} ${fraction}` : fraction;
    }
    return feet > 0 ? `${sign}${feet}' ${inches}"` : `${sign}${inches}"`;
}

/** `1.83 m`. Rounds to the nearest cm. */
export function formatMeters(m: number): string {
    const cm = Math.round(m * 100);
    return `${(cm / 100).toFixed(2)} m`;
}

/**
 * Text for a stored length. A length typed in feet or inches re-displays as
 * typed while its text still gives the stored meters; anything else rounds
 * per the measurement system (⅛ in or 1 cm).
 */
export function formatLength(
    length: Length | number,
    system: MeasurementSystem,
): string {
    const { m, typed } = typeof length === "number" ? { m: length } : length;
    if (typed !== undefined) {
        const parsed = parseLength(typed);
        if (parsed && isImperialUnit(parsed.unit) && parsed.m === m)
            return parsed.typed;
    }
    return system === "metric" ? formatMeters(m) : formatFeetInches(m);
}
