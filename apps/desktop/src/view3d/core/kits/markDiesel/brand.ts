// cspell:ignore keyline keylined superframe superframes wordmark Lakeshore
import type { CanvasTexture } from "three";
import {
    brandArtReady,
    drawOtmLogo,
    fitText,
    paintCanvasTexture,
    repaintCanvasTexture,
    TEXTURE_FONT,
} from "../../environment";
import type { FieldCenterArt } from "../../field";
import { HELMET } from "./helmet";
import { MARCHER_MARK, OPENMARCH_LOGO } from "../../field/brandMark";
import type { ShowCredits, VenueParams } from "../../types";

/**
 * The venue's identity: everything in the hall that carries a name or a
 * logo is painted here, on canvas. The hall is Mark Diesel Stadium and
 * names no event, so any show can be on its field. Its name appears only
 * on the red suite signs (`stadiumSign.ts`); everywhere else the signage is
 * quiet: OpenMarch's marks, openmarch.com, or nothing. No other brand, real
 * or made up. The marks are OpenMarch's own, never redrawn:
 *
 * - the logo, "OPEN" over "MARCH" with the marcher standing in for the O
 *   and the M (`OPENMARCH_LOGO`, from `apps/website/public/openmarch.svg`):
 *   on the field wall's pads, the middle back sideline board, the upper LED
 *   ribbon, the video boards' header and card and the plaza's monuments,
 *   most of them beside openmarch.com or On The Move's logo;
 * - the app icon: the marcher (`MARCHER_MARK`) in white on a violet rounded
 *   square, cut off at the bottom, as in `apps/desktop/build/icon.png`: the
 *   drape's logo panel;
 * - the marcher itself (`MARCHER_MARK`): the roof flags and the midfield
 *   helmet;
 * - the On The Move logo (`drawOtmLogo`), OpenMarch's other app, on one
 *   back sideline board and, turn about with OpenMarch's, on the field
 *   wall's pads.
 *
 * The end zones say OPENMARCH. The ring of the upper deck and the other
 * sideline boards are plain. The lower LED ribbon shows the show's own
 * title (or a made-up band) and the bands up after it; the rafter banners
 * only CHAMPIONS or FINALISTS and a year.
 *
 * The colors are the app's: brand violet, its dark-theme lavender, and the
 * near-black of the app's dark theme (`packages/ui/src/tailwind.css`); the
 * type is DM Sans, the app's face, but for the red suite signs' leaning
 * serif (`stadiumSign.ts`).
 *
 * Painters take a 2D context and the face's size in pixels and nothing else,
 * so tests can run them against a recording context. The `diesel*Texture`
 * functions (named for the kit) wrap them in textures that repaint once the
 * app's font and the On The Move logo have loaded.
 */
export const OM = {
    /** LED black: the app's signage ground. */
    ink: "#07060d",
    /** The app's dark-theme background. */
    night: "#0f0e13",
    /** OpenMarch violet: the app icon, the accent, the end zones. */
    violet: "#6442ff",
    /** The accent in the app's dark theme. */
    lavender: "#967eff",
    /** Violet in shadow, for the ends of gradients and the vinyl's folds. */
    deep: "#3b23b8",
    /** The soft white the app's signage paints its logos in. */
    mist: "#cfcbe6",
    paper: "#f4f3f9",
    white: "#ffffff",
} as const;

/** The name as signage sets it in capitals. */
export const OPENMARCH_SIGN = "OPENMARCH";
/** OpenMarch's web address, as the hall's signs show it. */
export const OPENMARCH_SITE = "openmarch.com";
/** The hall's name, as its red suite signs set it (`stadiumSign.ts`). */
export const DIESEL_STADIUM = "MARK DIESEL STADIUM";

/**
 * The venue's colors and end-zone lettering for a show that has not chosen
 * its own (`KIT_VENUE_PARAMS`): OpenMarch's, the same as every kit's.
 */
