// @vitest-environment node
/**
 * The snare's hands sit behind the back rim and above it, either side of
 * the carrier's belly plate, not in the drum or the plate: on every body, posed
 * in the snare hold (the right hand matched, the left in traditional grip),
 * no hand vertex comes nearer the drum than a finger's width or inside the
 * plate, and the left stick's butt, which runs back up behind the thumb,
 * clears the forearm.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { hold, stickOf } from "@/view3d/core/instruments/holds";
import { STICK_BUTT, batteryModel } from "@/view3d/core/instruments/battery";
import { BODY_TYPES } from "@/view3d/core/marchers/looks";
import { handVertices, posedBody } from "./posedHands";

describe("snare grip", () => {
    const h = hold("snare", "up");
    // the drum (the pieces on the chest, not the sticks) in the body's frame:
    // the highest point of it in each centimeter cell
    const z = new THREE.Vector3(...h.instrument.bellAxis).normalize();
    const y = new THREE.Vector3(...h.instrument.capsAxis);
    y.addScaledVector(z, -y.dot(z)).normalize();
    const place = new THREE.Matrix4()
        .makeBasis(new THREE.Vector3().crossVectors(y, z), y, z)
        .setPosition(new THREE.Vector3(...h.instrument.origin));
    const cell = (x: number, zz: number) =>
        `${Math.round(x / 0.01)},${Math.round(zz / 0.01)}`;
    const top = new Map<string, number>();
    const v = new THREE.Vector3();
    for (const p of batteryModel("snare", "high").pieces) {
        if (p.bone === "handR" || p.bone === "handL") continue;
        for (let i = 0; i < p.positions.length; i += 3) {
            v.fromArray(p.positions, i).applyMatrix4(place);
            // the drum, not the carrier on the chest behind it
            if (v.z < 0.24) continue;
            top.set(
                cell(v.x, v.z),
                Math.max(top.get(cell(v.x, v.z)) ?? -9, v.y),
            );
        }
    }

    const rim = Math.max(...top.values());
    // the belly plate (`vestCarrier` in battery.ts): 0.22 wide and 0.1 tall
    // about (0, 1.075), its face at z 0.207
    const inPlate = (p: THREE.Vector3) =>
        Math.abs(p.x) < 0.11 && Math.abs(p.y - 1.075) < 0.05 && p.z < 0.207;

    it.each(BODY_TYPES)(
        "keeps both hands above the drum and out of the belly plate (%s)",
        async (type) => {
            const m = await posedBody(type, "snare");
            for (const bone of ["DEF-handR", "DEF-handL"]) {
                const hand = handVertices(m, bone, "Snare");
                expect(hand.length, bone).toBeGreaterThan(0);
                for (const p of hand) {
                    // above the rim, wherever the hand is
                    expect(p.y - rim, bone).toBeGreaterThan(0.015);
                    expect(inPlate(p), bone).toBe(false);
                    // and above whatever part of the drum is under it
                    let under = -9;
                    for (const dx of [-0.01, 0, 0.01])
                        for (const dz of [-0.01, 0, 0.01])
                            under = Math.max(
                                under,
                                top.get(cell(p.x + dx, p.z + dz)) ?? -9,
                            );
                    if (under !== -9)
                        expect(p.y - under, bone).toBeGreaterThan(0.015);
                }
                // behind the head's middle, to that hand's side
                const mid = new THREE.Box3()
                    .setFromPoints(hand)
                    .getCenter(new THREE.Vector3());
                expect(mid.z, bone).toBeLessThan(h.instrument.origin[2] - 0.15);
                expect(
                    mid.x * (bone.endsWith("L") ? 1 : -1),
                    bone,
                ).toBeGreaterThan(0.1);
            }
        },
    );

    it("the left stick's butt clears the forearm", () => {
        const stick = stickOf(h.left);
        const butt = new THREE.Vector3(...stick.fulcrum).addScaledVector(
            new THREE.Vector3(...stick.along),
            -STICK_BUTT,
        );
        const forearm = new THREE.Line3(
            new THREE.Vector3(...h.left.elbow),
            new THREE.Vector3(...h.left.wrist),
        );
        const near = forearm.closestPointToPoint(
            butt,
            true,
            new THREE.Vector3(),
        );
        // the forearm is 3 cm thick at the wrist; the stick 0.8 cm
        expect(near.distanceTo(butt)).toBeGreaterThan(0.045);
    });
});
