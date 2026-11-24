// cspell:ignore superframe superframes tarped
import type { Object3D, Vector3Tuple } from "three";
import { ft, type SharedMaterials } from "../../environment";
import type {
    FieldFootprint,
    FrameContext,
    LightingPreset,
    VenueParams,
} from "../../types";

/**
 * The shared frame of the Mark Diesel kit: every dimension the bowl, roof,
 * drape, facade, lighting and boards agree on. The numbers come from a
 * measured cross-section: published seating charts, aerial footprints and
 * camera positions solved from photos of the field.
 *
 * Kit-root space: the origin is the FIELD CENTER at field level, +Y is up and
 * the field's long axis is X. The kit root sits at the footprint's center in
 * world space, so world = root + (footprint center x, 0, footprint center z).
 *
 *   -X  north: the operable window wall end
 *   +X  south
 *   +Z  west: the audience side (the app's front sideline, the press box side)
 *   -Z  east: the back sideline, the stand the black drape masks
 *
 * The drape hangs along the BACK SIDELINE (-Z), not across an end zone: in
 * the reference photos the yard lines run away from the camera and the drape
 * is straight ahead. The video boards hang in the south-east corner (+X, -Z;
 * the one in the photos) and the north-west corner (-X, +Z).
 */

/** What every Mark Diesel part builder gets. */
export interface DieselCtx {
    footprint: FieldFootprint;
    params: VenueParams;
    quality: "low" | "high";
    shared: SharedMaterials;
    frame: DieselFrame;
}

/** What every Mark Diesel part builder returns; the kit composes them. */
export interface DieselPart {
    /** In kit-root space; the kit adds it to its root. */
    object: Object3D;
    setLighting(preset: LightingPreset): void;
    dispose(): void;
    pickTargets?: Object3D[];
    /**
     * Per-frame hook. `cameraPosition` is in kit-root space (the kit has
     * already moved it from the world).
     */
    onFrame?(ctx: FrameContext): void;
}

export type DieselPartBuilder = (ctx: DieselCtx) => DieselPart;

/** One seating tier, as `BowlTier` (offsets from the bowl's inner outline). */
export interface FrameTier {
    /** Outline offset of the front edge, meters. */
    offset: number;
    rows: number;
    depth: number;
    rise: number;
    /** Tread height of the first row. */
    base: number;
    /** Height of the bottom of the front fascia. */
    bottom: number;
    /** Outline offset of the back edge. */
    back: number;
    /** Tread height of the last row. */
    top: number;
}

const tier = (
    offset: number,
    rows: number,
    depth: number,
    rise: number,
    base: number,
    bottom: number,
): FrameTier => ({
    offset,
    rows,
    depth,
    rise,
    base,
    bottom,
    back: offset + rows * depth,
    top: base + (rows - 1) * rise,
});

/** Roof slope, from the ridge down to the east and west eaves (13.2 degrees). */
export const ROOF_PITCH = Math.tan((13.2 * Math.PI) / 180);
/** The two sideline superframes stand 300 ft apart. */
const SUPERFRAME_Z = ft(150);
/** Top of the superframes above the event floor. */
const SUPERFRAME_TOP = ft(241);
const RIDGE_Y = SUPERFRAME_TOP + SUPERFRAME_Z * ROOF_PITCH;

/** Thickness of the roof deck. */
const ROOF_THICKNESS = 1.2;
/** Depth of a transverse truss, chord to chord (both chords are peaked). */
const TRUSS_DEPTH = 13.5;
/**
 * Outer wall half-extents: the building's footprint is 848 ft by 713 ft;
 * the side walls stand just inside it, where the eave comes down to 59 m.
 */
const BUILDING_HALF_X = 129;
const BUILDING_HALF_Z = 106;

/** Height of the roof's top surface at `z` (kit-root space). */
export function roofY(z: number): number {
    return RIDGE_Y - Math.abs(z) * ROOF_PITCH;
}

