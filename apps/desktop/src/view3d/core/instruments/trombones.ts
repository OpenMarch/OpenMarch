/**
 * The slide trombones (docs/3d/instruments.md §3, §4): tenor and bass,
 * assembled from `hornKit` parts. Each is laid out from side views of the
 * real instrument: distances along the horn from the mouthpiece rim, and
 * heights in the bell section's own plane. Only proportions come from the
 * reference pages; no image, mark or model name is used.
 *
 * Instrument frame: origin at the right hand's grip on the moving slide
 * brace, +Z toward the bell and the slide's bow, +X the performer's left.
 * The slide's two tubes lie in the XZ plane. The mouthpiece is on the
 * performer's right tube; the left tube runs on back through the bell
 * section, whose plane stands over the slide at the "vee" a trombone is
 * assembled to, so the bell tube sits above the slide; the bell also toes
 * a few degrees away from the slide, which is what lets its rim clear it.
 *
 * The tubing is one air path: mouthpiece, down the first slide tube, round
 * the slide bow, back up the second, through the gooseneck past the
 * player's ear to the tuning slide's bow, and forward through the bell. The
 * bass adds an F attachment: a rotor in the gooseneck with one loop that
 * leaves and returns to its casing, sized to lower the horn a fourth.
 * Pure: no three.js.
 */
import {
    bellFlare,
    bentPath,
    hornKit,
    pathLength,
    taper,
    type Corner,
    type Horn,
} from "./hornKit";
import {
    smoothTube,
    PART_BLACK,
    PART_CHROME,
    PART_METAL,
    type Piece,
    type Vec3,
} from "./mesh";
import type { Detail } from "./model";

/** A fourth below: what an F attachment adds, as a fraction of the open length. */
export const F_ATTACHMENT_RATIO = 2 ** (5 / 12) - 1;

interface Trombone {
    /** The open horn's sounding length for its key (slide closed), rim to bell. */
    openLength: number;
    /** How far the rim sits behind the grip with the slide closed. */
    rimBack: number;
    /** The angle between the slide's plane and the bell section's. */
    vee: number;
    /** How far the bell section's axis toes away from the slide's, in its own plane. */
    toe: number;
    /** Mouthpiece size against a small-shank tenor's. */
    mouthpiece: number;
    slide: {
        /** Half the spacing of the two tubes. */
        half: number;
        /** Inner and outer tube radii. */
        inner: number;
        outer: number;
        /** The bumper's tip: the horn's front end, from the grip. */
        tip: number;
        /** The fixed brace the left hand holds, from the rim. */
        fixedBrace: number;
    };
    bell: {
        /** The rim, from the mouthpiece rim. */
        rim: number;
        /** The bell tube's height over the gooseneck where they join the slide. */
        height: number;
        /** The bell tube's length from the tuning slide to the rim. */
        length: number;
        /** Radius at its tail and at the rim, and the flare's Bessel exponent. */
        tail: number;
        radius: number;
        gamma: number;
    };
    tuning: {
        /** The bow's rearmost point (the horn's back end), from the rim. */
        rear: number;
        /** The spacing of the tuning slide's legs. */
        width: number;
        /** Tube radius entering the bow, and leaving it for the bell. */
        radii: [number, number];
        /** Where the lower and upper legs' nickel sleeves end. */
        sleeves: [number, number];
        /** A counterweight on the bow's brace: its place and radius. */
        weight?: { s: number; r: number };
    };
    /** Where the slide locks into the bell section. */
    joint: number;
    /** Braces across the bell section: place, and whether nickel. */
    braces: { s: number; nickel: boolean; r: number }[];
    /** The F attachment. */
    valve?: {
        /** The rotor's center and casing radius. */
        s: number;
        u: number;
        r: number;
        /** The wrap's tube radius, and how far its turns sit either side of the plane. */
        tube: number;
        depth: number;
        /** Heights of the wrap's runs: under the bell, along the gooseneck, and the inner turn's lower run. */
        top: number;
        low: number;
        mid: number;
        /** Where the wrap's bows turn: the inner and outer front bows, and the two rear bows before the loop is sized. */
        frontInner: number;
        frontOuter: number;
        rearOuter: number;
        rearInner: number;
    };
}

