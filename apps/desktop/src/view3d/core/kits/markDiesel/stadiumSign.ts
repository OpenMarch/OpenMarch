import {
    BoxGeometry,
    BufferGeometry,
    Float32BufferAttribute,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    type CanvasTexture,
} from "three";
import { DIESEL_STADIUM, dieselTexture, signText } from "./brand";
import type { DieselFrame } from "./frame";

/**
 * The red signs on the suite level's fascia at the 50, one over each
 * sideline: a black raceway box with lit channel letters. Photo 13 shows
 * the west one above the 200s; photo 6 shows the east one between the
 * drape's two hangs. Their letters are a heavy serif leaning right
 * (photo 17: LUCAS OIL STADIUM); here they spell the hall's name, MARK
 * DIESEL STADIUM, in the same red LED.
 */

/** Size of the box, meters: length, height, depth off the fascia. */
export const STADIUM_SIGN = { length: 11.5, height: 0.95, depth: 0.32 };
/** The letters' red, and the dark face they stand on. */
const LED_RED = "#ff2a1c";
const FACE = "#0a0a0c";

/** The channel letters' face: a heavy serif, leaning 12 degrees. */
const LETTERS = {
    family: 'Georgia, "DejaVu Serif", "Noto Serif", serif',
    slant: Math.tan((12 * Math.PI) / 180),
};

/** Canvas pixels per meter of the sign's face. */
const PX = 160;

/** The face: red channel letters with a soft glow, on black. */
export function paintStadiumSign(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
): void {
    g.fillStyle = FACE;
    g.fillRect(0, 0, w, h);
    const cap = h * 0.62;
    const options = {
        color: LED_RED,
        align: "center" as const,
        spacing: 0.06,
        maxWidth: w * 0.88,
        ...LETTERS,
    };
    // The glow off the letters' faces, then the letters.
    g.save();
    g.shadowColor = "rgba(255,40,24,0.9)";
    g.shadowBlur = h * 0.18;
    signText(g, DIESEL_STADIUM, w / 2, h / 2, cap, options);
    g.restore();
    signText(g, DIESEL_STADIUM, w / 2, h / 2, cap, {
        ...options,
        color: "#ff6a50",
        weight: 0,
    });
}

function stadiumSignTexture(): CanvasTexture {
    const { length, height } = STADIUM_SIGN;
    return dieselTexture(
        Math.round(length * PX),
        Math.round(height * PX),
        paintStadiumSign,
    );
}

/**
 * The two signs, one mesh: each a box on the suite fascia (`BOWL.suiteFascia`) at the
 * 50, its lettered face toward the field. Kit-root space.
 */
export function buildDieselStadiumSign(frame: DieselFrame): {
    object: Mesh;
    dispose(): void;
} {
    const { BOWL } = frame;
    const fascia = BOWL.suiteFascia;
    const { length, height, depth } = STADIUM_SIGN;
    const map = stadiumSignTexture();
    // Both boxes in one mesh, one draw per material: BoxGeometry's faces
    // run +x, -x, +y, -y, +z, -z, six vertices each without an index, so
    // the lettered face is each box's last six.
    const plain: number[][] = [[], []];
    const lettered: number[][] = [[], []];
    for (const side of [1, -1]) {
        // The west sign's face is its -z side, toward the field; the east
        // one is turned round. They stand a hand off the fascia, on
        // brackets.
        const one = new BoxGeometry(length, height, depth)
            .toNonIndexed()
            .applyMatrix4(
                new Matrix4()
                    .makeRotationY(side > 0 ? 0 : Math.PI)
                    .setPosition(
                        0,
                        (fascia.bottom + fascia.top) / 2,
                        side * (BOWL.halfZ + fascia.offset - depth / 2 - 0.1),
                    ),
            );
        const pos = one.getAttribute("position").array;
        const uv = one.getAttribute("uv").array;
        const split = 30;
        for (let i = 0; i < 36; i++) {
            const into = i < split ? plain : lettered;
            into[0].push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
            into[1].push(uv[i * 2], uv[i * 2 + 1]);
        }
        one.dispose();
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute(
        "position",
        new Float32BufferAttribute([...plain[0], ...lettered[0]], 3),
    );
    geometry.setAttribute(
        "uv",
        new Float32BufferAttribute([...plain[1], ...lettered[1]], 2),
    );
    geometry.computeVertexNormals();
    geometry.addGroup(0, plain[0].length / 3, 0);
    geometry.addGroup(plain[0].length / 3, lettered[0].length / 3, 1);
    const box = new MeshStandardMaterial({ color: FACE, roughness: 0.6 });
    const face = new MeshStandardMaterial({
        color: 0xffffff,
        map,
        emissive: 0xffffff,
        emissiveMap: map,
        emissiveIntensity: 1.6,
        roughness: 0.5,
    });
    const object = new Mesh(geometry, [box, face]);
    object.name = "markDiesel.stadiumSigns";
    return {
        object,
        dispose() {
            geometry.dispose();
            map.dispose();
            box.dispose();
            face.dispose();
        },
    };
}