export const DIESEL_VENUE_PARAMS: Readonly<VenueParams> = Object.freeze({
    homeColor: OM.violet,
    awayColor: "#c23b3b",
    endZoneText: OPENMARCH_SIGN,
    endZoneColor: OM.violet,
});

/** Cap height over font size for DM Sans and its fallbacks. */
const CAP = 0.7;

type G = CanvasRenderingContext2D;

/** Sets canvas letter spacing where supported (Chromium; not every test DOM). */
function tracking(g: G, px: number): void {
    const c = g as G & { letterSpacing?: string };
    if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
}

export interface SignTextOptions {
    color: string;
    align?: "left" | "center" | "right";
    /** Letter spacing in ems. */
    spacing?: number;
    /** Extra weight, as a stroke in ems, over DM Sans bold. */
    weight?: number;
    /** Shrinks the text to fit this width. */
    maxWidth?: number;
    /** Leans the letters right by this much width per height (an oblique). */
    slant?: number;
    /** A font family in place of DM Sans. */
    family?: string;
}

const signFont = (cap: number, family = TEXTURE_FONT) =>
    `700 ${cap / CAP}px ${family}`;

/** Width of `text` as `signText` sets it at this cap height. */
function signWidth(
    g: G,
    text: string,
    cap: number,
    spacing = 0.04,
    family?: string,
): number {
    g.font = signFont(cap, family);
    tracking(g, (spacing * cap) / CAP);
    const width = g.measureText(text).width;
    tracking(g, 0);
    return width;
}

/**
 * DM Sans bold, `cap` pixels tall, vertically centered on `cy`. Signage
 * across a hall wants a little more than bold, so the letters are also
 * stroked in their own color. Returns the width drawn.
 */
export function signText(
    g: G,
    text: string,
    x: number,
    cy: number,
    cap: number,
    options: SignTextOptions,
): number {
    const { color, align = "left", spacing = 0.04, family } = options;
    // Leaning letters reach `slant` cap heights further right at the top:
    // count that in the width, so the run fits and centers as a whole.
    const slant = options.slant ?? 0;
    let width = signWidth(g, text, cap, spacing, family) + slant * cap;
    if (options.maxWidth && width > options.maxWidth) {
        cap *= options.maxWidth / width;
        width = options.maxWidth;
    }
    const left =
        align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    g.save();
    // Lean the letters about the run's baseline.
    g.translate(left, cy + cap / 2);
    if (slant) g.transform(1, 0, -slant, 1, 0, 0);
    g.font = signFont(cap, family);
    tracking(g, (spacing * cap) / CAP);
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillStyle = color;
    g.strokeStyle = color;
    g.lineJoin = "round";
    g.lineWidth = ((options.weight ?? 0.025) * cap) / CAP;
    g.fillText(text, 0, 0);
    if (g.lineWidth > 0) g.strokeText(text, 0, 0);
    tracking(g, 0);
    g.restore();
    return width;
}

type Mark = {
    readonly width: number;
    readonly height: number;
    readonly paths: readonly string[];
};

/** Each mark's paths, parsed once. */
const parsed = new Map<Mark, Path2D[]>();
function markPaths(mark: Mark): Path2D[] | null {
    // Test DOMs may lack Path2D; the marks are then left out.
    if (typeof Path2D === "undefined") return null;
    let paths = parsed.get(mark);
    if (!paths) {
        paths = mark.paths.map((d) => new Path2D(d));
        parsed.set(mark, paths);
    }
    return paths;
}

/**
 * Fills a mark `height` pixels tall from its top-left corner (x, y). With
 * `keyline`, first strokes it that wide (in pixels) in another color, so it
 * stands out from a busy ground.
 */
