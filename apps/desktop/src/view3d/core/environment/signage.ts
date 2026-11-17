import type { CanvasTexture } from "three";
import type { CreditsText, ShowCredits } from "../types";
import {
    drawOpenMarchLogo,
    drawOtmLogo,
    fitText,
    paintWithOtmLogo,
} from "./brand";
import {
    paintCanvasTexture,
    repaintCanvasTexture,
    TEXTURE_FONT,
} from "./textures";

/**
 * Venue signage shared by every kit: video boards that show the show's
 * credits, an On The Move ad, and a quiet LED ribbon with the OpenMarch and
 * On The Move logos. Signage stays calm: a near-black ground, soft
 * lavender-white marks and the brand purple only as hairlines, so nothing
 * competes with the performers. No copy beyond the credits.
 */
export const SIGN = {
    /** Board background: LED black with a hint of violet. */
    ground: "#07060d",
    /** Brand purple, for hairlines and small accents only. */
    purple: "#6442ff",
    /** Logos on the boards: a soft white, never pure. */
    mark: "#cfcbe6",
    /** The On The Move logo's tint: muted brand lavender. */
    otm: "#a99cf2",
    /** Primary and secondary text on the screens. */
    text: "#ecebf3",
    muted: "rgba(236,235,243,0.56)",
    label: "rgba(185,168,255,0.62)",
} as const;

/** Sets canvas letter spacing where supported (Chromium; not every test DOM). */
function tracking(g: CanvasRenderingContext2D, px: number): void {
    const c = g as CanvasRenderingContext2D & { letterSpacing?: string };
    if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
}

/**
 * Runs `draw` in a face's own coordinates: `w` x `h` square pixels with
 * `w = h * aspect`, squeezed into the canvas region (x, y, regionW, h). Lets
 * a face of any shape be painted true on a fixed-size canvas.
 */
export function inFace(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    regionW: number,
    h: number,
    aspect: number,
    draw: (w: number, h: number) => void,
): void {
    const w = h * aspect;
    g.save();
    g.beginPath();
    g.rect(x, y, regionW, h);
    g.clip();
    g.translate(x, y);
    g.scale(regionW / w, 1);
    draw(w, h);
    g.restore();
}

/** A screen's ground: flat near black with the faintest lift toward the top. */
export function screenGround(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
): void {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#0e0c19");
    bg.addColorStop(1, "#08070e");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
}

/** The board's words in English, for callers without translations. */
function englishText(credits: ShowCredits): CreditsText {
    return {
        heading: "Now performing",
        untitled: "Untitled show",
        designer: credits.designer && `Designed by ${credits.designer}`,
        client: credits.client && `For ${credits.client}`,
    };
}

/**
 * The credits card, set like a title card: "NOW PERFORMING", the title, a
 * short purple rule, "Designed by" and "For" (when set), and the
 * OpenMarch logo as the signature. Painted in a `w` x `h` face (h ~512).
 */
export function paintCreditsCard(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    credits: ShowCredits,
): void {
    screenGround(g, w, h);
    g.textAlign = "center";
    g.textBaseline = "middle";
    // Sizes follow the face height, so short and tall boards look alike.
    const s = h / 512;
    const cx = w / 2;
    const text = credits.text ?? englishText(credits);
    const lines = [text.designer, text.client].filter((l): l is string => !!l);
    // Label, title, rule, then the lines; centered as a block.
    const block = (46 + 104 + 44 + lines.length * 52) * s;
    let y = (h - 104 * s - block) / 2 + 12 * s;
    g.fillStyle = SIGN.label;
    g.font = `600 ${24 * s}px ${TEXTURE_FONT}`;
    tracking(g, 6 * s);
    g.fillText(
        fitText(
            g,
            text.heading.toLocaleUpperCase(),
            600,
            24 * s,
            16 * s,
            w - 200 * s,
        ),
        cx,
        y,
    );
    tracking(g, 0);
    y += (46 + 52) * s;
    g.fillStyle = SIGN.text;
    const title = credits.title || text.untitled;
    g.fillText(fitText(g, title, 600, 92 * s, 40 * s, w - 160 * s), cx, y);
    y += (52 + 34) * s;
    g.fillStyle = SIGN.purple;
    g.fillRect(cx - 36 * s, y - 1.5 * s, 72 * s, 3 * s);
    y += (10 + 30) * s;
    g.fillStyle = SIGN.muted;
    for (const l of lines) {
        g.fillText(fitText(g, l, 400, 34 * s, 20 * s, w - 200 * s), cx, y);
        y += 52 * s;
    }
    drawOpenMarchLogo(g, cx, h - 70 * s, 64 * s, "rgba(207,203,230,0.72)");
}

