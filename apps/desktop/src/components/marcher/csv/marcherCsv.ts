import { SECTIONS } from "@/global/classes/Sections";
import type { NewMarcherArgs } from "@/db-functions";

/**
 * Importing marchers from a CSV file.
 *
 * Two layouts are supported:
 * - `section`: each row names a section; the drill number is created automatically.
 * - `drillNumber`: each row gives the drill number (e.g. "B12"); the section comes from the
 *   `section` column, or from the drill prefix when that column is absent or empty.
 *
 * `name`, `year` and `notes` are optional in both layouts.
 */
export type MarcherCsvMode = "section" | "drillNumber";

export const MARCHER_CSV_COLUMNS: Record<MarcherCsvMode, string[]> = {
    section: ["section", "name", "year", "notes"],
    drillNumber: ["drill_number", "name", "section", "year", "notes"],
};

export type MarcherCsvErrorCode =
    | "unknownSection"
    | "missingSection"
    | "missingDrillNumber"
    | "invalidDrillNumber"
    | "unknownPrefix"
    | "ambiguousPrefix"
    | "duplicateInFile"
    | "duplicateInShow";

export interface MarcherCsvRowError {
    code: MarcherCsvErrorCode;
    /** The offending value, for display */
    value?: string;
}

export interface MarcherCsvRow {
    /** 1-based line number in the file, counting the header */
    line: number;
    marcher?: NewMarcherArgs;
    error?: MarcherCsvRowError;
}

export interface MarcherCsvPlan {
    rows: MarcherCsvRow[];
    /** Header names that are not used by this layout */
    ignoredColumns: string[];
    /** Required columns that are missing from the header */
    missingColumns: string[];
}

export type ExistingDrillNumber = { drill_prefix: string; drill_order: number };

/** Every section with its drill prefix, in the order the app lists them */
export const sectionPrefixTable = () =>
    Object.values(SECTIONS)
        .sort((a, b) => a.compareTo(b))
        .map((s) => ({
            name: s.name,
            prefix: s.prefix,
            family: s.family.name,
            tName: s.tName,
        }));

const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);
const normalize = (value: string) => value.trim().toLowerCase();
const normalizeHeader = (value: string) =>
    normalize(value)
        .replace(BOM, "")
        .replace(/[\s-]+/g, "_");

const HEADER_ALIASES: Record<string, string> = {
    drill: "drill_number",
    drill_no: "drill_number",
    drill_num: "drill_number",
    number: "drill_number",
    instrument: "section",
    note: "notes",
    class: "year",
    grade: "year",
};

const canonicalHeader = (raw: string) => {
    const h = normalizeHeader(raw);
    return HEADER_ALIASES[h] ?? h;
};

/** Sections a prefix could mean. More than one means the prefix is ambiguous. */
export function sectionsForPrefix(prefix: string) {
    return Object.values(SECTIONS).filter(
        (s) => s.prefix.toLowerCase() === prefix.trim().toLowerCase(),
    );
}

/** Finds a section by its name, ignoring case and spaces (e.g. "bass drum") or, failing that, a unique prefix. */
export function findSection(value: string) {
    const v = normalize(value).replace(/[\s_-]+/g, "");
    if (!v) return undefined;
    const byName = Object.values(SECTIONS).find(
        (s) => normalize(s.name).replace(/[\s_-]+/g, "") === v,
    );
    if (byName) return byName;
    const byPrefix = sectionsForPrefix(value);
    return byPrefix.length === 1 ? byPrefix[0] : undefined;
}

/** "B12" → { prefix: "B", order: 12 }. The prefix is everything before the trailing digits. */
export function splitDrillNumber(value: string) {
    const match = /^\s*(\D+?)\s*0*(\d+)\s*$/.exec(value);
    if (!match) return undefined;
    const order = parseInt(match[2], 10);
    if (!Number.isSafeInteger(order) || order < 1) return undefined;
    return { prefix: match[1].trim(), order };
}

/**
 * Parses CSV text (RFC 4180: quoted fields, doubled quotes, newlines inside quotes, CRLF or LF).
 * Fully blank lines are skipped.
 */
export function parseCsv(text: string): { line: number; cells: string[] }[] {
    const records: { line: number; cells: string[] }[] = [];
    let cells: string[] = [];
    let cell = "";
    let inQuotes = false;
    let line = 1;
    let recordLine = 1;
    const endRecord = () => {
        cells.push(cell);
        if (cells.some((c) => c.trim() !== ""))
            records.push({ line: recordLine, cells });
        cells = [];
        cell = "";
    };
    const src = text.replace(BOM, "");
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQuotes) {
            if (ch === '"' && src[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (ch === '"') inQuotes = false;
            else {
                if (ch === "\n") line++;
                cell += ch;
            }
        } else if (ch === '"') inQuotes = true;
        else if (ch === ",") {
            cells.push(cell);
            cell = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && src[i + 1] === "\n") i++;
            endRecord();
            line++;
            recordLine = line;
        } else cell += ch;
    }
    if (cell !== "" || cells.length > 0) endRecord();
    return records;
}

