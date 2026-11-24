// cspell:ignore concourse downlights
import { ClampToEdgeWrapping, RepeatWrapping, type CanvasTexture } from "three";
import { createRng, paintCanvasTexture, TEXTURE_FONT } from "../../environment";

/**
 * Canvas textures of the Mark Diesel seating bowl: one seat, the street
 * concourse seen through its openings, and the section number plaques.
 * Canvas y = 0 is the texture's top (v = 1).
 */

/**
 * The building's seats: a dark navy plastic, nearly charcoal in the hall's
 * warm light (photos 10, 12 and 13), with a soft sheen along the top of
 * each back and a brighter blue edge round it.
 */
export const DIESEL_SEAT_BLUE = {
    back: "#36353e",
    rim: "#5c5b68",
    edge: "#2b2f4c",
    pan: "#2b2a33",
    gap: "#08080d",
};

/**
 * One seat, two halves: the upper half of the texture (v 0.5 to 1) is the
 * seat back, the lower half (v 0 to 0.5) the folded-up pan in front of it.
 * `u` spans one seat and repeats along the row. Flat colors with a soft
 * edge: up close it shows single seats, far away it filters to one even
 * blue instead of noise.
 */
export function dieselSeatTexture(): CanvasTexture {
    const c = DIESEL_SEAT_BLUE;
    const tex = paintCanvasTexture(
        64,
        128,
        (g, w, h) => {
            const half = h / 2;
            g.fillStyle = c.gap;
            g.fillRect(0, 0, w, h);
            const round = (
                x: number,
                y: number,
                rw: number,
                rh: number,
                r: number,
            ) => {
                g.beginPath();
                g.moveTo(x + r, y);
                g.arcTo(x + rw, y, x + rw, y + rh, r);
                g.arcTo(x + rw, y + rh, x, y + rh, r);
                g.arcTo(x, y + rh, x, y, r);
                g.arcTo(x, y, x + rw, y, r);
                g.closePath();
            };
            // The back: lighter along its top rim, where the light lands.
            const back = g.createLinearGradient(0, 0, 0, half);
            back.addColorStop(0, c.rim);
            back.addColorStop(0.16, c.back);
            back.addColorStop(1, c.pan);
            g.fillStyle = back;
            round(3, 1, w - 6, half + 8, 7);
            g.fill();
            // The molded edge round the back, a brighter blue.
            g.strokeStyle = c.edge;
            g.lineWidth = 2;
            g.stroke();
            // The pan, folded up: its underside, a little darker.
            g.fillStyle = c.gap;
            g.fillRect(0, half, w, half);
            const pan = g.createLinearGradient(0, half, 0, h);
            pan.addColorStop(0, c.back);
            pan.addColorStop(1, c.pan);
            g.fillStyle = pan;
            round(5, half + 3, w - 10, half - 8, 6);
            g.fill();
        },
        { anisotropy: 16 },
    );
    tex.wrapS = RepeatWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    return tex;
}

/** Meters of concourse one tile of `dieselConcourseTexture` spans. */
export const DIESEL_CONCOURSE_TILE = 27.4;

/**
 * The street concourse behind the lower bowl, as the dark opening under the
 * loge: columns, a far wall in warm half-light, a row of ceiling lights and
 * a few lit signs. Used as both the color and the glow of the band.
 */
export function dieselConcourseTexture(): CanvasTexture {
    return paintCanvasTexture(
        1024,
        96,
        (g, w, h) => {
            const rnd = createRng(41);
            g.fillStyle = "#050607";
            g.fillRect(0, 0, w, h);
            // The far wall: a warm, dim wash that is brightest mid-height.
            const wall = g.createLinearGradient(0, 0, 0, h);
            wall.addColorStop(0, "rgba(70,52,30,0.0)");
            wall.addColorStop(0.45, "rgba(86,64,38,0.55)");
            wall.addColorStop(1, "rgba(30,24,18,0.25)");
            g.fillStyle = wall;
            g.fillRect(0, 0, w, h);
            // Stands and doors along the far wall.
            const bays = 16;
            for (let i = 0; i < bays; i++) {
                const x = (i * w) / bays;
                const pick = rnd();
                if (pick < 0.3) {
                    g.fillStyle = "rgba(190,150,90,0.5)";
                    g.fillRect(x + 8, h * 0.34, w / bays - 16, h * 0.34);
                    g.fillStyle = ["#7d2a22", "#27408f", "#8a6a1e"][i % 3];
                    g.fillRect(x + 8, h * 0.22, w / bays - 16, h * 0.1);
                } else if (pick < 0.5) {
                    g.fillStyle = "rgba(20,18,16,0.8)";
                    g.fillRect(x + 14, h * 0.3, w / bays - 28, h * 0.7);
                }
            }
            // Ceiling lights.
            for (let x = 30; x < w; x += 64) {
                g.fillStyle = "rgba(255,214,150,0.45)";
                g.fillRect(x, 6, 8, 2);
            }
            // Columns in front of it all, at the section lines.
            g.fillStyle = "#0b0c0e";
            for (let i = 0; i < 4; i++) g.fillRect((i * w) / 4 - 9, 0, 18, h);
            g.fillRect(w - 9, 0, 9, h);
        },
        { repeat: true },
    );
}