function fillMark(
    g: G,
    mark: Mark,
    x: number,
    y: number,
    height: number,
    color: string,
    keyline?: { color: string; width: number },
): void {
    const paths = markPaths(mark);
    if (!paths) return;
    const k = height / mark.height;
    g.save();
    g.translate(x, y);
    g.scale(k, k);
    if (keyline) {
        g.strokeStyle = keyline.color;
        g.lineJoin = "round";
        g.lineWidth = (2 * keyline.width) / k;
        for (const p of paths) g.stroke(p);
    }
    g.fillStyle = color;
    for (const p of paths) g.fill(p);
    g.restore();
}

/** Logo width over height. */
export const LOGO_ASPECT = OPENMARCH_LOGO.width / OPENMARCH_LOGO.height;

/**
 * The OpenMarch logo, `height` pixels tall, centered on (cx, cy), in one
 * color. Returns its width.
 */
export function paintLogo(
    g: G,
    cx: number,
    cy: number,
    height: number,
    color: string,
    keyline?: { color: string; width: number },
): number {
    const width = height * LOGO_ASPECT;
    fillMark(
        g,
        OPENMARCH_LOGO,
        cx - width / 2,
        cy - height / 2,
        height,
        color,
        keyline,
    );
    return width;
}

/** The marcher on its own, `height` tall, from its top-left corner. */
export function paintMarcher(
    g: G,
    x: number,
    y: number,
    height: number,
    color: string,
): number {
    fillMark(g, MARCHER_MARK, x, y, height, color);
    return (height * MARCHER_MARK.width) / MARCHER_MARK.height;
}

/**
 * The app icon, `size` pixels square, centered on (cx, cy): a violet rounded
 * square with the white marcher filling its height and running off the
 * bottom edge. `edge` rings it in a color, for a violet ground.
 */
export function paintAppIcon(
    g: G,
    cx: number,
    cy: number,
    size: number,
    edge?: string,
): void {
    const x = cx - size / 2;
    const y = cy - size / 2;
    const radius = size * 0.12;
    if (edge) {
        const e = size * 0.05;
        g.beginPath();
        g.roundRect(x - e, y - e, size + 2 * e, size + 2 * e, radius + e);
        g.fillStyle = edge;
        g.fill();
    }
    g.save();
    g.beginPath();
    g.roundRect(x, y, size, size, radius);
    g.fillStyle = OM.violet;
    g.fill();
    g.clip();
    // As the icon has it: the marcher is 0.37 of the tile wide, its plume
    // just under the top edge.
    const markWidth = size * 0.37;
    const markHeight = (markWidth * MARCHER_MARK.height) / MARCHER_MARK.width;
    paintMarcher(g, cx - markWidth / 2, y + size * 0.045, markHeight, OM.white);
    g.restore();
}

/** The drape's logo panel: the app icon on a black square with a fine edge. */
export function paintLogoPanel(g: G, w: number, h: number): void {
    g.fillStyle = OM.ink;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(207,203,230,0.16)";
    g.lineWidth = Math.max(2, h * 0.006);
    g.strokeRect(h * 0.02, h * 0.02, w - h * 0.04, h - h * 0.04);
    paintAppIcon(g, w / 2, h / 2, Math.min(w, h) * 0.78);
}

/**
 * One tile of the padded field wall (16 wall heights long): dark vinyl pads
 * with their seams, then in turn OpenMarch's logo, On The Move's and
 * openmarch.com, small, in lavender.
 */
