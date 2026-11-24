// cspell:ignore superframe superframes
import {
    BufferGeometry,
    Float32BufferAttribute,
    Group,
    Mesh,
    MeshBasicMaterial,
    PlaneGeometry,
    Vector3,
    type CanvasTexture,
} from "three";
import { ft, repaintCanvasTexture } from "../../environment";
import type { LightingPreset, ShowCredits } from "../../types";
import { Members } from "../pro/geometry";
import { buildDieselRafterBanners } from "./banners";
import { dieselTexture, paintBoardCard, paintBoardHeader } from "./brand";
import { createBoardFeed, DIESEL_FEED, type BoardFeed } from "./feed";
import type { DieselCtx, DieselFrame, DieselPart } from "./frame";
import { ledMaterial, type LedMaterial } from "./led";
import { dieselSuperframeBottom } from "./roof";
import { dieselLighting } from "./lighting";
import { buildDieselRibbons, type RibbonOptions } from "./ribbons";
import { buildDieselSurround } from "./surround";

export { dieselRibbonLevel } from "./ribbons";

/**
 * Everything in the Mark Diesel kit that carries a name or a picture, in
 * kit-root space:
 *
 * - the two corner video boards (south-east and north-west,
 *   `dieselBoardSpots`): LED screens facing the field's center, each
 *   under a lit sign with OpenMarch's logo, hung from the roof on four rods.
 *   At high quality they show a live picture of the field (`feed.ts`); at
 *   low quality a bright card with OpenMarch's logo and the show now performing;
 * - the LED ribbons (`ribbons.ts`);
 * - the field wall's pads and the sponsor boards (`surround.ts`);
 * - the rafter banners (`banners.ts`).
 *
 * With the fixtures, the screens and the ribbons are the only things in the
 * hall that give off light.
 */

/** The screens: 97 ft by 53 ft, the size of the building's 2022 boards. */
export const DIESEL_BOARD = {
    width: ft(97),
    height: ft(53),
    /** The sign above each screen: its height, and the gap under it. */
    header: 1.8,
    headerGap: 0.15,
    /** How far the cabinet stands out around the screen. */
    margin: 0.4,
    depth: 0.9,
} as const;

const FRAME_DARK = 0x16171b;
/** Half the width of a superframe's box truss, across the building. */
const FRAME_HALF_WIDTH = 3;
/** The card's size in pixels (the screen's shape). */
const CARD = { width: 1024, height: 560 };
/** How bright the live picture is shown, over the scene it was taken from. */
const FEED_GAIN = 2;

/**
 * Height of the middle of each screen (`frame.VIDEO_BOARDS`): its foot
 * 2.5 m over the 500s' last tread, its top just under the light row, the
 * sign over it under the superframe's bottom chord.
 */
export function dieselBoardCenterY(frame: DieselFrame): number {
    return frame.VIDEO_BOARDS[0].y;
}

/** One video board: the middle of its screen, in kit-root space. */
export interface DieselBoardSpot {
    id: string;
    x: number;
    y: number;
    z: number;
}

/**
 * Where the two boards hang: where `frame.VIDEO_BOARDS` puts them, in the
 * south-east and north-west corners (the two with no 600 level), across
 * the corner over the 500s. Photo 6 shows the south-east one there, past
 * the end of the light row; from the front sideline's lower bowl it is
 * huge and seen nearly face on (photos 8, 9 and 12). The superframe's
 * chord stays level over it (`dieselSuperframeBottom`) and the catwalk
 * stops short of it.
 */
export function dieselBoardSpots(frame: DieselFrame): DieselBoardSpot[] {
    return frame.VIDEO_BOARDS.map(({ id, x, y, z }) => ({ id, x, y, z }));
}

/**
 * The way a board at (x, z) faces, as a rotation about Y of a screen that
 * faces +Z: toward the field's center. From the front sideline's lower bowl
 * the screen is nearly face on (photos 8 and 12); from the 50 it is about
 * 30 degrees off.
 */
export function dieselBoardYaw(spec: { x: number; z: number }): number {
    return Math.atan2(-spec.x, -spec.z);
}

/** How bright the boards' card and sign are shown under a preset. */
export function dieselBoardLevel(preset: LightingPreset): number {
    // By day the screens run harder, to hold up against the sunlit seats.
    return dieselLighting(preset).kit.lampsOn ? 1.15 : 1.5;
}

/** A Mark Diesel part that shows the show's credits. */
export interface DieselBoards extends DieselPart {
    setCredits(credits: ShowCredits): void;
    /** The live picture, at high quality (for tests and measurements). */
    feed: BoardFeed | null;
}