/** The frame for a field. Heights don't depend on the field; plans do. */
export function dieselFrame(footprint: FieldFootprint) {
    const FIELD_HALF_LENGTH = (footprint.maxX - footprint.minX) / 2;
    const FIELD_HALF_WIDTH = (footprint.maxZ - footprint.minZ) / 2;
    /** World position of the kit root (the field center). */
    const CENTER = {
        x: (footprint.minX + footprint.maxX) / 2,
        z: (footprint.minZ + footprint.maxZ) / 2,
    };

    // The bowl: a rounded rectangle around the field (`kits/bowl.ts`); every
    // ring is that outline offset outward by `d` meters. The numbers are the
    // measured cross-section: offsets are
    // from the field wall, which stands 14.2 m off the sidelines. The
    // outline is the north end's (8 m behind the end line); the south end's
    // wall stands further back (`front`).
    const marginX = 8;
    const marginZ = 14.2;
    /** The south end's margin: the field suites stand behind its wall. */
    const marginSouth = 10;
    const halfX = FIELD_HALF_LENGTH + marginX;
    const halfZ = FIELD_HALF_WIDTH + marginZ;
    // One bank from the field wall to the loge boxes: the 100s, a
    // cross-aisle at street level, and the 200s. The 100s start low,
    // behind the padded wall: photo 10's empty front rows, seen from its
    // camera solved off the yard lines, put row 1's seat backs about 1.7 m
    // up and each row 0.24 m above the last; photo 13, solved off the
    // fascias, puts a seated eye in row 13 at about 4.5 m. Their last row
    // stops 1.5 m under the cross-aisle, behind a blue wall (photo 13).
    const lower = tier(0, 23, 0.86, 0.24, 0.8, 0);
    /** Height of the padded field wall, in front of the 100s' first row. */
    const fieldWall = 1.2;
    /** The cross-aisle: street level, 25 ft above the field. */
    const crossAisle = ft(25);
    const loge = tier(21.2, 11, 0.8, 0.31, 9.2, crossAisle);
    // The 300s, behind LED ribbon 1, and the 400s above their back wall.
    const club = tier(30.9, 5, 0.8, 0.35, 17.2, 17.0);
    const mid = tier(35.2, 10, 0.8, 0.38, 20.5, 18.6);
    const cornerMid = tier(35.2, 15, 0.8, 0.38, 20.5, 18.6);
    // The 500s, behind the ring of names, and the 600s above their back wall.
    const terrace = tier(35.5, 5, 0.8, 0.42, 29.8, 28.4);
    const upperWest = tier(40.5, 21, 0.82, 0.59, 34.1, 31.5);
    const upperEast = tier(40.5, 26, 0.82, 0.59, 34.1, 31.5);
    const upperSouth = tier(40.5, 28, 0.82, 0.59, 34.1, 31.5);
    const cornerUpper = tier(40.5, 22, 0.82, 0.59, 34.1, 31.5);
    // The north end: a tall lower stand, an open concourse, and one high
    // deck under the window wall.
    const northLower = tier(0, 36, 0.84, 0.27, 2.3, 0);
    const northMid = tier(40, 23, 0.82, 0.55, 20.5, 18.4);
    const BOWL = {
        /** `bowlOutline` options in kit-root space. */
        outline: { centerX: 0, centerZ: 0, halfX, halfZ, cornerRadius: 16 },
        marginX,
        marginZ,
        marginSouth,
        /**
         * How the rings near the field leave the outline. The field wall
         * (offset 0) has nearly square corners, a 6 m radius where the
         * outline has 16, and at the south end it stands
         * `marginSouth - marginX` further back. Both blend back into the
         * outline over the 100s, so from the cross-aisle (offset `fade`)
         * outward every ring is the outline's. Each corner arc's center
         * moves out by `push * (1 - d / fade)` along X and Z; the south
         * end's points move by `south` times the same.
         */
        front: {
            cornerRadius: 6,
            push: 16 - 6,
            south: marginSouth - marginX,
            fade: lower.back,
        },
        /** The field wall's ends: x of the north and south walls. */
        wallX: { north: -halfX, south: halfX + marginSouth - marginX },
        halfX,
        halfZ,
        /**
         * 100 level: both sidelines, the south end and the corners. (The
         * north end has `northLower`.)
         */
        lower,
        /**
         * Top of the padded wall round the field, at offset 0. It stands
         * above the 100s' first tread, so the front row looks over it.
         */
        fieldWall,
        /**
         * Height of the cross-aisle between the 100s and the 200s (street
         * level). A wall rises to it behind the last row of the 100s.
         */
        crossAisle,
        /** 200 level, behind the cross-aisle; the same ring as `lower`. */
        loge,
        /** 300 level; its fascia is LED ribbon 1. The same ring. */
        club,
        /** 400 level (the judges' level): the sidelines and the south end. */
        mid,
        /** 400 level in the corners, which run deeper. */
        cornerMid,
        /** 500 level, behind the ring of names. The same ring as `lower`. */
        terrace,
        /** 600 level, west sideline (+Z): the press box hangs over its top. */
        upperWest,
        /** 600 level, east sideline (-Z): the stand the drape masks. */
        upperEast,
        /** 600 level, south end (+X), under the fixed window. */
        upperSouth,
        /**
         * 600 level in the north-east and south-west corners. The other two
         * corners hold the video boards.
         */
        cornerUpper,
        /** The 600 level the audience sits in: `upperWest`. */
        upper: upperWest,
        /** North end (-X): the tall lower stand. */
        northLower,
        /** North end: the 400 deck over the open concourse. */
        northMid,
        /**
         * A tunnel in each corner, for the bands' equipment and trucks: a
         * notch through the 100s at 45 degrees, `width` wide, open from the
         * field wall back to the first row that clears `height` (row
         * `lidRow`); those rows run on over it as its lid, and the tunnel
         * goes on under them for `depth`, short of the 200s' bulkheads.
         * 7.2 m by 4.8 m takes a band's equipment trucks.
         */
        cornerTunnels: {
            width: 7.2,
            height: 4.8,
            lidRow: Math.ceil((4.8 + 0.45 - lower.base) / lower.rise),
            depth: 4.5,
        },
        /**
         * The field suites: eight boxes at field level across the south
         * end, behind its wall, in front of 125 to 128. They take the
         * 100s' first `rows` rows over `halfWidth` either side of the
         * field's centerline; the rows behind run on over their roof.
         */
        fieldSuites: {
            count: 8,
            halfWidth: 12,
            rows: 9,
            /** Ring offset of the glass, behind the wall and a patio. */
            glass: 1.6,
            floor: 0,
            /** Underside of the roof slab; the first row above stands on it. */
            ceiling: 2.65,
        },
        /** The open loge boxes behind the 200s: a band of glass. */
        logeBoxes: { offset: 30.2, bottom: 13.2, top: 16.8 },
        /** Suite glass: one level, hanging over the back of the 400s. */
        suites: [{ offset: 39.0, bottom: 26.5, top: 28.3 }],
        /** The suite level's fascia: the red stadium sign and the clock. */
        suiteFascia: { offset: 37.6, bottom: 25.6, top: 26.5 },
        /**
         * LED ribbon 1: the fascia of the 300s, everywhere they run (not the
         * north end). `offset` is the outline offset of the face, which
         * looks at the field.
         */
        ribbon: { offset: club.offset, bottom: club.bottom, top: 17.9 },
        /** The fascia of the 500s along the two sidelines: the ring of names. */
        upperFascia: {
            offset: 35.2,
            bottom: terrace.bottom,
            top: terrace.base,
        },
        /**
         * LED ribbon 2: the same fascia around the four corners and the
         * south end.
         */
        ribbon2: { offset: 35.2, bottom: terrace.bottom, top: terrace.base },
        /**
         * The press box: a glazed box behind the top row of the west 600s,
         * along the whole west straight. Photos B and 7, solved, put it
         * about 44 m up; camera A alone had 48.5 to 56. Its floor sits just
         * under the last tread, so its sill is a low parapet behind the top
         * row and the glass looks out over the deck.
         */
        pressBox: {
            side: "+z" as const,
            offset: upperWest.back + 0.2,
            /** Outline offset of its back wall. */
            back: upperWest.back + 6.5,
            bottom: 45,
            sill: upperWest.top + 0.25,
            top: 49.6,
        },
    };

    // The roof: a gable whose ridge runs north-south over the 50s. Two
    // superframes (deep trusses) run the length of the building over the
    // sidelines; five transverse trusses cross them and carry the two
    // sliding panels, which part at the ridge and roll down to east and west.
    const BUILDING = {
        /** Outer wall half-extents. */
        halfX: BUILDING_HALF_X,
        halfZ: BUILDING_HALF_Z,
        cornerRadius: 6,
        /** Height of the roof's top surface at the east and west walls. */
        eaveY: roofY(BUILDING_HALF_Z),
        /** Height of the roof's top surface at the ridge (north-south). */
        ridgeY: RIDGE_Y,
        /** The roof's top surface at `z`; the end walls are gables under it. */
        roofY,
        /** The field is sunk this far below the street. */
        streetY: ft(25),
    };
    const ROOF = {
        ridgeY: RIDGE_Y,
        eaveY: BUILDING.eaveY,
        pitch: ROOF_PITCH,
        roofY,
        /** Thickness of the roof deck; the underside is `roofY(z) - this`. */
        thickness: ROOF_THICKNESS,
        /** The opening the panels uncover: 300 ft east-west by 588 ft. */
        opening: { halfX: ft(588) / 2, halfZ: SUPERFRAME_Z },
        /** Each sliding panel covers half the opening; they split at z = 0. */
        panelSplitZ: 0,
        /**
         * Superframes, along X at z = -z and +z. The bottom chord is level
         * over the middle and drops toward the columns at the ends.
         */
        superframes: {
            z: SUPERFRAME_Z,
            /** 752 ft long; the legs stand at the frames' ends, not the walls. */
            halfLength: ft(752) / 2,
            top: SUPERFRAME_TOP,
            bottomMid: SUPERFRAME_TOP - ft(58),
            bottomEnd: SUPERFRAME_TOP - ft(84),
            /**
             * The bottom chord is level out to this |x|, the head of each
             * corner leg (61 ft wide there), then drops in a short haunch.
             */
            levelHalf: ft(752) / 2 - ft(61) / 2 - ft(24),
        },
        /**
         * Transverse trusses, along Z at each x: five peaked box trusses
         * that span the 300 ft between the superframes. BOTH chords follow
         * the gable (parallel to the roof, `depth` apart), so each truss is
         * a triangle with its peak at the ridge; nothing about them is
         * level. `topY` and `bottomY` give the chord heights at `z`.
         */
        transverse: {
            xs: [-2, -1, 0, 1, 2].map((i) => i * ft(144)),
            /** Chord to chord, measured vertically: 12 to 15 m in photos. */
            depth: TRUSS_DEPTH,
            /** The same depth at the ridge and the eave (parallel chords). */
            depthRidge: TRUSS_DEPTH,
            depthEave: TRUSS_DEPTH,
            width: ft(12),
            /** They span superframe to superframe. */
            halfSpan: SUPERFRAME_Z,
            /** Top chord: just under the roof deck. */
            topY: (z: number) => roofY(z) - ROOF_THICKNESS - 0.2,
            /** Bottom chord: peaked, parallel to the top chord. */
            bottomY: (z: number) =>
                roofY(z) - ROOF_THICKNESS - 0.2 - TRUSS_DEPTH,
            /** Bottom chord at the ridge and where it meets a superframe. */
            bottomRidge: RIDGE_Y - ROOF_THICKNESS - 0.2 - TRUSS_DEPTH,
            bottomEnd: SUPERFRAME_TOP - ROOF_THICKNESS - 0.2 - TRUSS_DEPTH,
        },
        /**
         * The side roofs: outside each superframe the deck keeps falling at
         * the same pitch, over the upper decks, to the eave at the walls.
         */
        side: {
            from: SUPERFRAME_Z,
            to: BUILDING_HALF_Z,
            topAtSuperframe: SUPERFRAME_TOP,
            topAtWall: roofY(BUILDING_HALF_Z),
        },
    };

    /**
     * Height of the sports-light row (50.3 m): photos 2, 4, 6, 7 and 10,
     * solved with a free field of view, put it 50.35 m up on the
     * superframes' centerline. The walkway that carries it hangs just above
     * the lamps, from the superframes' bottom chord.
     */
    const CATWALK_Y = ROOF.superframes.bottomMid - 5.5;
    const cwX = 69;
    const cwZ = SUPERFRAME_Z;
    /**
     * The outline the fixture rows hang on, clockwise from the north-west
     * corner seen from above (closed; the last point joins the first). The
     * photos show the two sideline runs (`CATWALK_RUNS`) and a short cluster
     * at each corner, not a lit row across the ends.
     */
    const CATWALK_RING: Vector3Tuple[] = [
        [-cwX, CATWALK_Y, cwZ],
        [cwX, CATWALK_Y, cwZ],
        [cwX, CATWALK_Y, -cwZ],
        [-cwX, CATWALK_Y, -cwZ],
    ];
    /** The two straight fixture rows, each from north to south. */
    const CATWALK_RUNS: [Vector3Tuple, Vector3Tuple][] = [
        [
            [-cwX, CATWALK_Y, cwZ],
            [cwX, CATWALK_Y, cwZ],
        ],
        [
            [-cwX, CATWALK_Y, -cwZ],
            [cwX, CATWALK_Y, -cwZ],
        ],
    ];
    /** The short clusters past the ends of each run, at the corners. */
    const CATWALK_CORNERS: Vector3Tuple[] = [-1, 1].flatMap((sx) =>
        [-1, 1].map(
            (sz): Vector3Tuple => [sx * (cwX + 10), CATWALK_Y, sz * cwZ],
        ),
    );

    /**
     * The drape, on the back sideline (-Z). Two hangs: `upper` masks the
     * upper deck from the catwalk down to the ring of names and wraps both
     * back corners; `lower` hangs in front of it on cables from the catwalk,
     * from just under the ring down onto the lower bowl, and carries the
     * logo panel. The lower bowl's seats in front of it are tarped black.
     */
    const lowerDrapeZ = -(SUPERFRAME_Z + 2);
    const lowerDrapeOffset = -lowerDrapeZ - halfZ;
    const upperDrapeOffset = upperEast.offset - 0.4;
    const DRAPE = {
        side: "-z" as const,
        /** Plane of the lower hang and its extent along X. */
        z: lowerDrapeZ,
        centerX: 0,
        width: 102,
        // Its batten hangs under the suite level: the red-sign fascia, the
        // suite glass and the ring of names show between the two hangs.
        top: 22.5,
        /** Where it lands on the lower bowl's treads. */
        bottom:
            lower.base +
            Math.floor(lowerDrapeOffset / lower.depth) * lower.rise,
        upper: {
            /** Outline offset: just in front of the 600s' front wall. */
            offset: upperDrapeOffset,
            z: -(halfZ + upperDrapeOffset),
            top: CATWALK_Y - 1.5,
            /** It comes down behind the 500s to the ring of names. */
            bottom: BOWL.upperFascia.top + 0.2,
        },
        /** Cables from the catwalk to the lower hang's top batten. */
        cables: { count: 15, topY: CATWALK_Y },
        /**
         * Where the logo panel hangs on the lower hang (center), in the
         * block photo 10 puts the real banner in, solved from the yard
         * lines: between about 7.7 and 18.4 m.
         */
        banner: { x: 0, y: 12.6, width: 40, height: 12.5 },
    };

    const WINDOW_WALL = {
        /** The north end wall. */
        x: -BUILDING.halfX,
        centerZ: 0,
        width: ft(244),
        height: ft(88),
        bottom: 34,
        top: 34 + ft(88),
        panels: 6,
    };

    /**
     * The corner video boards (97 ft x 53 ft), in the two corners with no
     * 600 level, across the corner: `boardArc` round the outline's corner
     * arc from the end, on a circle just inside the 500s. Photo 6 puts the
     * south-east screen at x 1115 to 1415 px; 33 degrees lands it at 1124
     * to 1411 (at 4 degrees it sat 230 px toward the end). Each faces the
     * field's center, so the front sideline sees it nearly face on. The
     * cabinet stands outside the superframe's line (|z| 45.7), past the end
     * of the light row, and its sign stays under the superframe's bottom
     * chord, which runs level over the corners.
     */
    const boardArc = (33 * Math.PI) / 180;
    const boardRadius = BOWL.outline.cornerRadius + terrace.offset - 0.3;
    const board = {
        width: ft(97),
        height: ft(53),
        /**
         * Height of the screen's middle: the foot 2.5 m over the 500s' last
         * tread (34 m), so the screen's top stays just under the light row
         * (`CATWALK_Y`). Photo 6 shows the screen's foot about 3.5 m over
         * ribbon 2 under it, and photo 2 its top under the row's last
         * lamps.
         */
        y: terrace.top + 2.5 + ft(53) / 2,
    };
    // On the outline's corner arc: the north end's, mirrored, so the two
    // boards hang alike (the south wall's extra margin is the field's).
    const boardAt = (sx: number, sz: number) => ({
        x:
            sx *
            (halfX -
                BOWL.outline.cornerRadius +
                boardRadius * Math.cos(boardArc)),
        z:
            sz *
            (halfZ -
                BOWL.outline.cornerRadius +
                boardRadius * Math.sin(boardArc)),
    });
    const VIDEO_BOARDS = [
        { id: "southEast", ...boardAt(1, -1), ...board },
        { id: "northWest", ...boardAt(-1, 1), ...board },
    ];

    /** The center-hung speaker frame: a square truss with arrays under it. */
    const SPEAKER = { x: 0, z: 0, y: 47, size: 16, arrayBottom: 35 };

    return {
        FIELD_HALF_LENGTH,
        FIELD_HALF_WIDTH,
        CENTER,
        BOWL,
        BUILDING,
        ROOF,
        CATWALK_Y,
        CATWALK_RING,
        CATWALK_RUNS,
        CATWALK_CORNERS,
        DRAPE,
        WINDOW_WALL,
        VIDEO_BOARDS,
        SPEAKER,
    };
}