export function paintWallPad(g: G, w: number, h: number): void {
    const sheen = g.createLinearGradient(0, 0, 0, h);
    sheen.addColorStop(0, "#2a2640");
    sheen.addColorStop(0.16, "#1c1930");
    sheen.addColorStop(1, "#110f1c");
    g.fillStyle = sheen;
    g.fillRect(0, 0, w, h);
    // Eight pads a tile, each with a seam.
    for (let i = 0; i < 8; i++) {
        const x = (i * w) / 8;
        g.fillStyle = "rgba(0,0,0,0.45)";
        g.fillRect(x - 2, 0, 4, h);
        g.fillStyle = "rgba(255,255,255,0.06)";
        g.fillRect(x + 2, 0, 2, h);
    }
    // The rolled top edge.
    g.fillStyle = "rgba(255,255,255,0.1)";
    g.fillRect(0, 0, w, h * 0.05);
    // A third of the tile each, centered: OpenMarch, On The Move, the site.
    paintLogo(g, w / 6, h * 0.53, h * 0.56, OM.lavender);
    drawOtmLogo(
        g,
        { x: w / 2 - w * 0.08, y: h * 0.25, w: w * 0.16, h: h * 0.56 },
        OM.lavender,
    );
    signText(g, OPENMARCH_SITE, (5 * w) / 6, h * 0.53, h * 0.24, {
        color: OM.lavender,
        align: "center",
        spacing: 0.06,
        weight: 0,
        maxWidth: w * 0.26,
    });
}

/**
 * One tile of the upper deck's fascia: plain black, with a fine light line
 * along each edge.
 */
export function paintNameRing(g: G, w: number, h: number): void {
    g.fillStyle = OM.ink;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.1)";
    g.fillRect(0, 0, w, 2);
    g.fillRect(0, h - 2, w, 2);
}

/** What the lower LED ribbon shows. */
export interface DieselRibbonState {
    /** The show's title; blank puts the first of `bands` on instead. */
    title: string;
    /** Made-up bands for the order of appearance (`dieselBandNames`). */
    bands: string[];
}

/**
 * Places and nouns the order of appearance draws its made-up bands from,
 * "Virginia Anthem" or "Detroit Headphones". The nouns steer clear of real
 * drum corps' and bands' names.
 */
const BAND_PLACES = [
    "Virginia",
    "Detroit",
    "Ohio Valley",
    "Tucson",
    "Lakeshore",
    "Sacramento",
    "Tampa Bay",
    "Twin Cities",
    "Gulf Coast",
    "Hudson Valley",
    "Prairie",
    "Charlotte",
    "Boise",
    "Chesapeake",
    "Ozark",
    "High Desert",
];
const BAND_NOUNS = [
    "Anthem",
    "Headphones",
    "Lanterns",
    "Comets",
    "Metronomes",
    "Typewriters",
    "Lighthouses",
    "Paper Planes",
    "Satellites",
    "Fireflies",
    "Pendulums",
    "Kites",
    "Compass",
    "Echo",
    "Overture",
    "Tuning Forks",
];

/**
 * `count` different made-up band names, place then noun, drawn with
 * `random` (0 to 1, like `Math.random`).
 */
export function dieselBandNames(
    count: number,
    random: () => number = Math.random,
): string[] {
    const pick = <T>(list: readonly T[]) =>
        list[Math.min(list.length - 1, Math.floor(random() * list.length))];
    const names: string[] = [];
    for (let tries = 0; names.length < count && tries < count * 20; tries++) {
        const name = `${pick(BAND_PLACES)} ${pick(BAND_NOUNS)}`;
        if (!names.includes(name)) names.push(name);
    }
    return names;
}

/** The ribbons' state with a blank title, for the first paint. */
export function dieselRibbonState(
    random: () => number = Math.random,
): DieselRibbonState {
    return { title: "", bands: dieselBandNames(3, random) };
}

/** A hairline along both edges, the one constant all the way round. */
function ledEdges(g: G, w: number, h: number, color: string): void {
    g.fillStyle = color;
    g.fillRect(0, 0, w, Math.max(2, h * 0.03));
    g.fillRect(0, h - Math.max(2, h * 0.03), w, Math.max(2, h * 0.03));
}

/**
 * One tile of the lower LED ribbon (32 ribbon heights long), left to right:
 * a violet block fading into the black, the show now performing (its title, or a made-up band), and the two bands
 * up after it.
 */
