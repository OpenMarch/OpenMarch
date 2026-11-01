// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    SILK_CUT_IDS,
    SILK_CUT_SAMPLES,
    SILK_GRID,
    SILK_WAVE,
    SILK_WAVE_SHADER,
    silkPhases,
    silkPoint,
    silkCutProfile,
    silkSeed,
    type SilkWaveInput,
} from "../silkWave";
import { curveCutPath, silkCutShape } from "../../sizes/silkCuts";

const SIX_FT: SilkWaveInput = {
    fly: 1.37,
    header: 0.9,
    mirror: 1,
    wavePhase: 0,
    bellyPhase: 0,
    speed: 0,
    turn: 0,
};

const at = (u: number, v: number, s: SilkWaveInput) => {
    const p = [0, 0, 0];
    const n = [0, 0, 0];
    silkPoint(u, v, s, p, n);
    return { p, n };
};

/** The finite-difference normal: (P(u+e) − P(u−e)) × (P(v+e) − P(v−e)). */
function fdNormal(u: number, v: number, s: SilkWaveInput) {
    const e = 1e-5;
    const a = at(u + e, v, s).p;
    const b = at(u - e, v, s).p;
    const c = at(u, v + e, s).p;
    const d = at(u, v - e, s).p;
    const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    const n = [
        du[1] * dv[2] - du[2] * dv[1],
        du[2] * dv[0] - du[0] * dv[2],
        du[0] * dv[1] - du[1] * dv[0],
    ];
    const l = Math.hypot(n[0], n[1], n[2]);
    return n.map((x) => x / l);
}

const MOTIONS: [string, Partial<SilkWaveInput>][] = [
    ["at rest", {}],
    ["marching", { speed: 1.14, wavePhase: 2.1, bellyPhase: 0.7 }],
    ["running a wheel", { speed: 3, turn: 0.8, wavePhase: 5.5 }],
    ["turning on the spot", { turn: -6, bellyPhase: 4 }],
    ["mirrored, marching", { mirror: -1, speed: 0.9, wavePhase: 1 }],
];

