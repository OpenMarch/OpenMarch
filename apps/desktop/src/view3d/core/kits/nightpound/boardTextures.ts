import type { CanvasTexture } from "three";
import {
    SIGN,
    creditsTexture,
    inFace,
    paintCanvasTexture,
    paintCreditsCard,
    screenGround,
    type CreditsTexture,
} from "../../environment";
import { AUX_BOARD, BOARD, BOARD_ATLAS } from "./boardPlan";

/**
 * What Nightpound's boards show. The main faces carry the show's credits
 * card; the corner wedges, the auxiliary board and the lower ring stay
 * quiet: a near-black ground with the brand purple as hairlines, and no
 * logo (`environment/signage.ts`). No sponsors.
 */

const ATLAS = 1024;

/**
 * A quiet screen in its own `w` x `h`: the dark ground with a hairline of
 * the brand purple along its top and bottom. No logo: the main faces carry
 * the only one, on the credits card.
 */
function paintQuiet(g: CanvasRenderingContext2D, w: number, h: number): void {
    screenGround(g, w, h);
    g.fillStyle = "rgba(140,120,255,0.4)";
    const line = Math.max(2, h * 0.012);
    g.fillRect(0, 0, w, line);
    g.fillRect(0, h - line, w, line);
}

/**
 * The board atlas (`BOARD_ATLAS`): the credits card on the top half, a
 * corner wedge and the auxiliary board on the bottom half. Blank credits
 * until `setCredits`.
 */
export function boardAtlasTexture(): CreditsTexture {
    const half = ATLAS / 2;
    const { wedge, aux } = BOARD_ATLAS;
    return creditsTexture(ATLAS, ATLAS, (g, credits) => {
        g.clearRect(0, 0, ATLAS, ATLAS);
        inFace(
            g,
            0,
            0,
            ATLAS,
            half,
            BOARD.faceWidth / BOARD.faceHeight,
            (w, h) => paintCreditsCard(g, w, h, credits),
        );
        // The wedge's region is as wide as its top edge, at the faces' scale.
        const wedgeW = (wedge.u1 - wedge.u0) * ATLAS;
        inFace(
            g,
            wedge.u0 * ATLAS,
            half,
            wedgeW,
            half,
            (wedgeW / ATLAS) * (BOARD.faceWidth / BOARD.faceHeight) * 2,
            (w, h) => paintQuiet(g, w, h),
        );
        inFace(
            g,
            aux.u0 * ATLAS,
            half,
            (aux.u1 - aux.u0) * ATLAS,
            half,
            AUX_BOARD.width / AUX_BOARD.height,
            (w, h) => paintQuiet(g, w, h),
        );
    });
}

/**
 * One side of the lower ring, 1024 x 128: hairlines along both edges all the
 * way round, and no logo.
 */
export function boardRingTexture(): CanvasTexture {
    return paintCanvasTexture(1024, 128, (g) => {
        inFace(
            g,
            0,
            0,
            1024,
            128,
            BOARD.ringSide / BOARD.ringHeight,
            (w, h) => {
                g.fillStyle = SIGN.ground;
                g.fillRect(0, 0, w, h);
                g.fillStyle = "rgba(140,120,255,0.5)";
                g.fillRect(0, 0, w, 3);
                g.fillRect(0, h - 3, w, 3);
            },
        );
    });
}