export function paintRibbonLower(
    g: G,
    w: number,
    h: number,
    state: DieselRibbonState,
): void {
    const u = w / 32;
    g.fillStyle = OM.ink;
    g.fillRect(0, 0, w, h);

    // A violet block at the head of the tile, fading into the black.
    const block = g.createLinearGradient(0, 0, 6 * u, 0);
    block.addColorStop(0, OM.violet);
    block.addColorStop(0.7, OM.deep);
    block.addColorStop(1, OM.ink);
    g.fillStyle = block;
    g.fillRect(0, 0, 6 * u, h);

    // The order of appearance: a label over each name, a violet rule
    // between them.
    const [first = "", ...rest] = state.bands;
    const title = state.title.trim();
    const slots: [string, string, number, number][] = [
        ["NOW PERFORMING", title || first, 6.6 * u, 10 * u],
        ["UP NEXT", (title ? first : rest[0]) ?? "", 17.6 * u, 6.6 * u],
        ["ON DECK", (title ? rest[0] : rest[1]) ?? "", 25.2 * u, 6.4 * u],
    ];
    for (const [label, name, x, room] of slots) {
        g.fillStyle = OM.violet;
        g.fillRect(x - 0.6 * u, h * 0.2, 0.06 * u, h * 0.6);
        signText(g, label, x, h * 0.27, h * 0.16, {
            color: OM.lavender,
            spacing: 0.16,
            weight: 0,
        });
        g.fillStyle = OM.white;
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.fillText(
            fitText(g, name, 700, h * 0.42, h * 0.24, room),
            x,
            h * 0.64,
        );
    }
    ledEdges(g, w, h, "rgba(100,66,255,0.6)");
}

/**
 * One tile of the upper LED ribbon, black and quiet: OpenMarch's logo in
 * the first half and its web address in the second, each centered in its
 * half, so the two alternate all the way round.
 */
export function paintRibbonUpper(g: G, w: number, h: number): void {
    g.fillStyle = OM.ink;
    g.fillRect(0, 0, w, h);
    paintLogo(g, w / 4, h / 2, h * 0.8, OM.white);
    signText(g, OPENMARCH_SITE, (3 * w) / 4, h / 2, h * 0.32, {
        color: OM.mist,
        align: "center",
        spacing: 0.04,
        maxWidth: w * 0.4,
    });
    ledEdges(g, w, h, "rgba(255,255,255,0.12)");
}

/**
 * The sign over each video board: OpenMarch's logo in lit white, between
 * two lavender rules.
 */
export function paintBoardHeader(g: G, w: number, h: number): void {
    g.fillStyle = "#0b0a10";
    g.fillRect(0, 0, w, h);
    const nameW = paintLogo(g, w / 2, h / 2, h * 0.72, OM.white);
    g.fillStyle = OM.lavender;
    for (const side of [-1, 1]) {
        const x0 = w / 2 + side * (nameW / 2 + h * 0.5);
        const x1 = w / 2 + side * (w / 2 - h * 0.5);
        g.fillRect(Math.min(x0, x1), h * 0.48, Math.abs(x1 - x0), h * 0.04);
    }
}

/**
 * The card a video board shows when it has no live picture: OpenMarch's
 * logo, and the show now performing, bright on violet.
 */