/**
 * The atlas of `dieselSectionNumberTexture`: plaques in `columns` columns,
 * each cell `cell` pixels (2:1, as the plaques are).
 */
export const SECTION_ATLAS = { columns: 16, cell: [128, 64] as const };

/**
 * The printed sign taped to the cross-aisle wall over the directors' seats
 * (photo 13). A label for `dieselSectionNumberTexture`; its cell holds a
 * letter-size sheet, `DIRECTOR_PLACARD_ASPECT` wide for its height.
 */
export const DIRECTOR_PLACARD = "DIRECTOR VIEWING AREA";
export const DIRECTOR_PLACARD_ASPECT = 8.5 / 11;

/** Rows in the atlas for `count` labels: a power of two. */
function atlasRows(count: number): number {
    const rows = Math.max(1, Math.ceil(count / SECTION_ATLAS.columns));
    return 2 ** Math.ceil(Math.log2(rows));
}

/**
 * The texture rectangle `[u0, v0, u1, v1]` of label `index` of `count` in
 * `dieselSectionNumberTexture`. Mirrored in u, as every band seen from the
 * field is; the placard's cell is cropped to its sheet.
 */
export function sectionAtlasCell(
    index: number,
    count: number,
    placard = false,
): [number, number, number, number] {
    const { columns, cell } = SECTION_ATLAS;
    const rows = atlasRows(count);
    const c = index % columns;
    const r = Math.floor(index / columns);
    const inset = placard
        ? (1 - (DIRECTOR_PLACARD_ASPECT * cell[1]) / cell[0]) / 2
        : 0;
    return [
        (c + 1 - inset) / columns,
        1 - (r + 1) / rows,
        (c + inset) / columns,
        1 - r / rows,
    ];
}

/**
 * Section number plaques, one cell per label (`sectionAtlasCell`): white
 * numerals on the building's navy, with a thin white border. The label
 * `DIRECTOR_PLACARD` paints the directors' printed sign instead.
 */
export function dieselSectionNumberTexture(labels: string[]): CanvasTexture {
    const { columns, cell } = SECTION_ATLAS;
    const rows = atlasRows(labels.length);
    const [cw, ch] = cell;
    return paintCanvasTexture(
        cw * columns,
        ch * rows,
        (g) => {
            g.textAlign = "center";
            g.textBaseline = "middle";
            labels.forEach((label, i) => {
                const x = (i % columns) * cw;
                const y = Math.floor(i / columns) * ch;
                if (label === DIRECTOR_PLACARD) {
                    paintPlacard(g, x, y, cw, ch);
                    return;
                }
                g.fillStyle = "#0c1f5c";
                g.fillRect(x, y, cw, ch);
                g.strokeStyle = "rgba(255,255,255,0.7)";
                g.lineWidth = 2;
                g.strokeRect(x + 4, y + 4, cw - 8, ch - 8);
                g.font = `700 ${Math.round(ch * 0.66)}px ${TEXTURE_FONT}`;
                g.fillStyle = "#f2f4fa";
                g.fillText(label, x + cw / 2, y + ch * 0.54);
            });
        },
        { anisotropy: 8 },
    );
}

