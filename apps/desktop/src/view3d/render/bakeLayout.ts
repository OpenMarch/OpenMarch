/**
 * Where each channel's rows go in the bake texture (performer-behavior.md
 * section 8.3, "Bake per channel"). Feet clips, Horn/Equipment holds and
 * transitions, and Body rows are laid out one channel after another, so
 * rows add up across channels instead of multiplying (clips × holds).
 *
 * A row is one sample of every bone's skinning matrix, four texels a bone
 * (a column each). An entry of `frames` samples takes `frames + 1` rows: the
 * closing sample lets playback blend across a loop's seam. Rows wrap into
 * columns of `maxRows` (WebGL2 guarantees 2048), each column a row of bones
 * wide. Pure: no three.js.
 */

/** The channels that own bake rows. Facing has none: it turns the instance. */
export type BakeChannel = "feet" | "horn" | "body";

export const BAKE_CHANNELS: readonly BakeChannel[] = ["feet", "horn", "body"];

/** Samples per count, the clips' own rate. */
export const SAMPLES_PER_COUNT = 30;

/** Texture width (and height) every WebGL2 system supports. */
export const MAX_TEXTURE = 4096;

export interface BakeEntry {
    name: string;
    channel: BakeChannel;
    /** Samples in the entry, not counting the closing one. */
    frames: number;
}

/** Where an entry's rows start, how many samples, and how many counts they span. */
export interface ChannelRow {
    row: number;
    frames: number;
    counts: number;
    channel: BakeChannel;
}

export interface BakeLayout {
    rows: Record<string, ChannelRow>;
    /** Rows in all. */
    total: number;
    /** Each channel's first row and row count. */
    channels: Record<BakeChannel, { first: number; rows: number }>;
    bones: number;
    rowsPerColumn: number;
    columns: number;
    /** Texture width in texels: bones × 4 × columns. */
    width: number;
}

export interface BakeLayoutOptions {
    /** Bones per row (the skeleton's, plus any prop bones). */
    bones: number;
    samplesPerCount?: number;
    maxRows?: number;
    maxWidth?: number;
}

export function bakeLayout(
    entries: readonly BakeEntry[],
    {
        bones,
        samplesPerCount = SAMPLES_PER_COUNT,
        maxRows = 2048,
        maxWidth = MAX_TEXTURE,
    }: BakeLayoutOptions,
): BakeLayout {
    const rows: Record<string, ChannelRow> = {};
    const channels = {} as BakeLayout["channels"];
    let total = 0;
    for (const channel of BAKE_CHANNELS) {
        const first = total;
        for (const e of entries) {
            if (e.channel !== channel) continue;
            if (e.name in rows)
                throw new Error(`bakeLayout: row ${e.name} named twice`);
            rows[e.name] = {
                row: total,
                frames: e.frames,
                counts: e.frames / samplesPerCount,
                channel,
            };
            total += e.frames + 1;
        }
        channels[channel] = { first, rows: total - first };
    }
    const rowsPerColumn = Math.max(1, Math.min(total, maxRows));
    const columns = Math.max(1, Math.ceil(total / rowsPerColumn));
    const width = bones * 4 * columns;
    if (width > maxWidth)
        throw new Error(
            `bakeLayout: ${total} rows need a texture ${width} texels wide, over ${maxWidth}`,
        );
    return { rows, total, channels, bones, rowsPerColumn, columns, width };
}

/** The texel (x, y) holding bone `bone`'s first matrix column in row `row`. */
export function rowTexel(
    layout: Pick<BakeLayout, "rowsPerColumn" | "bones">,
    row: number,
    bone: number,
): [x: number, y: number] {
    const col = Math.floor(row / layout.rowsPerColumn);
    return [
        col * layout.bones * 4 + bone * 4,
        row - col * layout.rowsPerColumn,
    ];
}