describe("silk wave", () => {
    it("uses the fixed defaults", () => {
        expect(SILK_WAVE).toEqual({
            amplitude: 0.055,
            wavelength: 0.9,
            waveSpeed: 0.2,
            speedCoupling: 0.25,
            turnCoupling: 0.05,
            droop: 0.5,
        });
    });

    it("grids silks 24 × 16 at high and 12 × 8 at low", () => {
        expect(SILK_GRID.high).toEqual({ fly: 24, header: 16 });
        expect(SILK_GRID.low).toEqual({ fly: 12, header: 8 });
    });

    it.each(MOTIONS)(
        "matches finite differences with its analytic normal %s",
        (_, motion) => {
            const s = { ...SIX_FT, ...motion };
            for (const u of [0.02, 0.2, 0.31, 0.5, 0.77, 0.98])
                for (const v of [0.03, 0.4, 0.66, 0.97]) {
                    const { n } = at(u, v, s);
                    const fd = fdNormal(u, v, s);
                    for (let k = 0; k < 3; k++)
                        expect(n[k]).toBeCloseTo(fd[k], 5);
                }
        },
    );

    it("is a pure function of its inputs: the same moment gives the same surface", () => {
        const s = { ...SIX_FT, speed: 1.3, turn: 0.4, wavePhase: 3 };
        const first = at(0.6, 0.3, s);
        // evaluate other moments in between, as a scrub would
        at(0.6, 0.3, { ...s, wavePhase: 1, speed: 0 });
        at(0.6, 0.3, { ...s, turn: -2 });
        expect(at(0.6, 0.3, s)).toEqual(first);
    });

    it("holds the hoist edge on the pole", () => {
        for (const motion of MOTIONS.map((m) => m[1]))
            for (const v of [0, 0.5, 1]) {
                const { p } = at(0, v, { ...SIX_FT, ...motion });
                expect(p[0]).toBeCloseTo(0, 9);
                expect(p[1]).toBeCloseTo((v - 1) * SIX_FT.header, 9);
                expect(p[2]).toBeCloseTo(0, 9);
            }
    });

    it("hangs the fly at rest and lifts it with speed", () => {
        const flyTop = (speed: number) =>
            at(1, 1, { ...SIX_FT, speed, wavePhase: 1.2 }).p;
        const rest = flyTop(0);
        const moving = flyTop(1.5);
        // at rest the fly's top corner sags below the pole's top
        expect(rest[1]).toBeLessThan(-0.3);
        expect(moving[1]).toBeCloseTo(0, 9);
        expect(moving[0]).toBeCloseTo(SIX_FT.fly, 9);
    });

    it("billows a belly when moving, and hardly at rest", () => {
        const maxFace = (speed: number) => {
            let m = 0;
            for (let i = 0; i <= 12; i++)
                for (let j = 0; j <= 8; j++)
                    m = Math.max(
                        m,
                        Math.abs(
                            at(i / 12, j / 8, {
                                ...SIX_FT,
                                speed,
                                wavePhase: 2,
                                bellyPhase: Math.PI / 2,
                            }).p[2],
                        ),
                    );
            return m;
        };
        expect(maxFace(1.5)).toBeGreaterThan(0.1);
        expect(maxFace(0)).toBeLessThan(0.01);
    });

    it("mirrors the face offset and keeps the normal on the winding side", () => {
        const s = { ...SIX_FT, speed: 1, wavePhase: 0.4 };
        const m = { ...s, mirror: -1 };
        const a = at(0.7, 0.4, s);
        const b = at(0.7, 0.4, m);
        expect(b.p[0]).toBe(a.p[0]);
        expect(b.p[1]).toBe(a.p[1]);
        expect(b.p[2]).toBe(-a.p[2]);
        const fd = fdNormal(0.7, 0.4, m);
        for (let k = 0; k < 3; k++) expect(b.n[k]).toBeCloseTo(fd[k], 5);
    });

    it("wraps its phases into one turn, the same for the same clock", () => {
        const a = silkPhases(612.37, 840.2, silkSeed(7));
        expect(a.wavePhase).toBeGreaterThanOrEqual(0);
        expect(a.wavePhase).toBeLessThan(2 * Math.PI);
        expect(a.bellyPhase).toBeGreaterThanOrEqual(0);
        expect(a.bellyPhase).toBeLessThan(2 * Math.PI);
        silkPhases(10, 3, silkSeed(7));
        expect(silkPhases(612.37, 840.2, silkSeed(7))).toEqual(a);
    });

    it("travels the wave with the clock and with the distance covered", () => {
        const k = (2 * Math.PI) / SILK_WAVE.wavelength;
        const d = (a: number, b: number) =>
            (((a - b) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        // 1 s at rest: waveSpeed × 1 s of travel
        expect(
            d(silkPhases(1.5, 0, 0).wavePhase, silkPhases(0.5, 0, 0).wavePhase),
        ).toBeCloseTo(k * SILK_WAVE.waveSpeed, 9);
        // a steady 2 m/s for 1 s: the prototype's waveSpeed × (1 + 0.25 × 2)
        expect(
            d(silkPhases(1.5, 3, 0).wavePhase, silkPhases(0.5, 1, 0).wavePhase),
        ).toBeCloseTo(k * SILK_WAVE.waveSpeed * 1.5, 9);
    });

    it("gives the shader the same constants", () => {
        expect(SILK_WAVE_SHADER).toContain("const float A = 0.055000;");
        expect(SILK_WAVE_SHADER).toContain(
            `const float K = ${((2 * Math.PI) / 0.9).toFixed(8)};`,
        );
        expect(SILK_WAVE_SHADER).toContain("const float DROOP = 0.500000;");
    });

    describe("cut outlines", () => {
        const swing = silkCutProfile("silk-swing-44x66");
        const SWING: SilkWaveInput = {
            ...SIX_FT,
            fly: 66 * 0.0254,
            header: 44 * 0.0254,
            cut: swing,
        };

        it("profiles a rectangle as the full header across the fly", () => {
            const r = silkCutProfile(curveCutPath(0.9, 1.37));
            expect(r.top).toHaveLength(SILK_CUT_SAMPLES + 1);
            for (let i = 0; i <= SILK_CUT_SAMPLES; i++) {
                expect(r.top[i]).toBeCloseTo(0, 9);
                expect(r.bottom[i]).toBeCloseTo(1, 9);
            }
        });

        it("profiles the swing cut: a flat bottom, the top rounding down to it", () => {
            expect(silkCutShape("silk-swing-44x66")?.path).toBeDefined();
            expect(swing.top[0]).toBeCloseTo(0, 9);
            expect(swing.top[SILK_CUT_SAMPLES]).toBeCloseTo(1, 6);
            for (let i = 0; i <= SILK_CUT_SAMPLES; i++)
                expect(swing.bottom[i]).toBeCloseTo(1, 6);
            for (let i = 1; i <= SILK_CUT_SAMPLES; i++)
                expect(swing.top[i]).toBeGreaterThanOrEqual(swing.top[i - 1]);
            // still most of the header a third of the way out
            expect(swing.top[SILK_CUT_SAMPLES / 4]).toBeLessThan(0.1);
        });

        it("names every cut the shader knows", () => {
            expect(SILK_CUT_IDS).toContain("silk-swing-44x66");
            expect(SILK_WAVE_SHADER).toContain(
                `vec2 SILK_CUTS[${(SILK_CUT_IDS.length + 1) * (SILK_CUT_SAMPLES + 1)}]`,
            );
        });

        it("spans the cut's outline when flat and lifted", () => {
            const s = { ...SWING, speed: 1.5, wavePhase: 0 };
            for (const i of [0, 4, 8, 12, 15]) {
                const u = i / SILK_CUT_SAMPLES;
                const top = at(u, 1, s).p;
                const bottom = at(u, 0, s).p;
                expect(top[1]).toBeCloseTo(-swing.top[i] * SWING.header, 9);
                expect(bottom[1]).toBeCloseTo(
                    -swing.bottom[i] * SWING.header,
                    9,
                );
            }
            // the top meets the bottom at the fly's tip
            expect(at(1, 1, s).p[1]).toBeCloseTo(at(1, 0, s).p[1], 6);
        });

        it.each(MOTIONS)(
            "matches finite differences on the swing cut %s",
            (_, motion) => {
                const s = { ...SWING, ...motion };
                // away from the profile's sample points, where it bends
                for (const u of [0.02, 0.2, 0.33, 0.47, 0.77, 0.9])
                    for (const v of [0.03, 0.4, 0.66, 0.97]) {
                        const { n } = at(u, v, s);
                        const fd = fdNormal(u, v, s);
                        for (let k = 0; k < 3; k++)
                            expect(n[k]).toBeCloseTo(fd[k], 4);
                    }
            },
        );
    });
});