export function buildDieselBoards(
    ctx: DieselCtx,
    options: RibbonOptions = {},
): DieselBoards {
    const { frame, shared, quality } = ctx;
    const { ROOF } = frame;
    const { width, height, header, headerGap, margin, depth } = DIESEL_BOARD;
    const object = new Group();
    object.name = "markDiesel.boards";

    const ribbons = buildDieselRibbons(ctx, options);
    const dressing = [buildDieselSurround(ctx), buildDieselRafterBanners(ctx)];
    object.add(ribbons.object, ...dressing.map((part) => part.object));

    // What the screens show: the live picture, or the card.
    const feed =
        quality === "high" ? createBoardFeed(frame, width / height) : null;
    let credits: ShowCredits = { title: "" };
    const paintCard = (g: CanvasRenderingContext2D, w: number, h: number) =>
        paintBoardCard(g, w, h, credits);
    const card: CanvasTexture | null = feed
        ? null
        : dieselTexture(CARD.width, CARD.height, paintCard);
    const screenMaterial: LedMaterial = feed
        ? ledMaterial({
              map: feed.texture,
              // One diode per pixel of the picture.
              cells: [
                  DIESEL_FEED.width,
                  Math.round((DIESEL_FEED.width * height) / width),
              ],
              gain: FEED_GAIN,
          })
        : ledMaterial({
              map: card!,
              cells: [CARD.width / 2, CARD.height / 2],
          });
    if (feed) {
        object.add(feed.camera);
        // For measurements in the running app.
        object.userData.feed = feed;
    }

    const headerMap = dieselTexture(2048, 256, (g, w, h) => {
        // The sign is longer than the canvas: paint it true, then squeeze.
        const aspect = (width + 2 * margin) / header;
        g.save();
        g.scale(w / (h * aspect), 1);
        paintBoardHeader(g, h * aspect, h);
        g.restore();
    });
    const headerMaterial = new MeshBasicMaterial({ map: headerMap });
    const screenGeometry = new PlaneGeometry(width, height);
    // Both signs are one mesh: two quads, each in its board's plane.
    const signPos: number[] = [];
    const signUv: number[] = [];

    const steel = new Members();
    for (const spec of dieselBoardSpots(frame)) {
        const centerY = spec.y;
        const board = new Group();
        board.name = `markDiesel.videoBoard.${spec.id}`;
        board.position.set(spec.x, centerY, spec.z);
        const yaw = dieselBoardYaw(spec);
        board.rotation.y = yaw;

        const screen = new Mesh(screenGeometry, screenMaterial);
        screen.name = `markDiesel.videoScreen.${spec.id}`;
        screen.position.set(0, 0, depth / 2 + 0.08);
        feed?.attach(screen);

        const signY = height / 2 + margin + headerGap + header / 2;
        board.add(screen);
        object.add(board);

        // The cabinet behind the screen and the sign, and four rods from
        // the sign to the roof deck.
        const center = new Vector3(spec.x, centerY, spec.z);
        steel.box(
            center,
            [width + 2 * margin, height + 2 * margin, depth],
            FRAME_DARK,
            yaw,
        );
        const signCenter = center.clone().setY(centerY + signY);
        steel.box(
            signCenter,
            [width + 2 * margin, header, depth],
            FRAME_DARK,
            yaw,
        );
        const across = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const out = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const face = signCenter.clone().addScaledVector(out, depth / 2 + 0.08);
        const corner = (u: number, v: number) => {
            const p = face
                .clone()
                .addScaledVector(across, (u - 0.5) * (width + 2 * margin));
            signPos.push(p.x, p.y + (v - 0.5) * header, p.z);
            signUv.push(u, v);
        };
        for (const [u, v] of [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
            [1, 1],
            [0, 1],
        ])
            corner(u, v);
        for (const f of [-0.42, -0.14, 0.14, 0.42]) {
            const foot = signCenter
                .clone()
                .addScaledVector(across, f * width)
                .setY(signCenter.y + header / 2);
            // Up to the superframe's bottom chord where the rod is under
            // it, else to the roof deck.
            const underFrame =
                Math.abs(Math.abs(foot.z) - ROOF.superframes.z) <
                FRAME_HALF_WIDTH;
            const head = foot
                .clone()
                .setY(
                    underFrame
                        ? dieselSuperframeBottom(frame, foot.x)
                        : ROOF.roofY(foot.z) - ROOF.thickness,
                );
            if (head.y > foot.y) steel.beam(foot, head, 0.18, FRAME_DARK);
        }
    }
    const signGeometry = new BufferGeometry();
    signGeometry.setAttribute(
        "position",
        new Float32BufferAttribute(signPos, 3),
    );
    signGeometry.setAttribute("uv", new Float32BufferAttribute(signUv, 2));
    const signs = new Mesh(signGeometry, headerMaterial);
    signs.name = "markDiesel.boardSigns";
    object.add(signs);
    const hangers = steel.build(
        shared.unitBox,
        shared.std(0xffffff, { roughness: 0.8 }),
        "markDiesel.boardSteel",
    );
    object.add(hangers);

    const parts: DieselPart[] = [ribbons, ...dressing];
    return {
        object,
        feed,
        setLighting(preset) {
            const level = dieselBoardLevel(preset);
            if (!feed) screenMaterial.uniforms.gain.value = level;
            headerMaterial.color.setScalar(level);
            // The picture was taken under the old lighting.
            feed?.invalidate();
            parts.forEach((part) => part.setLighting(preset));
        },
        setCredits(next) {
            ribbons.setCredits(next);
            if (JSON.stringify(next) === JSON.stringify(credits)) return;
            credits = next;
            if (card) repaintCanvasTexture(card, paintCard);
        },
        onFrame(frameCtx) {
            feed?.tick(frameCtx.dt, frameCtx.cameraPosition);
            parts.forEach((part) => part.onFrame?.(frameCtx));
        },
        dispose() {
            parts.forEach((part) => part.dispose());
            feed?.dispose();
            card?.dispose();
            screenMaterial.dispose();
            screenGeometry.dispose();
            headerMap.dispose();
            headerMaterial.dispose();
            signGeometry.dispose();
            hangers.dispose();
            object.clear();
        },
    };
}
