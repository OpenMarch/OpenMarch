// cspell:ignore concourse
import { ClampToEdgeWrapping, RepeatWrapping, type CanvasTexture } from "three";
import { drawOtmLogo, paintCanvasTexture } from "../../environment";
import {
    dieselTexture,
    OM,
    OPENMARCH_SITE,
    paintLogo,
    signText,
} from "../markDiesel/brand";

/**
 * Canvas textures for Nightpound's bowl, painted at build time. Canvas
 * y = 0 is the texture's top (v = 1).
 */

/**
 * One seat in two halves, white on transparent so the vertex colors give
 * the plastic its navy or red: the upper half (v 0.5 to 1) is the back, the
 * lower half the folded-up pan in front of it. `u` spans one seat. Drawn
 * with `alphaTest`, so the gaps between seats show the tread behind.
 */
export function nightpoundSeatTexture(): CanvasTexture {
    const tex = paintCanvasTexture(
        64,
        128,
        (g, w, h) => {
            const half = h / 2;
            g.clearRect(0, 0, w, h);
            const back = g.createLinearGradient(0, 0, 0, half);
            back.addColorStop(0, "#ffffff");
            back.addColorStop(0.14, "#c9c9c9");
            back.addColorStop(1, "#8f8f8f");
            g.fillStyle = back;
            g.beginPath();
            g.roundRect(3, 1, w - 6, half - 1, [9, 9, 2, 2]);
            g.fill();
            const pan = g.createLinearGradient(0, half, 0, h);
            pan.addColorStop(0, "#a6a6a6");
            pan.addColorStop(1, "#6e6e6e");
            g.fillStyle = pan;
            g.beginPath();
            g.roundRect(5, half + 3, w - 10, half - 5, [7, 7, 3, 3]);
            g.fill();
        },
        { anisotropy: 16 },
    );
    tex.wrapS = RepeatWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    return tex;
}

/** Meters of row one tile of `nightpoundTreadTexture` spans. */
export const TREAD_TILE = 2.4;
/** The plain band of the tread texture (no nosing), for slabs and aisles. */
export const TREAD_PLAIN: [number, number] = [0.35, 0.85];

/**
 * A concrete tread seen from above: `v` runs from the tread's front edge
 * (0), with its dark nosing strip, to its back (1), where the next riser
 * shades it; `u` runs along the row, with a faint joint per tile. White
 * enough that the vertex colors set the concrete's gray.
 */
export function nightpoundTreadTexture(): CanvasTexture {
    const tex = paintCanvasTexture(
        256,
        64,
        (g, w, h) => {
            g.fillStyle = "#e9e7e2";
            g.fillRect(0, 0, w, h);
            let seed = 11;
            const rand = () => {
                seed = (seed * 16807) % 2147483647;
                return seed / 2147483647;
            };
            for (let i = 0; i < 500; i++) {
                g.fillStyle = `rgba(${rand() < 0.5 ? "0,0,0" : "255,255,255"},${0.02 + rand() * 0.05})`;
                g.fillRect(
                    rand() * w,
                    rand() * h,
                    1 + rand() * 5,
                    1 + rand() * 2,
                );
            }
            // The back of the tread, in the shade of the seats and riser.
            const shade = g.createLinearGradient(0, 0, 0, h * 0.3);
            shade.addColorStop(0, "rgba(0,0,0,0.35)");
            shade.addColorStop(1, "rgba(0,0,0,0)");
            g.fillStyle = shade;
            g.fillRect(0, 0, w, h * 0.3);
            // The nosing along the front edge (the canvas's bottom).
            g.fillStyle = "#3a3936";
            g.fillRect(0, h - 5, w, 5);
            g.fillStyle = "rgba(0,0,0,0.3)";
            g.fillRect(0, 0, 1, h);
        },
        { anisotropy: 8 },
    );
    tex.wrapS = RepeatWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    return tex;
}

/** Width over height of one sponsor board on the end walls. */
export const BOARD_ASPECT = 4;

/** The marks the end-wall boards take turns showing (`nightpoundBoardTexture`). */
export const BOARD_MARKS = 3;

/**
 * The boards on the end walls: black, with a white mark, three to the
 * texture, top to bottom: the OpenMarch logo, the On The Move logo and the
 * address (as Mark Diesel's wall pads). `u` spans one board; mark `j`
 * spans v from `1 - (j + 1) / BOARD_MARKS` to `1 - j / BOARD_MARKS`.
 */
export function nightpoundBoardTexture(): CanvasTexture {
    const tex = dieselTexture(1024, 256 * BOARD_MARKS, (g, w, h) => {
        const tile = h / BOARD_MARKS;
        for (let k = 0; k < BOARD_MARKS; k++) {
            const y = k * tile;
            g.fillStyle = "#0b0b0c";
            g.fillRect(0, y, w, tile);
            g.strokeStyle = "rgba(255,255,255,0.22)";
            g.lineWidth = 4;
            g.strokeRect(8, y + 8, w - 16, tile - 16);
            if (k === 0)
                paintLogo(g, w / 2, y + tile / 2, tile * 0.5, OM.white);
            else if (k === 1)
                drawOtmLogo(
                    g,
                    {
                        x: w * 0.2,
                        y: y + tile * 0.2,
                        w: w * 0.6,
                        h: tile * 0.6,
                    },
                    OM.white,
                );
            else
                signText(g, OPENMARCH_SITE, w / 2, y + tile / 2, tile * 0.26, {
                    color: OM.white,
                    align: "center",
                    spacing: 0.08,
                    maxWidth: w * 0.84,
                });
        }
    });
    tex.wrapS = RepeatWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    return tex;
}