export function paintBoardCard(
    g: G,
    w: number,
    h: number,
    credits: ShowCredits,
): void {
    const ground = g.createLinearGradient(0, 0, w, h);
    ground.addColorStop(0, OM.violet);
    ground.addColorStop(0.55, OM.deep);
    ground.addColorStop(1, OM.night);
    g.fillStyle = ground;
    g.fillRect(0, 0, w, h);
    const logoHeight = h * 0.36;
    paintLogo(
        g,
        h * 0.12 + (logoHeight * LOGO_ASPECT) / 2,
        h * 0.4,
        logoHeight,
        OM.white,
    );

    // The lower third: the show now performing.
    g.fillStyle = "rgba(7,6,13,0.84)";
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = OM.lavender;
    g.fillRect(0, h * 0.78, w, h * 0.012);
    const heading = credits.text?.heading ?? "Now performing";
    const title = credits.title || credits.text?.untitled || "OpenMarch";
    signText(g, heading.toLocaleUpperCase(), h * 0.1, h * 0.84, h * 0.036, {
        color: OM.lavender,
        spacing: 0.16,
        weight: 0,
        maxWidth: w - h * 0.2,
    });
    g.fillStyle = OM.white;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(
        fitText(g, title, 700, h * 0.085, h * 0.05, w - h * 0.2),
        h * 0.1,
        h * 0.925,
    );
}

/** What one sideline board shows. */
export type SponsorFace =
    /** OpenMarch's stacked logo. */
    | "logo"
    /** The On The Move app's logo. */
    | "otm"
    /** OpenMarch's web address, on the long middle board. */
    | "site"
    /** Nothing: a dark board. */
    | "blank";

/** One board on the back sideline. */
export interface SponsorPanel {
    /** Meters wide; every board is `SPONSOR_HEIGHT` tall. */
    width: number;
    face: SponsorFace;
    ground: string;
    color: string;
}

/** Height of the sponsor boards, meters. */
export const SPONSOR_HEIGHT = 1;

const board = (
    face: SponsorFace,
    ground: string,
    color: string,
    width = 7,
): SponsorPanel => ({ width, face, ground, color });
/** One dark board, shared so the atlas paints it once. */
const BLANK_BOARD = board("blank", OM.ink, OM.white);

/**
 * The boards along the back sideline, from the audience's left to right:
 * dark boards, then OpenMarch's logo, its web address and On The Move's
 * logo in the middle (the dark ends drop first where the row is too long).
 */
export const SPONSOR_PANELS: SponsorPanel[] = [
    BLANK_BOARD,
    BLANK_BOARD,
    BLANK_BOARD,
    BLANK_BOARD,
    board("logo", OM.ink, OM.white),
    board("site", OM.ink, OM.white, 13),
    board("otm", OM.ink, OM.white),
    BLANK_BOARD,
    BLANK_BOARD,
    BLANK_BOARD,
    BLANK_BOARD,
];

/** One sponsor board, `w` x `h` pixels. */
export function paintSponsorPanel(
    g: G,
    panel: SponsorPanel,
    w: number,
    h: number,
): void {
    g.fillStyle = panel.ground;
    g.fillRect(0, 0, w, h);
    // The frame of the board.
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = Math.max(2, h * 0.04);
    g.strokeRect(0, 0, w, h);
    const { color } = panel;
    const room = w - h * 0.7;
    switch (panel.face) {
        case "logo":
            paintLogo(g, w / 2, h / 2, h * 0.78, color);
            return;
        case "otm":
            drawOtmLogo(
                g,
                { x: h * 0.3, y: h * 0.06, w: w - h * 0.6, h: h * 0.88 },
                color,
            );
            return;
        case "site":
            signText(g, OPENMARCH_SITE, w / 2, h / 2, h * 0.36, {
                color,
                align: "center",
                spacing: 0.04,
                maxWidth: room,
            });
            return;
        case "blank":
            return;
    }
}

/** One rafter banner: what it celebrates, and the year. */
export interface RafterBanner {
    lines: string[];
    year: string;
}

/** The banners on the trusses; they repeat in this order. */
export const RAFTER_BANNERS: RafterBanner[] = [
    { lines: ["CHAMPIONS"], year: "2009" },
    { lines: ["CHAMPIONS"], year: "2013" },
    { lines: ["FINALISTS"], year: "2014" },
    { lines: ["CHAMPIONS"], year: "2016" },
    { lines: ["FINALISTS"], year: "2019" },
    { lines: ["CHAMPIONS"], year: "2022" },
    { lines: ["CHAMPIONS"], year: "2024" },
];