type RowResult = { marcher: NewMarcherArgs } | { error: MarcherCsvRowError };
type RowContext = {
    col: (name: string) => string;
    /** drill orders in use per prefix: the show's, plus rows accepted so far */
    taken: Map<string, Set<number>>;
    existingKeys: Set<string>;
    inFile: Set<string>;
};

const takenFor = (ctx: RowContext, prefix: string) => {
    let set = ctx.taken.get(prefix);
    if (!set) ctx.taken.set(prefix, (set = new Set()));
    return set;
};

const err = (code: MarcherCsvErrorCode, value?: string): RowResult => ({
    error: { code, value },
});

function planSectionRow(ctx: RowContext): RowResult {
    const raw = ctx.col("section");
    if (!raw) return err("missingSection");
    const section = findSection(raw);
    if (!section) return err("unknownSection", raw);
    const used = takenFor(ctx, section.prefix);
    let order = 1;
    while (used.has(order)) order++;
    used.add(order);
    return {
        marcher: {
            section: section.name,
            drill_prefix: section.prefix,
            drill_order: order,
        },
    };
}

function planDrillNumberRow(ctx: RowContext): RowResult {
    const rawNumber = ctx.col("drill_number");
    if (!rawNumber) return err("missingDrillNumber");
    const parsed = splitDrillNumber(rawNumber);
    if (!parsed) return err("invalidDrillNumber", rawNumber);

    const rawSection = ctx.col("section");
    let sectionName: string;
    if (rawSection) {
        const section = findSection(rawSection);
        if (!section) return err("unknownSection", rawSection);
        sectionName = section.name;
    } else {
        const candidates = sectionsForPrefix(parsed.prefix);
        if (candidates.length === 0) return err("unknownPrefix", parsed.prefix);
        if (candidates.length > 1) return err("ambiguousPrefix", parsed.prefix);
        sectionName = candidates[0].name;
    }

    // Use the section's own casing, so "f7" collides with "F7"
    const prefix =
        sectionsForPrefix(parsed.prefix)[0]?.prefix ??
        parsed.prefix.toUpperCase();
    const key = `${prefix}\u0000${parsed.order}`;
    if (ctx.existingKeys.has(key)) return err("duplicateInShow", rawNumber);
    if (ctx.inFile.has(key)) return err("duplicateInFile", rawNumber);
    ctx.inFile.add(key);
    takenFor(ctx, prefix).add(parsed.order);
    return {
        marcher: {
            section: sectionName,
            drill_prefix: prefix,
            drill_order: parsed.order,
        },
    };
}

/**
 * Turns CSV text into the marchers to create, or a per-row error. Nothing is written.
 *
 * @param existing drill numbers already in the show; auto numbers skip them and explicit ones may not repeat them
 */
export function planMarcherCsv(
    text: string,
    mode: MarcherCsvMode,
    existing: ExistingDrillNumber[],
): MarcherCsvPlan {
    const records = parseCsv(text);
    const required = mode === "section" ? "section" : "drill_number";
    const plan: MarcherCsvPlan = {
        rows: [],
        ignoredColumns: [],
        missingColumns: [],
    };
    if (records.length === 0) {
        plan.missingColumns = [required];
        return plan;
    }

    const header = records[0].cells.map(canonicalHeader);
    if (!header.includes(required)) plan.missingColumns.push(required);
    plan.ignoredColumns = records[0].cells
        .filter((_, i) => !MARCHER_CSV_COLUMNS[mode].includes(header[i]))
        .map((h) => h.trim())
        .filter(Boolean);
    if (plan.missingColumns.length > 0) return plan;

    const taken = new Map<string, Set<number>>();
    for (const e of existing) {
        const set = taken.get(e.drill_prefix) ?? new Set<number>();
        set.add(e.drill_order);
        taken.set(e.drill_prefix, set);
    }
    const existingKeys = new Set(
        existing.map((e) => `${e.drill_prefix}\u0000${e.drill_order}`),
    );
    const inFile = new Set<string>();
    const planRow = mode === "section" ? planSectionRow : planDrillNumberRow;

    for (const { line, cells } of records.slice(1)) {
        const col = (name: string) => {
            const i = header.indexOf(name);
            return i === -1 ? "" : (cells[i] ?? "").trim();
        };
        const result = planRow({ col, taken, existingKeys, inFile });
        if ("error" in result) {
            plan.rows.push({ line, error: result.error });
        } else {
            plan.rows.push({
                line,
                marcher: {
                    ...result.marcher,
                    name: col("name") || null,
                    year: col("year") || null,
                    notes: col("notes") || null,
                },
            });
        }
    }
    return plan;
}

/** Example files offered for download, one per layout */
export function exampleMarcherCsv(mode: MarcherCsvMode): string {
    return mode === "section"
        ? [
              "section,name,year,notes",
              "Flute,Ada Lovelace,12,Section leader",
              "Flute,,11,",
              "Trumpet,Louis Armstrong,10,",
              "Snare,,,",
              "Color Guard,Jo Rivera,9,Flag",
          ].join("\n") + "\n"
        : [
              "drill_number,name,section,year,notes",
              "F1,Ada Lovelace,,12,Section leader",
              "F2,,,11,",
              "T4,Louis Armstrong,,10,",
              "C1,,,,",
              "CY1,,,,",
          ].join("\n") + "\n";
}