export type DieselFrame = ReturnType<typeof dieselFrame>;

/**
 * The frame for a standard football field (360 ft x 160 ft), for code that
 * wants the names as plain imports. Builders should prefer `ctx.frame`, which
 * follows the show's own field.
 */
const NOMINAL = dieselFrame({
    minX: -ft(180),
    maxX: ft(180),
    minZ: -ft(160),
    maxZ: 0,
});

export const FIELD_HALF_LENGTH = NOMINAL.FIELD_HALF_LENGTH;
export const FIELD_HALF_WIDTH = NOMINAL.FIELD_HALF_WIDTH;
export const BOWL = NOMINAL.BOWL;
export const BUILDING = NOMINAL.BUILDING;
export const ROOF = NOMINAL.ROOF;
export const CATWALK_Y = NOMINAL.CATWALK_Y;
export const CATWALK_RING = NOMINAL.CATWALK_RING;
export const CATWALK_RUNS = NOMINAL.CATWALK_RUNS;
export const CATWALK_CORNERS = NOMINAL.CATWALK_CORNERS;
export const DRAPE = NOMINAL.DRAPE;
export const WINDOW_WALL = NOMINAL.WINDOW_WALL;
export const VIDEO_BOARDS = NOMINAL.VIDEO_BOARDS;
export const SPEAKER = NOMINAL.SPEAKER;