/** Width over height of a rafter banner. */
export const RAFTER_BANNER_ASPECT = 0.4;

/**
 * One rafter banner, `w` x `h` pixels: a lavender star, then what it
 * celebrates and the year.
 */
export function paintRafterBanner(
    g: G,
    banner: RafterBanner,
    w: number,
    h: number,
): void {
    g.fillStyle = "#22176a";
    g.fillRect(0, 0, w, h);
    // A stitched border and the pole sleeve along the top.
    g.strokeStyle = "rgba(255,255,255,0.5)";
    g.lineWidth = Math.max(2, w * 0.016);
    g.strokeRect(w * 0.06, w * 0.06, w * 0.88, h - w * 0.12);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(0, 0, w, w * 0.035);

    g.fillStyle = OM.lavender;
    star(g, w / 2, w * 0.5, w * 0.2);
    let y = w * 1.08;
    for (const line of banner.lines) {
        signText(g, line, w / 2, y, w * 0.115, {
            color: OM.white,
            align: "center",
            spacing: 0.08,
            maxWidth: w * 0.74,
        });
        y += w * 0.2;
    }
    signText(g, banner.year, w / 2, h - w * 0.36, w * 0.25, {
        color: OM.lavender,
        align: "center",
        maxWidth: w * 0.74,
    });
}

/** A five-pointed star of outer radius `r`, centered on (cx, cy). */
function star(g: G, cx: number, cy: number, r: number): void {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? r : r * 0.42;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = cx + radius * Math.cos(a);
        const y = cy + radius * Math.sin(a);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
}

/** Width over height of the flag on each superframe. */
export const DIESEL_FLAG_ASPECT = 2 / 3;

/**
 * The hall's flag, hung tall: the app icon's violet field and white marcher,
 * cut off at the bottom as on the icon, inside a white edge.
 */
export function paintDieselFlag(g: G, w: number, h: number): void {
    g.fillStyle = OM.violet;
    g.fillRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    const markWidth = w * 0.56;
    const markHeight = (markWidth * MARCHER_MARK.height) / MARCHER_MARK.width;
    paintMarcher(g, (w - markWidth) / 2, h * 0.07, markHeight, OM.white);
    g.restore();
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.lineWidth = Math.max(2, w * 0.012);
    g.strokeRect(w * 0.04, w * 0.04, w * 0.92, h - w * 0.08);
}

/** Width over height of the face of a plaza monument sign. */
export const MONUMENT_ASPECT = 2.6;

/**
 * The face of a monument sign on the plaza: OpenMarch's logo in white on
 * the app's night, over a violet foot with openmarch.com.
 */
export function paintMonument(g: G, w: number, h: number): void {
    g.fillStyle = OM.night;
    g.fillRect(0, 0, w, h);
    const foot = h * 0.2;
    g.fillStyle = OM.violet;
    g.fillRect(0, h - foot, w, foot);
    g.fillStyle = OM.lavender;
    g.fillRect(0, h - foot, w, Math.max(2, h * 0.012));
    const body = h - foot;
    paintLogo(g, w / 2, body / 2, body * 0.66, OM.white);
    signText(g, OPENMARCH_SITE, w / 2, h - foot / 2, foot * 0.38, {
        color: OM.white,
        align: "center",
        spacing: 0.06,
        maxWidth: w * 0.8,
    });
}

/** The face mask's gray-blue, as the turf drawings color it. */
const HELMET_MASK = "#a2c2d1";

/**
 * The paint at midfield: the turf drawings' helmet (`helmet.ts`), traced
 * line for line, with the OpenMarch marcher where the drawings have the
 * team's horseshoe and OpenMarch violet for its blue, in the box the
 * drawings give the midfield logo (27 ft across, 13 ft 6 in each side of
 * the 50; `FieldSurfaceInput.centerArt`).
 */