/** The directors' sign: a white sheet, a round logo, two lines of type. */
function paintPlacard(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    cw: number,
    ch: number,
): void {
    // The cell's sides are the wall behind the sheet.
    g.fillStyle = "#2a3a8c";
    g.fillRect(x, y, cw, ch);
    const w = DIRECTOR_PLACARD_ASPECT * ch;
    const left = x + (cw - w) / 2;
    g.fillStyle = "#f1f2f4";
    g.fillRect(left + 1, y + 1, w - 2, ch - 2);
    // Blue painter's tape across two corners.
    g.fillStyle = "#58a6dc";
    g.fillRect(left, y + 1, 8, 4);
    g.fillRect(left + w - 8, y + ch - 5, 8, 4);
    g.strokeStyle = "#3b4d8f";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(left + w / 2, y + ch * 0.24, ch * 0.1, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#1c2440";
    const [first, ...rest] = DIRECTOR_PLACARD.split(" ");
    for (const [text, at] of [
        [first, 0.52],
        [rest.join(" "), 0.68],
    ] as const) {
        g.font = `700 ${Math.round(ch * 0.11)}px ${TEXTURE_FONT}`;
        g.fillText(text, left + w / 2, y + ch * at, w - 6);
    }
}

/** Meters of suite front one tile of `dieselSuiteFrontTexture` spans. */
export const DIESEL_SUITE_TILE = 48;

/**
 * A band of suite fronts: glass between thin mullions, a pier between
 * suites, a pale slab edge above and a rail line below. On finals night
 * nearly every suite and loge box has its lights on (photos 12 and 13):
 * a warm amber room behind the glass, a row of downlights along its
 * ceiling, and people standing at the rail as dark shapes. A few are
 * dimmer. Used as both the color and the glow of the band.
 */
export function dieselSuiteFrontTexture(): CanvasTexture {
    return paintCanvasTexture(
        2048,
        128,
        (g, w, h) => {
            const rnd = createRng(97);
            g.fillStyle = "#07080b";
            g.fillRect(0, 0, w, h);
            const suites = 8;
            const sw = w / suites;
            for (let i = 0; i < suites; i++) {
                const x = i * sw;
                const lit = rnd();
                const level = lit < 0.12 ? 0.35 : 0.75 + rnd() * 0.25;
                // The room: warm walls, brightest up under the ceiling.
                const room = g.createLinearGradient(0, 10, 0, h - 16);
                room.addColorStop(0, `rgba(255,178,104,${0.85 * level})`);
                room.addColorStop(0.45, `rgba(196,118,58,${0.7 * level})`);
                room.addColorStop(1, `rgba(70,40,22,${0.8 * level})`);
                g.fillStyle = room;
                g.fillRect(x + 6, 10, sw - 12, h - 26);
                // Downlights along the ceiling.
                const lamps = 6;
                for (let k = 0; k < lamps; k++) {
                    const lx = x + ((k + 0.5) * sw) / lamps;
                    const glow = g.createRadialGradient(lx, 16, 0, lx, 16, 10);
                    glow.addColorStop(0, `rgba(255,236,196,${level})`);
                    glow.addColorStop(1, "rgba(255,200,140,0)");
                    g.fillStyle = glow;
                    g.fillRect(lx - 10, 8, 20, 18);
                }
                // People at the rail, backlit.
                const people = Math.floor(rnd() * 6);
                for (let k = 0; k < people; k++) {
                    const px = x + 14 + rnd() * (sw - 34);
                    g.fillStyle = "rgba(14,10,8,0.85)";
                    g.fillRect(px, h - 58, 9, 42);
                    g.beginPath();
                    g.arc(px + 4.5, h - 64, 5.5, 0, Math.PI * 2);
                    g.fill();
                }
                // Mullions, then the pier between suites.
                g.fillStyle = "#1a1c21";
                for (let k = 1; k < 5; k++)
                    g.fillRect(x + (k * sw) / 5 - 2, 10, 4, h - 26);
                g.fillStyle = "#4a4a48";
                g.fillRect(x - 6, 0, 12, h);
            }
            g.fillRect(w - 6, 0, 6, h);
            // The slab edge above and the drink rail below.
            g.fillStyle = "#6a6a66";
            g.fillRect(0, 0, w, 9);
            g.fillStyle = "#20232a";
            g.fillRect(0, h - 18, w, 4);
            g.fillStyle = "#2c2c2a";
            g.fillRect(0, h - 14, w, 14);
        },
        { repeat: true },
    );
}