const TENOR: Trombone = {
    // in Bb: about 2.75 m of tubing with the slide closed
    openLength: 2.75,
    rimBack: 0.135,
    vee: (70 * Math.PI) / 180,
    toe: (3.5 * Math.PI) / 180,
    mouthpiece: 1,
    slide: {
        half: 0.043,
        inner: 0.0066,
        outer: 0.0072,
        tip: 0.675,
        fixedBrace: 0.072,
    },
    bell: {
        rim: 0.347,
        height: 0.11,
        // slim for most of its length, opening in the last few centimeters
        length: 0.552,
        tail: 0.0098,
        radius: 0.105,
        gamma: 0.65,
    },
    tuning: {
        rear: -0.37,
        width: 0.0994,
        radii: [0.0068, 0.0092],
        sleeves: [-0.205, -0.232],
        weight: { s: -0.294, r: 0.023 },
    },
    joint: 0.042,
    braces: [
        // the bell brace the left thumb hooks, and the one by the tuning slide
        { s: 0.02, nickel: true, r: 0.0042 },
        { s: -0.218, nickel: false, r: 0.0038 },
    ],
};

const BASS: Trombone = {
    // the same Bb; its wider tuning bow and longer bell make the tubing a little longer
    openLength: 2.77,
    rimBack: 0.135,
    vee: (70 * Math.PI) / 180,
    toe: (3.5 * Math.PI) / 180,
    mouthpiece: 1.1,
    slide: {
        half: 0.046,
        inner: 0.0074,
        outer: 0.0081,
        tip: 0.675,
        fixedBrace: 0.072,
    },
    bell: {
        rim: 0.362,
        height: 0.145,
        length: 0.557,
        tail: 0.0108,
        radius: 0.12,
        gamma: 0.7,
    },
    tuning: {
        rear: -0.355,
        width: 0.135,
        radii: [0.0081, 0.0102],
        sleeves: [-0.198, -0.215],
    },
    joint: 0.045,
    braces: [{ s: -0.006, nickel: true, r: 0.0045 }],
    valve: {
        s: -0.06,
        u: 0.03,
        r: 0.018,
        tube: 0.0075,
        depth: 0.008,
        top: 0.123,
        low: 0.028,
        mid: 0.07,
        frontInner: -0.092,
        frontOuter: -0.038,
        rearOuter: -0.285,
        rearInner: -0.2375,
    },
};

const TROMBONES: Record<"trombone" | "bassTrombone", Trombone> = {
    trombone: TENOR,
    bassTrombone: BASS,
};

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: Vec3): Vec3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, mul(sub(b, a), t));

/**
 * A slide trombone. `slideOut` draws the slide that far out of first
 * position: the grip stays at the origin, so the mouthpiece and bell
 * section move back by it (and `tubing.main` grows by twice it).
 */