export const dieselFieldArt: FieldCenterArt = {
    aspect: HELMET.aspect,
    maxWidth: 27 * 0.3048,
    paint(g, w, h) {
        paintHelmet(g, w, h);
    },
};

/** Paints the midfield helmet into a `w` x `h` box (`dieselFieldArt`). */
export function paintHelmet(g: G, w: number, h: number): void {
    const u = Math.min(h, w / HELMET.aspect);
    g.save();
    g.translate((w - u * HELMET.aspect) / 2, (h - u) / 2);
    g.scale(u, u);
    const fill = (rings: typeof HELMET.shell, color: string) => {
        g.beginPath();
        for (const ring of rings) {
            ring.forEach(([x, y], i) =>
                i === 0 ? g.moveTo(x, y) : g.lineTo(x, y),
            );
            g.closePath();
        }
        g.fillStyle = color;
        g.fill("evenodd");
    };
    fill(HELMET.shell, OM.white);
    fill(HELMET.lines, OM.violet);
    fill(HELMET.mask, HELMET_MASK);
    // The OpenMarch marcher, as tall as the horseshoe, centered where it was.
    const [left, top, right, bottom] = HELMET.logoBox;
    const markHeight = bottom - top;
    const markWidth = (markHeight * MARCHER_MARK.width) / MARCHER_MARK.height;
    paintMarcher(
        g,
        (left + right) / 2 - markWidth / 2,
        top,
        markHeight,
        OM.violet,
    );
    g.restore();
}

type Paint = (g: G, width: number, height: number) => void;

let artReady: Promise<void> | null = null;
/**
 * Resolves once the app's face and the On The Move logo have loaded (at once
 * where they already have, or can't).
 */
function dieselArtReady(): Promise<void> {
    if (artReady) return artReady;
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    const face = '700 64px "DM Sans"';
    const font =
        !fonts || typeof fonts.load !== "function"
            ? Promise.resolve()
            : fonts.load(face).then(
                  () => undefined,
                  () => undefined,
              );
    artReady = Promise.all([font, brandArtReady()]).then(() => undefined);
    return artReady;
}

/**
 * A texture for signage: painted now, and again once the app's face and the
 * On The Move logo have loaded (a canvas waits for neither), with mipmaps
 * and the sharpest filtering the GPU has, so lettering holds up across the
 * hall. `paint` may read state that changes; `repaintCanvasTexture` shows
 * the change.
 */
export function dieselTexture(
    width: number,
    height: number,
    paint: Paint,
    options: { repeat?: boolean } = {},
): CanvasTexture {
    const texture = paintCanvasTexture(width, height, paint, {
        repeat: options.repeat,
        anisotropy: 16,
    });
    let live = true;
    texture.addEventListener("dispose", () => (live = false));
    void dieselArtReady().then(() => {
        if (live) repaintCanvasTexture(texture, paint);
    });
    return texture;
}

/** The drape's logo panel (square). */
export function dieselLogoPanelTexture(): CanvasTexture {
    return dieselTexture(1024, 1024, paintLogoPanel);
}

/** The flag on each superframe (`DIESEL_FLAG_ASPECT`). */
export function dieselFlagTexture(): CanvasTexture {
    return dieselTexture(512, 768, paintDieselFlag);
}

/** The ring of names' tile (64 m of a 2 m fascia, plain); repeats along U. */
export function dieselNameRingTexture(): CanvasTexture {
    return dieselTexture(4096, 128, paintNameRing, { repeat: true });
}

/** The plaza's monument signs (`MONUMENT_ASPECT`). */
export function dieselMonumentTexture(): CanvasTexture {
    return dieselTexture(1040, 400, paintMonument);
}

/** The field wall's tile (16 wall heights); repeats along U. */
export function dieselWallPadTexture(): CanvasTexture {
    return dieselTexture(2048, 128, paintWallPad, { repeat: true });
}