/** An On The Move ad: the logo alone, centered on the screen ground. */
export function paintOtmAd(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
): void {
    screenGround(g, w, h);
    const lh = Math.min(h * 0.32, w * 0.25);
    drawOtmLogo(
        g,
        { x: w * 0.14, y: h / 2 - lh / 2, w: w * 0.72, h: lh },
        SIGN.otm,
    );
}

/** A texture that repaints with new credits; see `creditsBoardTexture`. */
export interface CreditsTexture {
    texture: CanvasTexture;
    setCredits(credits: ShowCredits): void;
}

/**
 * Wraps a credits painter in a canvas texture that starts with blank credits
 * and repaints (the logo's late repaint included) with the latest ones.
 */
export function creditsTexture(
    width: number,
    height: number,
    paint: (g: CanvasRenderingContext2D, credits: ShowCredits) => void,
): CreditsTexture {
    let credits: ShowCredits = { title: "" };
    const draw = (g: CanvasRenderingContext2D) => paint(g, credits);
    const texture = paintCanvasTexture(width, height, draw);
    paintWithOtmLogo(texture, draw);
    let last = JSON.stringify(credits);
    return {
        texture,
        setCredits(next) {
            const key = JSON.stringify(next);
            if (key === last) return;
            last = key;
            credits = next;
            repaintCanvasTexture(texture, draw);
        },
    };
}

/** A single video board face of `aspect` (width / height) with the credits card. */
export function creditsBoardTexture(aspect: number): CreditsTexture {
    return creditsTexture(1024, 512, (g, credits) => {
        g.clearRect(0, 0, 1024, 512);
        inFace(g, 0, 0, 1024, 512, aspect, (w, h) =>
            paintCreditsCard(g, w, h, credits),
        );
    });
}

/**
 * The LED ribbon's layout. One texture tile spans `tileHeights` band heights
 * (the 2048 x 128 texture is squeezed along U, so marks are painted narrower
 * to read true on the band). Each tile carries two ads with long dark
 * stretches between: the OpenMarch logo at `firstAd` and the On The Move
 * logo half a tile on. `quiet` is a U with nothing on it but the hairlines,
 * for bands that should stay dark.
 */
export const SIGN_RIBBON = {
    tileHeights: 32,
    firstAd: 0.25,
    quiet: 0.5,
} as const;
const RIBBON_W = 2048;
const RIBBON_H = 128;

function paintRibbon(g: CanvasRenderingContext2D): void {
    const W = RIBBON_W;
    const H = RIBBON_H;
    g.fillStyle = SIGN.ground;
    g.fillRect(0, 0, W, H);
    // Hairlines along both edges, the one constant all the way round.
    g.fillStyle = "rgba(140,120,255,0.32)";
    g.fillRect(0, 0, W, 2);
    g.fillRect(0, H - 2, W, 2);
    // Each ad is drawn in square "band pixels" and squeezed onto the tile.
    const k = W / (SIGN_RIBBON.tileHeights * H);
    const slot = (u: number, draw: () => void) => {
        g.save();
        g.translate(u * W, 0);
        g.scale(k, 1);
        draw();
        g.restore();
    };
    const a = SIGN_RIBBON.firstAd;
    slot(a, () => drawOpenMarchLogo(g, 0, H / 2, 80, SIGN.mark));
    slot(a + 0.5, () =>
        drawOtmLogo(g, { x: -200, y: H / 2 - 38, w: 400, h: 76 }, SIGN.otm),
    );
}

/**
 * The quiet LED ribbon (see `SIGN_RIBBON`). Bands using it should set their
 * texture tile to `SIGN_RIBBON.tileHeights` times the band's height.
 */
export function signRibbonTexture(): CanvasTexture {
    const tex = paintCanvasTexture(RIBBON_W, RIBBON_H, paintRibbon, {
        repeat: true,
    });
    paintWithOtmLogo(tex, paintRibbon);
    return tex;
}

/**
 * A banner in its own `w` x `h` coordinates: a fabric field with the
 * OpenMarch logo upright near the top and a lavender hairline under it.
 * `pointed` cuts a swallow point at the bottom (rafter banners); otherwise
 * the field is a plain rectangle (wall banners).
 */
export function paintLogoBanner(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    fabric: string,
    pointed: boolean,
): void {
    const s = h / 512;
    g.fillStyle = fabric;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, 0);
    if (pointed) {
        g.lineTo(w, 462 * s);
        g.lineTo(w / 2, 508 * s);
        g.lineTo(0, 462 * s);
    } else {
        g.lineTo(w, h);
        g.lineTo(0, h);
    }
    g.closePath();
    g.fill();
    const logoH = Math.min(62 * s, (w * 0.78) / 1.8);
    drawOpenMarchLogo(g, w / 2, 112 * s, logoH, "#e6e3f2");
    g.fillStyle = "rgba(169,156,242,0.7)";
    g.fillRect(w / 2 - 22 * s, 112 * s + logoH / 2 + 32 * s, 44 * s, 2 * s);
}
