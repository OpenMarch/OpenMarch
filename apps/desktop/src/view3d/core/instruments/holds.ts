/**
 * Arm poses for carrying an instrument (docs/3d/instruments.md §5), as
 * target points in the body's rest frame: where the elbow and wrist go and
 * which way the fingers point, for each arm, plus where the instrument sits.
 * `armPose.ts` aims the bones at these. The wrists and the "elbow out"
 * direction come from the owner's reference photos; each elbow is then the
 * point 0.205 m from the shoulder and 0.264 m from the wrist nearest that
 * direction (the arm's bone lengths), so every target is reachable. Tune
 * them here, nowhere else.
 *
 * Frame: meters, +X the performer's left, +Y up, +Z forward. Landmarks
 * (class 1.00): shoulders at (±0.185, 1.397), chest front z 0.12, chin
 * y 1.52, eye line y 1.62. Upper arm 0.205 m, forearm 0.264 m.
 * Pure: no three.js.
 */
import type { Vec3 } from "./mesh";

export type HoldState = "up" | "carry" | "trail";
export const HOLD_STATES: readonly HoldState[] = ["up", "carry", "trail"];
export type HoldFamily =
    | "brass"
    | "trombone"
    | "contra"
    | "flute"
    | "piccolo"
    | "clarinet"
    | "bassClarinet"
    | "sax"
    | "snare"
    | "tenors"
    | "bass"
    | "cymbals"
    | "flag"
    | "swingFlag"
    | "doubleSwingFlag"
    | "rifle"
    | "sabre";

export interface ArmTargets {
    elbow: Vec3;
    wrist: Vec3;
    /** Unit vector: the hand bone's +Y, wrist toward the fingertips. */
    fingers: Vec3;
}

export interface Hold {
    family: HoldFamily;
    state: HoldState;
    right: ArmTargets;
    left: ArmTargets;
    instrument: { origin: Vec3; bellAxis: Vec3; capsAxis: Vec3 };
}

export const holdId = (family: HoldFamily, state: HoldState) =>
    `${family}:${state}`;

const unit = (v: Vec3): Vec3 => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
};