export function tromboneHorn(
    id: "trombone" | "bassTrombone",
    detail: Detail,
    slideOut = 0,
): Horn {
    const h = TROMBONES[id];
    const k = hornKit(detail);
    const trim = k.segments.trim;
    const w = h.slide.half;
    const rimZ = -(h.rimBack + slideOut);
    const cu = Math.cos(h.vee);
    const su = Math.sin(h.vee);
    /** On the fixed half of the slide: a tube's x, and the distance from the rim. */
    const at = (x: number, s: number): Vec3 => [x, 0, rimZ + s];
    /**
     * In the bell section: its plane rises from the left slide tube, turned
     * about the joint so the bell toes away from the slide.
     */
    const ct = Math.cos(h.toe);
    const st = Math.sin(h.toe);
    const bp = (s: number, u: number, n = 0): Vec3 => {
        const along = (s - h.joint) * ct - u * st;
        const up = (s - h.joint) * st + u * ct;
        return [w - up * cu + n * su, up * su + n * cu, rimZ + h.joint + along];
    };
    const N: Vec3 = [su, cu, 0];
    const length = (cs: Corner[], bend: number) =>
        pathLength(
            bentPath(
                cs.map(([p, b]) => [p, b ?? bend]),
                k.segments.bend,
            ),
        );
    const pieces: Piece[] = [];
    /**
     * Tubing through `corners`, as `hornKit`'s pipe, but with the centerline
     * thinned where two bends meet: a U's two quarter turns leave points a
     * hair apart there, whose rings would cross and notch the bow.
     */
    const pipe = (
        cs: Corner[],
        radii: number | [number, number][],
        bend = 0.02,
        sides = k.segments.tube,
    ): Piece => {
        const raw = bentPath(
            cs.map(([p, b]) => [p, b ?? bend]),
            k.segments.bend,
        );
        const path: Vec3[] = [];
        raw.forEach((p, i) => {
            const last = path[path.length - 1];
            const near =
                last &&
                Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) <
                    4e-4;
            if (near && i + 1 === raw.length) path.pop();
            if (!near || i + 1 === raw.length) path.push(p);
        });
        return smoothTube(
            path,
            typeof radii === "number" ? radii : taper(path, radii),
            sides,
            PART_METAL,
            { capStart: false, capEnd: false },
        );
    };
    /** A rod with a flange where it meets a tube at each end. */
    const rod = (a: Vec3, b: Vec3, r: number, part: number) => {
        const d = unit(sub(b, a));
        pieces.push(k.sleeve(a, b, r, part));
        if (trim)
            pieces.push(
                k.sleeve(a, add(a, mul(d, 0.0025)), r * 1.7, part),
                k.sleeve(sub(b, mul(d, 0.0025)), b, r * 1.7, part),
            );
    };
    /** A raised ring round a tube. */
    const ringAt = (a: Vec3, b: Vec3, r: number, part = PART_METAL) => {
        if (trim) pieces.push(k.sleeve(a, b, r, part));
    };

    // ---- the fixed half of the slide: mouthpiece, cork barrels, inner tubes ----
    const rim = at(-w, 0);
    const m = h.mouthpiece;
    pieces.push(
        k.turned(
            [
                [0.004 * m, 0.017 * m],
                [0.0105 * m, 0.006 * m],
                [0.0127 * m, 0.001 * m],
                [0.0156 * m, 0],
                [0.0185 * m, 0.003 * m],
                [0.0188 * m, 0.008 * m],
                [0.0178 * m, 0.018 * m],
                [0.0136 * m, 0.032 * m],
                [0.0086 * m, 0.043 * m],
                [0.0064 * m, 0.05 * m],
                [0.0068 * m, 0.054 * m],
                [0.0058 * m, 0.058 * m],
                [0.0055 * m, 0.07],
            ],
            rim,
            [0, 0, 1],
            PART_CHROME,
            Math.round(k.segments.tube * 1.25),
        ),
    );
    const barrel = h.slide.inner + 0.0032;
    // the receiver and cork barrel on the mouthpiece's tube, and the slide lock ring at its end
    const lockEnd = h.rimBack - 0.008;
    pieces.push(k.sleeve(at(-w, 0.058), at(-w, lockEnd - 0.008), barrel));
    ringAt(at(-w, 0.058), at(-w, 0.063), barrel + 0.0011);
    ringAt(at(-w, lockEnd - 0.012), at(-w, lockEnd - 0.007), barrel + 0.0014);
    pieces.push(
        k.turned(
            [
                [h.slide.inner, -0.0088],
                [barrel + 0.0018, -0.0078],
                [barrel + 0.0018, -0.002],
                [h.slide.inner + 0.0008, 0],
            ],
            at(-w, lockEnd),
            [0, 0, 1],
            PART_CHROME,
        ),
    );
    // the other tube's barrel, from the nut that locks the slide to the bell section
    pieces.push(k.sleeve(at(w, h.joint), at(w, lockEnd - 0.014), barrel));
    ringAt(at(w, lockEnd - 0.019), at(w, lockEnd - 0.014), barrel + 0.0014);
    pieces.push(
        k.turned(
            [
                [h.slide.inner, -0.011],
                [barrel + 0.0012, -0.009],
                [barrel + 0.0028, -0.006],
                [barrel + 0.0028, 0.005],
                [barrel, 0.007],
            ],
            at(w, h.joint),
            [0, 0, 1],
            PART_METAL,
        ),
    );
    // the inner tubes, running on inside the outer slide
    for (const x of [-w, w])
        pieces.push(
            k.sleeve(
                at(x, lockEnd - 0.016),
                [x, 0, 0.03],
                h.slide.inner,
                PART_CHROME,
            ),
        );
    // the fixed brace, which the left hand's fingers wrap
    rod(
        at(-w + barrel, h.slide.fixedBrace),
        at(w - barrel, h.slide.fixedBrace),
        0.0056,
        PART_CHROME,
    );

    // ---- the outer slide: the half that moves with the right hand ----
    const ro = h.slide.outer;
    const rBow = ro + 0.0006;
    const bowZ = h.slide.tip - 0.012 - rBow - w;
    for (const x of [-w, w]) {
        pieces.push(k.sleeve([x, 0, -0.008], [x, 0, bowZ], ro));
        // the sleeve the brace is soldered to, and the ferrule at the bow
        ringAt([x, 0, -0.008], [x, 0, 0.024], ro + 0.0007);
        ringAt([x, 0, -0.008], [x, 0, -0.004], ro + 0.0016);
        ringAt([x, 0, bowZ - 0.012], [x, 0, bowZ + 0.004], rBow + 0.0007);
    }
    rod([-w + ro, 0, 0], [w - ro, 0, 0], 0.0056, PART_CHROME);
    pieces.push(
        pipe(
            [
                [[-w, 0, bowZ - 0.002]],
                [[-w, 0, bowZ + w]],
                [[w, 0, bowZ + w]],
                [[w, 0, bowZ - 0.002]],
            ],
            rBow,
            w,
        ),
    );
    // the rubber bumper on the bow's end, and the water key beside it
    const apex: Vec3 = [0, 0, bowZ + w + rBow];
    pieces.push(
        k.sleeve(
            add(apex, [0, 0, -0.002]),
            add(apex, [0, 0, 0.005]),
            0.0036,
            PART_CHROME,
        ),
        k.sleeve(
            add(apex, [0, 0, 0.005]),
            add(apex, [0, 0, 0.012]),
            0.0052,
            PART_BLACK,
        ),
    );
    {
        const a = Math.PI / 3;
        const out: Vec3 = [Math.sin(a), 0, Math.cos(a)];
        pieces.push(
            ...k.waterKey(
                add([0, 0, bowZ], mul(out, w)),
                [Math.cos(a), 0, -Math.sin(a)],
                out,
                rBow,
            ),
        );
    }
    const slideLength = bowZ - rim[2] + Math.PI * w + (bowZ - (rimZ + h.joint));

    // ---- the bell section ----
    const t = h.tuning;
    const R = t.width / 2;
    const legU = h.bell.height - t.width;
    const rearS = t.rear + (t.radii[0] + t.radii[1]) / 2;
    const bowS = rearS + R;
    const bellLength = h.bell.length;
    const tailS = h.bell.rim - bellLength;
    /** The flare from the bell's tail: (distance, radius). */
    const flare = bellFlare(
        [0, h.bell.tail],
        [bellLength, h.bell.radius],
        h.bell.gamma,
    );
    /** The bell's radius where it passes `s`. */
    const bellR = (s: number) => {
        const d = s - tailS;
        for (let i = 0; i + 1 < flare.length; i++)
            if (d <= flare[i + 1][0]) {
                const f = (d - flare[i][0]) / (flare[i + 1][0] - flare[i][0]);
                return (
                    flare[i][1] *
                    (flare[i + 1][1] / flare[i][1]) ** Math.max(0, f)
                );
            }
        return h.bell.radius;
    };
    const rNeck = t.radii[0];
    const v = h.valve;
    // Seen from the bell section, the slide's line climbs behind the joint:
    // the gooseneck follows it back to a knee, where it levels into the
    // tuning slide's lower leg (on the bass the rotor is the knee).
    const toe = st / ct;
    const kneeS = v ? v.s : h.joint - legU / toe;
    const neckU = (s: number) => (s > kneeS ? (h.joint - s) * toe : legU);
    const neckFrom = bp(h.joint + 0.004, neckU(h.joint + 0.004));

    // the gooseneck from the slide back to the tuning slide, the rotor in it on the bass
    let neckLength = 0;
    let loop = 0;
    if (!v) {
        const neck: Corner[] = [
            [neckFrom],
            [bp(kneeS, legU), 0.8],
            [bp(bowS, legU)],
        ];
        pieces.push(pipe(neck, rNeck));
        neckLength = length(neck, 0.02) - 0.004;
    } else {
        // the ports sit a quarter turn apart round the casing; the main
        // tubing uses the lower two
        const q = Math.SQRT1_2;
        const port = (ds: number, du: number, far = v.r - 0.002): Vec3 =>
            bp(v.s + ds * far, v.u + du * far);
        const tIn = (v.u - (h.joint - v.s) * toe) / (1 - toe);
        const into: Corner[] = [
            [neckFrom],
            [bp(v.s + tIn, v.u - tIn), 0.018],
            [port(q, -q)],
        ];
        const outOf: Corner[] = [
            [port(-q, -q)],
            [bp(v.s - (v.u - legU), legU), 0.018],
            [bp(bowS, legU)],
        ];
        pieces.push(pipe(into, rNeck), pipe(outOf, rNeck));
        neckLength =
            length(into, 0.02) -
            0.004 +
            length(outOf, 0.02) +
            2 * q * (v.r - 0.002);

        // the rotor: its casing across the plane, a domed cap toward the
        // player and the stop arm's side away
        const c = bp(v.s, v.u);
        const half = v.r * 1.15;
        pieces.push(
            k.sleeve(add(c, mul(N, -half)), add(c, mul(N, half)), v.r),
            k.turned(
                [
                    [v.r * 1.04, half - 0.004],
                    [v.r * 1.04, half + 0.002],
                    [v.r * 0.86, half + 0.0045],
                    [v.r * 0.4, half + 0.0055],
                    [0.0001, half + 0.0055],
                ],
                c,
                mul(N, -1),
                PART_CHROME,
            ),
            k.turned(
                [
                    [v.r * 1.04, half - 0.003],
                    [v.r * 1.04, half + 0.001],
                    [v.r * 0.5, half + 0.003],
                    [v.r * 0.28, half + 0.003],
                    [v.r * 0.22, half + 0.009],
                    [0.0001, half + 0.009],
                ],
                c,
                N,
                PART_CHROME,
            ),
        );

        // The wrap: out of the casing, back along the gooseneck, up round
        // a bow nested in the tuning slide's, forward under the bell, down
        // round the inner turn (its lower run is the F tuning slide) and
        // forward again into the casing from above. How far back the two
        // rear bows reach is solved for the loop's length.
        const want = h.openLength * F_ATTACHMENT_RATIO;
        const d = v.depth;
        const build = (back: number): Corner[] => {
            const ro2 = (v.top - v.low) / 2;
            const ri = (v.top - v.mid) / 2;
            return [
                [bp(v.s - (v.r - 0.002), v.u + 0.008, 0)],
                [bp(v.s - 0.045, v.u + 0.008, d * 0.3), 0.03],
                [bp(v.s - 0.08, v.low, d), 0.03],
                [bp(v.rearOuter - back, v.low, d), ro2],
                [bp(v.rearOuter - back, v.top, d), ro2],
                [bp(v.frontInner, v.top, d), ri],
                [bp(v.frontInner, v.mid, d), ri],
                [bp(v.rearInner - back, v.mid, -d), ri],
                [bp(v.rearInner - back, v.top, -d), ri],
                [bp(v.frontOuter, v.top, -d), 0.028],
                [bp(v.frontOuter, v.u + (v.frontOuter - v.s), 0), 0.015],
                [port(q, q)],
            ];
        };
        // a second way through the rotor is part of the loop
        const through = 2 * q * (v.r - 0.002);
        const back = (want - through - length(build(0), 0.02)) / 4;
        const wrap = build(back);
        loop = length(wrap, 0.02) + through;
        pieces.push(
            pipe(wrap, v.tube, 0.02, Math.round(k.segments.tube * 0.75)),
        );
        // the F tuning slide's sleeve on the inner turn's lower run
        const ri = (v.top - v.mid) / 2;
        const lowA = bp(v.frontInner - ri, v.mid, d);
        const lowB = bp(v.rearInner - back + ri, v.mid, -d);
        if (trim)
            pieces.push(
                k.sleeve(
                    mix(lowA, lowB, 0.3),
                    mix(lowA, lowB, 0.97),
                    v.tube * 1.14 + 0.0003,
                    PART_CHROME,
                ),
            );
        // struts holding the wrap to itself and to the horn
        const midS = (v.frontInner + v.rearInner - back) / 2;
        rod(
            bp(midS, v.mid + v.tube, 0),
            bp(midS, v.top - v.tube, -d),
            0.0022,
            PART_METAL,
        );
        rod(
            bp(midS - 0.02, v.mid - v.tube, -d * 0.2),
            bp(midS - 0.02, v.low + v.tube, d),
            0.0022,
            PART_METAL,
        );
        pieces.push(
            k.sleeve(
                bp(midS - 0.05, v.low, d),
                bp(midS - 0.05, legU, 0),
                0.003,
            ),
        );
        rod(
            bp(midS + 0.03, v.top + v.tube * 0.5, d),
            bp(midS + 0.03, h.bell.height - bellR(midS + 0.03), 0),
            0.0026,
            PART_METAL,
        );

        // the thumb lever: a paddle by the bell brace on an axle across
        // the gooseneck, its crank linked to the rotor's stop arm
        const axS = v.s + 0.042;
        const axU = neckU(axS) + rNeck + 0.006;
        const face = half + 0.006;
        pieces.push(
            k.sleeve(
                bp(axS, neckU(axS), 0),
                bp(axS, axU + 0.003, 0),
                0.003,
                PART_CHROME,
            ),
            k.sleeve(
                bp(axS, axU, -face - 0.002),
                bp(axS, axU, face + 0.002),
                0.002,
                PART_CHROME,
            ),
            // paddle side, toward the player
            k.sleeve(
                bp(axS, axU, -face),
                bp(axS + 0.03, axU + 0.03, -face),
                0.002,
                PART_CHROME,
            ),
            k.sleeve(
                bp(axS + 0.03, axU + 0.03, -face - 0.0015),
                bp(axS + 0.03, axU + 0.03, -face + 0.0015),
                0.0085,
                PART_CHROME,
            ),
            // crank side: up to the link, along it to the stop arm, in to the spindle
            k.sleeve(
                bp(axS, axU, face),
                bp(axS - 0.004, axU + 0.024, face),
                0.002,
                PART_CHROME,
            ),
            k.sleeve(
                bp(axS - 0.004, axU + 0.024, face),
                bp(v.s, v.u + 0.013, face),
                0.0016,
                PART_CHROME,
            ),
            k.sleeve(
                bp(v.s, v.u + 0.013, face),
                bp(v.s, v.u, face),
                0.002,
                PART_CHROME,
            ),
        );
    }

    // the tuning slide: lower leg, bow and upper leg into the bell's tail
    const bow: Corner[] = [
        [bp(bowS, legU)],
        [bp(rearS, legU), R],
        [bp(rearS, h.bell.height), R],
        [bp(tailS + 0.002, h.bell.height)],
    ];
    const bowLength = length(bow, R);
    const turn = (Math.PI * R) / bowLength;
    pieces.push(
        pipe(
            bow,
            [
                [0, t.radii[0]],
                [turn, t.radii[1]],
                [1, h.bell.tail],
            ],
            R,
        ),
    );
    // its nickel sleeves, and the ferrule at the bell's tail
    if (trim) {
        pieces.push(
            k.sleeve(
                bp(bowS + 0.004, legU),
                bp(t.sleeves[0], legU),
                t.radii[0] * 1.13 + 0.0005,
                PART_CHROME,
            ),
            k.sleeve(
                bp(bowS + 0.004, h.bell.height),
                bp(t.sleeves[1], h.bell.height),
                t.radii[1] * 1.1 + 0.0005,
                PART_CHROME,
            ),
            k.sleeve(
                bp(t.sleeves[1], h.bell.height),
                bp(tailS + 0.012, h.bell.height),
                h.bell.tail + 0.0009,
            ),
        );
        ringAt(
            bp(tailS + 0.008, h.bell.height),
            bp(tailS + 0.013, h.bell.height),
            h.bell.tail + 0.0018,
        );
        ringAt(
            bp(t.sleeves[0] - 0.005, legU),
            bp(t.sleeves[0], legU),
            t.radii[0] * 1.13 + 0.0013,
        );
    }
    if (t.weight) {
        // the tuning slide's brace and the counterweight on it
        const { s, r } = t.weight;
        rod(
            bp(s, legU + t.radii[0], 0),
            bp(s, h.bell.height - t.radii[1], 0),
            0.0036,
            PART_METAL,
        );
        pieces.push(
            k.turned(
                [
                    [0.0001, -0.006],
                    [r * 0.9, -0.006],
                    [r, -0.004],
                    [r, 0.004],
                    [r * 0.9, 0.006],
                    [0.0001, 0.006],
                ],
                bp(s, (legU + h.bell.height) / 2),
                N,
                PART_CHROME,
                k.segments.tube * 2,
            ),
        );
    }

    // the bell
    pieces.push(
        k.bell(
            flare,
            bp(tailS, h.bell.height),
            sub(bp(tailS + 1, h.bell.height), bp(tailS, h.bell.height)),
        ),
    );
    for (const b of h.braces)
        rod(
            bp(b.s, neckU(b.s) + rNeck * 0.9),
            bp(b.s, h.bell.height - bellR(b.s) * 0.98),
            b.r,
            b.nickel ? PART_CHROME : PART_METAL,
        );

    const main = slideLength + neckLength + bowLength - 0.002 + bellLength;
    const hold = h.slide.fixedBrace;
    return {
        pieces,
        // between the fixed slide brace and the bell brace
        leftGrip: [w * 0.45, 0.02, rimZ + hold - 0.022],
        valves: k.casings,
        rim,
        tubing: { main, valves: [loop, 0, 0] },
    };
}