/** The brass triangle: elbows out, forearms up and in, hands at the valves. */
const BRASS: Record<HoldState, Hold> = {
    up: {
        family: "brass",
        state: "up",
        right: {
            elbow: [-0.278, 1.438, 0.173],
            wrist: [-0.06, 1.56, 0.26],
            fingers: unit([0.3, 0.2, 0.1]),
        },
        left: {
            elbow: [0.292, 1.419, 0.169],
            wrist: [0.05, 1.52, 0.2],
            fingers: unit([-0.3, 0.3, 0.15]),
        },
        instrument: {
            origin: [-0.02, 1.56, 0.3],
            bellAxis: [0, 0, 1],
            capsAxis: [0, 1, 0],
        },
    },
    carry: {
        family: "brass",
        state: "carry",
        // vertical in front of the torso, bell to the ground, mouthpiece at eye level
        right: {
            elbow: [-0.216, 1.305, 0.176],
            wrist: [-0.05, 1.5, 0.24],
            fingers: unit([0.3, 0.1, 0.0]),
        },
        left: {
            elbow: [0.224, 1.273, 0.154],
            wrist: [0.05, 1.46, 0.22],
            fingers: unit([-0.3, 0.2, 0.0]),
        },
        instrument: {
            origin: [0, 1.5, 0.26],
            bellAxis: [0, -1, 0],
            capsAxis: [0, 0, 1],
        },
    },
    trail: {
        family: "brass",
        state: "trail",
        // right arm straight down the side, bell back; left fist at the leg
        right: {
            elbow: [-0.237, 1.202, -0.041],
            wrist: [-0.27, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        left: {
            elbow: [0.231, 1.202, -0.047],
            wrist: [0.25, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        instrument: {
            origin: [-0.27, 0.9, 0.03],
            bellAxis: [0, 0, -1],
            capsAxis: [-1, 0, 0],
        },
    },
};

/** Trombone: right hand on the slide brace, left at the bell brace; only `up` differs. */
const TROMBONE: Record<HoldState, Hold> = {
    up: {
        family: "trombone",
        state: "up",
        right: {
            elbow: [-0.21, 1.448, 0.192],
            wrist: [-0.04, 1.56, 0.36],
            fingers: unit([0.3, 0.1, 0.2]),
        },
        left: {
            elbow: [0.289, 1.441, 0.166],
            wrist: [0.06, 1.56, 0.22],
            fingers: unit([-0.3, 0.2, 0.1]),
        },
        instrument: {
            origin: [-0.02, 1.56, 0.38],
            bellAxis: [0, 0, 1],
            capsAxis: [0, 1, 0],
        },
    },
    carry: { ...BRASS.carry, family: "trombone" },
    trail: { ...BRASS.trail, family: "trombone" },
};

/**
 * Contra: the loop lies along the left shoulder behind the bell, its plane
 * outside the head (x 0.17 against a head half-width of about 0.1), the
 * bottom tube resting on the shoulder. The valves sit at chin height in
 * front, left of center: the right hand reaches across to them, the left
 * supports the bottom tube at the front.
 */
const CONTRA_UP: Hold = {
    family: "contra",
    state: "up",
    right: {
        elbow: [-0.119, 1.513, 0.151],
        wrist: [0.13, 1.6, 0.14],
        fingers: unit([0.3, 0.1, 0.0]),
    },
    left: {
        elbow: [0.334, 1.258, -0.026],
        wrist: [0.26, 1.44, 0.15],
        fingers: unit([-0.2, 0.3, 0.3]),
    },
    instrument: {
        origin: [0.15, 1.6, 0.12],
        bellAxis: [0, 0, 1],
        capsAxis: [0, 1, 0],
    },
};
const CONTRA: Record<HoldState, Hold> = {
    up: CONTRA_UP,
    carry: { ...CONTRA_UP, state: "carry" },
    trail: { ...CONTRA_UP, state: "trail" },
};

/**
 * Woodwinds at trail (owner, 2026-10-09): the brass trail's arms. The right
 * arm hangs straight down the side with the instrument in its fist, 0.07 m
 * down the fingers from the wrist at (−0.27, 0.88, 0.03); the left arm hangs
 * straight down the leg, a closed fist with the thumb on top.
 */
const TRAIL_RIGHT: ArmTargets = BRASS.trail.right;
const TRAIL_LEFT: ArmTargets = BRASS.trail.left;

/**
 * Flutes and clarinets at carry (owner, 2026-10-09): the tube vertical in
 * front of the body, head joint up, keys forward, the first key at eye
 * level. The hands make a triangle: each wrist a hand's length out and
 * below its point on the tube, the elbows out, the forearms angled in and
 * up to it, the left hand above the right.
 */

/**
 * Flute: horizontal to the player's right at the lips, angled a little
 * forward and down. Both hands sit under the tube, wrists below it, the
 * fingers wrapping up and over onto the keys: the left hand by the face (its
 * forearm across the chest, the elbow in front), the right hand further out
 * with the elbow down and out. Carry: vertical, the first key (0.2 m along)
 * at eye level, the hands at 0.25 and 0.43 m. Trail: the head joint to the
 * ground, the fist round the body 0.5 m along.
 */
const FLUTE: Record<HoldState, Hold> = {
    up: {
        family: "flute",
        state: "up",
        // horizontal to the right, lips at the head joint, keys toward the front
        right: {
            elbow: [-0.297, 1.225, 0.003],
            wrist: [-0.4, 1.38, 0.19],
            fingers: unit([0.05, 0.9, 0.42]),
        },
        left: {
            elbow: [0.067, 1.352, 0.157],
            wrist: [-0.19, 1.41, 0.15],
            fingers: unit([-0.1, 0.9, 0.42]),
        },
        instrument: {
            origin: [0, 1.56, 0.12],
            bellAxis: [-0.968, -0.151, 0.202],
            capsAxis: [0.2, 0.031, 0.979],
        },
    },
    carry: {
        family: "flute",
        state: "carry",
        // vertical in front, head joint up, the first key at eye level; the hands a triangle
        right: {
            elbow: [-0.326, 1.282, 0.089],
            wrist: [-0.085, 1.315, 0.19],
            fingers: unit([0.725, 0.64, 0.256]),
        },
        left: {
            elbow: [0.322, 1.387, 0.147],
            wrist: [0.085, 1.495, 0.19],
            fingers: unit([-0.725, 0.64, 0.256]),
        },
        instrument: {
            origin: [0, 1.82, 0.22],
            bellAxis: [0, -1, 0],
            capsAxis: [0, 0, 1],
        },
    },
    trail: {
        family: "flute",
        state: "trail",
        // in the right fist at the side, head joint to the ground
        right: TRAIL_RIGHT,
        left: TRAIL_LEFT,
        instrument: {
            origin: [-0.26, 0.38, 0.075],
            bellAxis: [0, 1, 0],
            capsAxis: [0, 0, 1],
        },
    },
};

/**
 * Piccolo: the flute's hold with both hands brought in to the short body
 * (0.32 m against the flute's 0.67): the left hand 0.12 m along it, the
 * right 0.24 m. Carry: the first key 0.101 m along at eye level, the hands
 * at 0.14 and 0.24 m. Trail: the fist round the body 0.18 m along.
 */
const PICCOLO: Record<HoldState, Hold> = {
    up: {
        family: "piccolo",
        state: "up",
        // the flute's line, hands close together
        right: {
            elbow: [-0.275, 1.214, -0.027],
            wrist: [-0.23, 1.4, 0.155],
            fingers: unit([0.05, 0.9, 0.42]),
        },
        left: {
            elbow: [0.133, 1.332, 0.183],
            wrist: [-0.11, 1.42, 0.13],
            fingers: unit([-0.1, 0.9, 0.42]),
        },
        instrument: {
            origin: [0, 1.56, 0.12],
            bellAxis: [-0.968, -0.151, 0.202],
            capsAxis: [0.2, 0.031, 0.979],
        },
    },
    carry: {
        family: "piccolo",
        state: "carry",
        // vertical in front, head joint up, the first key at eye level; the hands a triangle
        right: {
            elbow: [-0.326, 1.32, 0.123],
            wrist: [-0.085, 1.406, 0.19],
            fingers: unit([0.725, 0.64, 0.256]),
        },
        left: {
            elbow: [0.322, 1.397, 0.148],
            wrist: [0.085, 1.506, 0.19],
            fingers: unit([-0.725, 0.64, 0.256]),
        },
        instrument: {
            origin: [0, 1.721, 0.22],
            bellAxis: [0, -1, 0],
            capsAxis: [0, 0, 1],
        },
    },
    trail: {
        family: "piccolo",
        state: "trail",
        // in the right fist at the side, head joint to the ground
        right: TRAIL_RIGHT,
        left: TRAIL_LEFT,
        instrument: {
            origin: [-0.26, 0.7, 0.075],
            bellAxis: [0, 1, 0],
            capsAxis: [0, 0, 1],
        },
    },
};

/**
 * Clarinet (and the soprano sax): down the center line from the mouth. The
 * hands wrap the joints from the sides, fingers across the front onto the
 * holes, thumbs behind: left hand on the upper joint, right on the lower,
 * elbows a little out. Carry: vertical, mouthpiece up, the first key at eye
 * level (0.16 m along: the clarinet's throat Ab at 0.168, the soprano's C at
 * 0.145), the hands at 0.25 and 0.42 m. Trail: the mouthpiece to the ground,
 * the fist round the lower joint 0.5 m along, a little further forward than
 * the flute's to clear the forearm with the bell.
 */
const CLARINET: Record<HoldState, Hold> = {
    up: {
        family: "clarinet",
        state: "up",
        // angled 28 degrees out; left hand upper joint, right hand lower
        right: {
            elbow: [-0.246, 1.239, 0.11],
            wrist: [-0.075, 1.15, 0.29],
            fingers: unit([0.8, -0.2, 0.55]),
        },
        left: {
            elbow: [0.308, 1.261, 0.087],
            wrist: [0.075, 1.33, 0.19],
            fingers: unit([-0.8, -0.2, 0.55]),
        },
        instrument: {
            origin: [0, 1.52, 0.13],
            bellAxis: [0.0, -0.882, 0.471],
            capsAxis: [0.0, 0.471, 0.882],
        },
    },
    carry: {
        family: "clarinet",
        state: "carry",
        // vertical in front, mouthpiece up, the first key at eye level; the hands a triangle
        right: {
            elbow: [-0.325, 1.274, 0.081],
            wrist: [-0.085, 1.285, 0.19],
            fingers: unit([0.725, 0.64, 0.256]),
        },
        left: {
            elbow: [0.324, 1.355, 0.14],
            wrist: [0.085, 1.455, 0.19],
            fingers: unit([-0.725, 0.64, 0.256]),
        },
        instrument: {
            origin: [0, 1.78, 0.22],
            bellAxis: [0, -1, 0],
            capsAxis: [0, 0, 1],
        },
    },
    trail: {
        family: "clarinet",
        state: "trail",
        // in the right fist at the side, mouthpiece to the ground
        right: TRAIL_RIGHT,
        left: TRAIL_LEFT,
        instrument: {
            origin: [-0.26, 0.38, 0.09],
            bellAxis: [0, 1, 0],
            capsAxis: [0, 0, 1],
        },
    },
};

/**
 * Saxes hang from the neck strap in front of the body: the neck brings the
 * body out in front of the mouth, the body runs straight down to the bow
 * at the stomach, the keys face forward and the bell sits on the player's
 * left of the body tube, its flare opening forward and up. The hands wrap
 * the body from the sides, fingers across the front: left hand on the
 * upper stack, right hand on the lower, elbows out.
 *
 * Carry (owner, 2026-10-09): vertical just in front of the body, turned a
 * quarter about the vertical from the playing hold. The model keeps its
 * bell on its +X = +Y × +Z, so with +Z down the keys (+Y) face the
 * performer's right and the bell comes out in front of the body tube; the
 * other quarter turn would push it into the chest. The mouthpiece sits at
 * eye level, 0.11 m left of center so the body tube (that far toward the
 * keys from it) hangs on the center line, 0.21 m out. The hands stay where
 * they play, left on the upper stack from the left side, right on the lower
 * stack from the right, fingers in across the tube.
 *
 * Trail: level at the right side, front to back like the brass trail, the
 * fist round the body tube 0.37 m along with the mouthpiece in front. The
 * mouthpiece sits 0.11 m in from the fist, so the alto's and bari's body
 * tubes run through it; the tenor's longer neck puts its tube 0.07 m out. The
 * keys face out, so the bow and bell hang below the tube (+X down), the
 * flare leaning out, away from the leg.
 */
const SAX: Record<HoldState, Hold> = {
    up: {
        family: "sax",
        state: "up",
        // in front, straight down to the bow at the stomach; hands wrap from the sides
        right: {
            elbow: [-0.221, 1.223, 0.097],
            wrist: [-0.07, 1.08, 0.26],
            fingers: unit([0.8, -0.1, 0.6]),
        },
        left: {
            elbow: [0.263, 1.236, 0.096],
            wrist: [0.085, 1.15, 0.27],
            fingers: unit([-0.8, -0.1, 0.6]),
        },
        instrument: {
            origin: [0, 1.52, 0.13],
            bellAxis: [0.03, -0.99, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    carry: {
        family: "sax",
        state: "carry",
        // vertical, keys to the right, bell in front; mouthpiece at eye level
        right: {
            elbow: [-0.309, 1.243, 0.049],
            wrist: [-0.15, 1.12, 0.22],
            fingers: unit([0.982, 0.085, 0.171]),
        },
        left: {
            elbow: [0.342, 1.277, 0.05],
            wrist: [0.14, 1.27, 0.22],
            fingers: unit([-0.963, 0.168, 0.209]),
        },
        instrument: {
            origin: [0.11, 1.62, 0.21],
            bellAxis: [0, -1, 0],
            capsAxis: [-1, 0, 0],
        },
    },
    trail: {
        family: "sax",
        state: "trail",
        // level at the right side, mouthpiece forward, bell hanging below
        right: TRAIL_RIGHT,
        left: TRAIL_LEFT,
        instrument: {
            origin: [-0.16, 0.88, 0.4],
            bellAxis: [0, 0, -1],
            capsAxis: [-1, 0, 0],
        },
    },
};

/**
 * Bass clarinet: its body hangs 0.124 m toward the keys from the mouthpiece
 * and runs a meter long, so it plays nearly vertical, tipped 10 degrees
 * out, the neck bringing the mouthpiece up into the lips. Left hand on the
 * upper cups (0.33 m along); the right arm hangs almost straight to reach
 * the lower ones (0.6 m along), its fingers angled down to them.
 *
 * Carry (owner, 2026-10-09): as the saxes, vertical and turned a quarter
 * with the keys to the performer's right, the mouthpiece at eye level and
 * the body tube on the center line. The crook and bell, which turn toward
 * the keys, sit low at the right side.
 *
 * Trail: level at the right side like the saxes, the fist round the body
 * 0.5 m along with the mouthpiece in front. The keys face the ground so the
 * crook and bell hang below the tube behind the leg.
 */
const BASS_CLARINET: Record<HoldState, Hold> = {
    up: {
        family: "bassClarinet",
        state: "up",
        // nearly vertical, 10 degrees out; the right arm almost straight to the lower cups
        right: {
            elbow: [-0.218, 1.218, 0.09],
            wrist: [-0.11, 1.03, 0.24],
            fingers: unit([0.496, -0.437, 0.751]),
        },
        left: {
            elbow: [0.302, 1.284, 0.12],
            wrist: [0.085, 1.227, 0.259],
            fingers: unit([-0.625, -0.101, 0.774]),
        },
        instrument: {
            origin: [0, 1.52, 0.13],
            bellAxis: [0, -0.985, 0.174],
            capsAxis: [0, 0.174, 0.985],
        },
    },
    carry: {
        family: "bassClarinet",
        state: "carry",
        // vertical, keys to the right; mouthpiece at eye level
        right: {
            elbow: [-0.268, 1.224, 0.067],
            wrist: [-0.14, 1.06, 0.23],
            fingers: unit([0.857, -0.489, 0.163]),
        },
        left: {
            elbow: [0.341, 1.281, 0.06],
            wrist: [0.14, 1.29, 0.23],
            fingers: unit([-0.98, 0.089, 0.178]),
        },
        instrument: {
            origin: [0.124, 1.62, 0.22],
            bellAxis: [0, -1, 0],
            capsAxis: [-1, 0, 0],
        },
    },
    trail: {
        family: "bassClarinet",
        state: "trail",
        // level at the right side, mouthpiece forward, crook and bell hanging below
        right: TRAIL_RIGHT,
        left: TRAIL_LEFT,
        instrument: {
            origin: [-0.27, 1.004, 0.53],
            bellAxis: [0, 0, -1],
            capsAxis: [0, -1, 0],
        },
    },
};

const SNARE: Record<HoldState, Hold> = {
    up: {
        family: "snare",
        state: "up",
        // matched grip: hands just behind the back rim, palms down, sticks angled in to meet near the center a little above the head
        right: {
            elbow: [-0.281, 1.227, -0.066],
            wrist: [-0.209, 1.068, 0.132],
            fingers: unit([0.563, 0.032, 0.826]),
        },
        left: {
            elbow: [0.281, 1.227, -0.066],
            wrist: [0.209, 1.068, 0.132],
            fingers: unit([-0.563, 0.032, 0.826]),
        },
        instrument: {
            origin: [0, 1.0, 0.36],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    carry: {
        family: "snare",
        state: "carry",
        // matched grip: hands just behind the back rim, palms down, sticks angled in to meet near the center a little above the head
        right: {
            elbow: [-0.281, 1.227, -0.066],
            wrist: [-0.209, 1.068, 0.132],
            fingers: unit([0.563, 0.032, 0.826]),
        },
        left: {
            elbow: [0.281, 1.227, -0.066],
            wrist: [0.209, 1.068, 0.132],
            fingers: unit([-0.563, 0.032, 0.826]),
        },
        instrument: {
            origin: [0, 1.0, 0.36],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    trail: {
        family: "snare",
        state: "trail",
        // matched grip: hands just behind the back rim, palms down, sticks angled in to meet near the center a little above the head
        right: {
            elbow: [-0.281, 1.227, -0.066],
            wrist: [-0.209, 1.068, 0.132],
            fingers: unit([0.563, 0.032, 0.826]),
        },
        left: {
            elbow: [0.281, 1.227, -0.066],
            wrist: [0.209, 1.068, 0.132],
            fingers: unit([-0.563, 0.032, 0.826]),
        },
        instrument: {
            origin: [0, 1.0, 0.36],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
};

const TENORS: Record<HoldState, Hold> = {
    up: {
        family: "tenors",
        state: "up",
        // matched grip, wider than the snare: each hand behind one of the two front drums (1 on the left, 2 on the right), reaching over the shots to that drum's head
        right: {
            elbow: [-0.273, 1.212, -0.003],
            wrist: [-0.286, 1.088, 0.23],
            fingers: unit([0.511, -0.12, 0.851]),
        },
        left: {
            elbow: [0.273, 1.212, -0.003],
            wrist: [0.286, 1.088, 0.23],
            fingers: unit([-0.511, -0.12, 0.851]),
        },
        instrument: {
            origin: [0, 0.98, 0.36],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    carry: {
        family: "tenors",
        state: "carry",
        // matched grip, wider than the snare: each hand behind one of the two front drums (1 on the left, 2 on the right), reaching over the shots to that drum's head
        right: {
            elbow: [-0.273, 1.212, -0.003],
            wrist: [-0.286, 1.088, 0.23],
            fingers: unit([0.511, -0.12, 0.851]),
        },
        left: {
            elbow: [0.273, 1.212, -0.003],
            wrist: [0.286, 1.088, 0.23],
            fingers: unit([-0.511, -0.12, 0.851]),
        },
        instrument: {
            origin: [0, 0.98, 0.36],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    trail: {
        family: "tenors",
        state: "trail",
        // matched grip, wider than the snare: each hand behind one of the two front drums (1 on the left, 2 on the right), reaching over the shots to that drum's head
        right: {
            elbow: [-0.273, 1.212, -0.003],
            wrist: [-0.286, 1.088, 0.23],
            fingers: unit([0.511, -0.12, 0.851]),
        },
        left: {
            elbow: [0.273, 1.212, -0.003],
            wrist: [0.286, 1.088, 0.23],
            fingers: unit([-0.511, -0.12, 0.851]),
        },
        instrument: {
            origin: [0, 0.98, 0.36],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
};

const BASS: Record<HoldState, Hold> = {
    up: {
        family: "bass",
        state: "up",
        // the drum high on the carrier; upper arms down, forearms forward at the hips, the hands beside the heads below the center, mallets angled up and forward
        right: {
            elbow: [-0.238, 1.199, 0.006],
            wrist: [-0.25, 1.06, 0.23],
            fingers: unit([0, 0.3, 0.95]),
        },
        left: {
            elbow: [0.238, 1.199, 0.006],
            wrist: [0.25, 1.06, 0.23],
            fingers: unit([0, 0.3, 0.95]),
        },
        instrument: {
            origin: [0, 1.0, 0.34],
            bellAxis: [1.0, 0.0, 0.0],
            capsAxis: [0.0, 1.0, 0.0],
        },
    },
    carry: {
        family: "bass",
        state: "carry",
        // the drum high on the carrier; upper arms down, forearms forward at the hips, the hands beside the heads below the center, mallets angled up and forward
        right: {
            elbow: [-0.238, 1.199, 0.006],
            wrist: [-0.25, 1.06, 0.23],
            fingers: unit([0, 0.3, 0.95]),
        },
        left: {
            elbow: [0.238, 1.199, 0.006],
            wrist: [0.25, 1.06, 0.23],
            fingers: unit([0, 0.3, 0.95]),
        },
        instrument: {
            origin: [0, 1.0, 0.34],
            bellAxis: [1.0, 0.0, 0.0],
            capsAxis: [0.0, 1.0, 0.0],
        },
    },
    trail: {
        family: "bass",
        state: "trail",
        // the drum high on the carrier; upper arms down, forearms forward at the hips, the hands beside the heads below the center, mallets angled up and forward
        right: {
            elbow: [-0.238, 1.199, 0.006],
            wrist: [-0.25, 1.06, 0.23],
            fingers: unit([0, 0.3, 0.95]),
        },
        left: {
            elbow: [0.238, 1.199, 0.006],
            wrist: [0.25, 1.06, 0.23],
            fingers: unit([0, 0.3, 0.95]),
        },
        instrument: {
            origin: [0, 1.0, 0.34],
            bellAxis: [1.0, 0.0, 0.0],
            capsAxis: [0.0, 1.0, 0.0],
        },
    },
};

const CYMBALS: Record<HoldState, Hold> = {
    up: {
        family: "cymbals",
        state: "up",
        // a pair at chest height, plates vertical
        right: {
            elbow: [-0.328, 1.281, 0.084],
            wrist: [-0.2, 1.2, 0.3],
            fingers: unit([0, 0, 1]),
        },
        left: {
            elbow: [0.328, 1.281, 0.084],
            wrist: [0.2, 1.2, 0.3],
            fingers: unit([0, 0, 1]),
        },
        instrument: {
            origin: [0, 1.2, 0.3],
            bellAxis: [0.0, 0.0, 1.0],
            capsAxis: [0.0, 1.0, 0.0],
        },
    },
    carry: {
        family: "cymbals",
        state: "carry",
        // a pair at chest height, plates vertical
        right: {
            elbow: [-0.328, 1.281, 0.084],
            wrist: [-0.2, 1.2, 0.3],
            fingers: unit([0, 0, 1]),
        },
        left: {
            elbow: [0.328, 1.281, 0.084],
            wrist: [0.2, 1.2, 0.3],
            fingers: unit([0, 0, 1]),
        },
        instrument: {
            origin: [0, 1.2, 0.3],
            bellAxis: [0.0, 0.0, 1.0],
            capsAxis: [0.0, 1.0, 0.0],
        },
    },
    trail: {
        family: "cymbals",
        state: "trail",
        // a pair at chest height, plates vertical
        right: {
            elbow: [-0.328, 1.281, 0.084],
            wrist: [-0.2, 1.2, 0.3],
            fingers: unit([0, 0, 1]),
        },
        left: {
            elbow: [0.328, 1.281, 0.084],
            wrist: [0.2, 1.2, 0.3],
            fingers: unit([0, 0, 1]),
        },
        instrument: {
            origin: [0, 1.2, 0.3],
            bellAxis: [0.0, 0.0, 1.0],
            capsAxis: [0.0, 1.0, 0.0],
        },
    },
};

const FLAG: Record<HoldState, Hold> = {
    up: {
        family: "flag",
        state: "up",
        // present: the pole vertical in front, right hand high, left hand low
        right: {
            elbow: [-0.289, 1.272, 0.12],
            wrist: [-0.08, 1.25, 0.28],
            fingers: unit([0, 1, 0]),
        },
        left: {
            elbow: [0.15, 1.225, 0.101],
            wrist: [0.035, 1.034, 0.242],
            fingers: unit([0, 1, 0]),
        },
        instrument: {
            origin: [-0.08, 1.25, 0.28],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    carry: {
        family: "flag",
        state: "carry",
        // at the right side, pole vertical, left arm down
        right: {
            elbow: [-0.306, 1.233, -0.024],
            wrist: [-0.3, 1.0, 0.1],
            fingers: unit([0, 1, 0]),
        },
        left: {
            elbow: [0.231, 1.202, -0.047],
            wrist: [0.25, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        instrument: {
            origin: [-0.3, 1.0, 0.1],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    trail: {
        family: "flag",
        state: "trail",
        // at the right side, pole vertical, left arm down
        right: {
            elbow: [-0.306, 1.233, -0.024],
            wrist: [-0.3, 1.0, 0.1],
            fingers: unit([0, 1, 0]),
        },
        left: {
            elbow: [0.231, 1.202, -0.047],
            wrist: [0.25, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        instrument: {
            origin: [-0.3, 1.0, 0.1],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
};

/**
 * Swing flags wait at down 45 (owner, 2026-10-09), ready to start
 * swinging: the arm straight, out and down at 45 degrees from the shoulder
 * and a little forward, the pole running on along the arm from a short tab
 * in the fist. The silk trails back from the pole and a little down, so its
 * fly clears the ground. One swing flag rides the right hand with the left
 * arm relaxed at the side; a pair puts one in each hand, mirrored.
 */
const DOWN45_RIGHT: ArmTargets = {
    elbow: [-0.327, 1.255, 0.036],
    wrist: [-0.5, 1.082, 0.086],
    fingers: unit([-0.69, -0.69, 0.2]),
};
/** The same targets on the other side of the body's center plane. */
const mirrorArm = (a: ArmTargets): ArmTargets => ({
    elbow: [-a.elbow[0], a.elbow[1], a.elbow[2]],
    wrist: [-a.wrist[0], a.wrist[1], a.wrist[2]],
    fingers: [-a.fingers[0], a.fingers[1], a.fingers[2]],
});
const DOWN45_LEFT = mirrorArm(DOWN45_RIGHT);
const SWING_INSTRUMENT: Hold["instrument"] = {
    origin: DOWN45_RIGHT.wrist,
    // the pole along the arm; the silk's face, so its fly (+X) trails back
    bellAxis: unit([-0.69, -0.69, 0.2]),
    capsAxis: [0.719, -0.687, 0.109],
};
const SWING_FLAG = (state: HoldState): Hold => ({
    family: "swingFlag",
    state,
    right: DOWN45_RIGHT,
    left: {
        elbow: [0.231, 1.202, -0.047],
        wrist: [0.25, 0.95, 0.03],
        fingers: unit([0, -1, 0]),
    },
    instrument: SWING_INSTRUMENT,
});
const DOUBLE_SWING_FLAG = (state: HoldState): Hold => ({
    family: "doubleSwingFlag",
    state,
    right: DOWN45_RIGHT,
    left: DOWN45_LEFT,
    instrument: SWING_INSTRUMENT,
});
const SWING: Record<HoldState, Hold> = {
    up: SWING_FLAG("up"),
    carry: SWING_FLAG("carry"),
    trail: SWING_FLAG("trail"),
};
const DOUBLE_SWING: Record<HoldState, Hold> = {
    up: DOUBLE_SWING_FLAG("up"),
    carry: DOUBLE_SWING_FLAG("carry"),
    trail: DOUBLE_SWING_FLAG("trail"),
};

/**
 * The rifle is always carried level (owner, 2026-10-09): across the front
 * of the body at the waist, top up, the butt out past the right hip and the
 * muzzle to the performer's left. The right hand holds the wrist of the
 * stock, the left the fore-end.
 */
const RIFLE_LEVEL = (state: HoldState): Hold => ({
    family: "rifle",
    state,
    right: {
        elbow: [-0.276, 1.217, 0.033],
        wrist: [-0.15, 1.08, 0.22],
        fingers: unit([0.5, 0, 0.85]),
    },
    left: {
        elbow: [0.301, 1.23, 0.022],
        wrist: [0.21, 1.08, 0.22],
        fingers: unit([-0.5, 0, 0.85]),
    },
    instrument: {
        origin: [-0.15, 1.08, 0.22],
        bellAxis: [1.0, 0.0, 0.0],
        capsAxis: [0.0, 1.0, 0.0],
    },
});

const RIFLE: Record<HoldState, Hold> = {
    up: RIFLE_LEVEL("up"),
    carry: RIFLE_LEVEL("carry"),
    trail: RIFLE_LEVEL("trail"),
};

const SABRE: Record<HoldState, Hold> = {
    up: {
        family: "sabre",
        state: "up",
        // present: the blade vertical in front of the right shoulder
        right: {
            elbow: [-0.301, 1.293, 0.129],
            wrist: [-0.1, 1.3, 0.3],
            fingers: unit([0, 1, 0]),
        },
        left: {
            elbow: [0.231, 1.202, -0.047],
            wrist: [0.25, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        instrument: {
            origin: [-0.1, 1.3, 0.3],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    carry: {
        family: "sabre",
        state: "carry",
        // at the right hip, blade up along the shoulder
        right: {
            elbow: [-0.306, 1.233, -0.024],
            wrist: [-0.3, 1.0, 0.1],
            fingers: unit([0, 1, 0]),
        },
        left: {
            elbow: [0.231, 1.202, -0.047],
            wrist: [0.25, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        instrument: {
            origin: [-0.3, 1.0, 0.1],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    trail: {
        family: "sabre",
        state: "trail",
        // at the right hip, blade up along the shoulder
        right: {
            elbow: [-0.306, 1.233, -0.024],
            wrist: [-0.3, 1.0, 0.1],
            fingers: unit([0, 1, 0]),
        },
        left: {
            elbow: [0.231, 1.202, -0.047],
            wrist: [0.25, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        instrument: {
            origin: [-0.3, 1.0, 0.1],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
};

const TABLE: Record<HoldFamily, Record<HoldState, Hold>> = {
    brass: BRASS,
    trombone: TROMBONE,
    contra: CONTRA,
    flute: FLUTE,
    piccolo: PICCOLO,
    clarinet: CLARINET,
    bassClarinet: BASS_CLARINET,
    sax: SAX,
    snare: SNARE,
    tenors: TENORS,
    bass: BASS,
    cymbals: CYMBALS,
    flag: FLAG,
    swingFlag: SWING,
    doubleSwingFlag: DOUBLE_SWING,
    rifle: RIFLE,
    sabre: SABRE,
};

export function hold(family: HoldFamily, state: HoldState): Hold {
    return TABLE[family][state];
}
