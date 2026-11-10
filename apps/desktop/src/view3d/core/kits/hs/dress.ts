// cspell:ignore metalness
import {
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    Vector3,
    type Object3D,
    type Vector3Tuple,
} from "three";
import { ft, setFlushBacking } from "../../environment";
import type { LightingPreset } from "../../types";
import type {
    DressContext,
    KitDress,
    PODIUM,
    StandPlacement,
    StandSpec,
} from "../stands";
import { BoxBatch, QuadBuilder } from "./geometry";
import { buildSite, glowFor, type SiteLayout, type SiteOutput } from "./site";
import { buildSchoolStand, type SchoolStand } from "./stand";
import {
    muted,
    REAR_BAY,
    REAR_HEIGHT,
    standRearTextures,
    wallTexture,
    type StandKind,
    type WallRun,
} from "./textures";
import { buildTrackRibbon } from "./track";

/**
 * What the `hs` and `bighs` kits put around the shared stands builder: their
 * stands, track, podium and site, built so they share batches and textures.
 * Rails and frames are one instanced batch; every other box in the kit (press
 * box shell, lot furniture, low-path buildings) is a second one, tinted.
 */
export interface SchoolKitStyle {
    kind: StandKind;
    site: SiteLayout;
}

export function schoolDress(
    style: SchoolKitStyle,
    { frame, shared, input }: DressContext,
): KitDress {
    const high = input.quality === "high";
    const steel = new BoxBatch();
    const props = new BoxBatch();
    const stands: SchoolStand[] = [];
    const wallRuns: WallRun[] = [];
    const walls = new QuadBuilder();
    const wallPlacements: { at: Matrix4; spec: StandSpec }[] = [];
    const owned: { dispose(): void }[] = [];
    let rearMat: MeshStandardMaterial | undefined;
    const site: SiteOutput = buildSite(
        frame,
        style.site,
        input.params,
        shared,
        input.quality,
        props,
    );

    const addWall = (at: Matrix4, spec: StandSpec) => {
        const home = spec.side === "home";
        wallRuns.push({
            color: home ? input.params.homeColor : input.params.awayColor,
            text: home ? "HOME" : "VISITORS",
            length: spec.length,
            height: spec.base,
            gates: style.kind === "concrete",
        });
        wallPlacements.push({ at, spec });
    };

    /** Concrete stands: brick and precast rear walls, lit at the gates. */
    function rearWalls(): Mesh {
        const q = new QuadBuilder();
        for (const { at, spec } of wallPlacements) {
            const top = spec.base + (spec.rows - 1) * spec.rise;
            const back = spec.rows * spec.depth;
            const L = spec.length / 2;
            const pt = (x: number, y: number, z = back + 0.02) =>
                new Vector3(x, y, z).applyMatrix4(at);
            q.quad(
                pt(-L, 0),
                pt(L, 0),
                pt(L, top),
                pt(-L, top),
                [0, 0],
                [spec.length / REAR_BAY, 0],
                [spec.length / REAR_BAY, top / REAR_HEIGHT],
                [0, top / REAR_HEIGHT],
                undefined,
                new Vector3(0, 0, 1).transformDirection(at),
            );
            const n = Math.round(spec.length / (REAR_BAY / 2));
            const pier = new BoxBatch();
            for (let i = 0; i <= n; i++) {
                const x = -L + (i * spec.length) / n;
                pier.add(
                    [x, top / 2, back + 0.3],
                    [0.7, top + 0.4, 0.6],
                    [0, 0, 0],
                    0x9a968d,
                );
            }
            props.append(pier.transform(at));
        }
        const tex = standRearTextures();
        const geo = q.build();
        rearMat = new MeshStandardMaterial({
            map: tex.map,
            emissive: 0xffffff,
            emissiveMap: tex.emissive,
            emissiveIntensity: 0,
            roughness: 0.92,
        });
        owned.push(tex.map, tex.emissive, geo, rearMat);
        const mesh = new Mesh(geo, rearMat);
        mesh.name = "standRear";
        mesh.receiveShadow = true;
        return mesh;
    }

    return {
        buildStand(spec: StandSpec, placement: StandPlacement) {
            const text = input.params.endZoneText;
            const stand = buildSchoolStand({
                spec,
                placement,
                kind: style.kind,
                high,
                shared,
                steel,
                props,
                addWall,
                homeColor: input.params.homeColor,
                fasciaText: spec.side === "home" ? text : "",
            });
            stands.push(stand);
            return stand;
        },
        buildTrack() {
            return buildTrackRibbon(frame, high);
        },
        buildPodium(position: Vector3Tuple, size: typeof PODIUM) {
            addPodium(
                props,
                steel,
                position,
                size,
                input.params.homeColor,
                high,
            );
        },
        finish() {
            const objects: Object3D[] = [...site.objects];
            // Walls, one strip of the shared texture per stand.
            const nRuns = Math.max(1, wallRuns.length);
            wallPlacements.forEach(({ at, spec }, i) => {
                const v1 = 1 - i / nRuns;
                const v0 = 1 - (i + 1) / nRuns;
                const L = spec.length / 2;
                const pt = (x: number, y: number) =>
                    new Vector3(x, y, -0.04).applyMatrix4(at);
                const nrm = new Vector3(0, 0, -1).transformDirection(at);
                walls.quad(
                    pt(L, 0),
                    pt(-L, 0),
                    pt(-L, spec.base),
                    pt(L, spec.base),
                    [0, v0],
                    [1, v0],
                    [1, v1],
                    [0, v1],
                    undefined,
                    nrm,
                );
            });
            // The low path keeps one draw call for walls only where the words
            // can be read for it: a concrete stand's wall becomes a plain box.
            if (high || style.kind === "aluminum") {
                const wallMap = wallTexture(wallRuns);
                const wallGeo = walls.build();
                const wallMat = new MeshStandardMaterial({
                    map: wallMap,
                    roughness: 0.75,
                });
                const wall = new Mesh(wallGeo, wallMat);
                wall.name = "standWall";
                wall.receiveShadow = true;
                objects.push(wall);
                owned.push(wallMap, wallGeo, wallMat);
            } else {
                for (const { at, spec } of wallPlacements) {
                    const wall = new BoxBatch();
                    wall.add(
                        [0, spec.base / 2, -0.05],
                        [spec.length, spec.base, 0.1],
                        [0, 0, 0],
                        0x34373d,
                    );
                    props.append(wall.transform(at));
                }
            }
            if (high && style.kind === "concrete") objects.push(rearWalls());

            const steelTint = style.kind === "aluminum" ? 0x8d939c : 0x54585f;
            if (high) {
                const steelMat = new MeshStandardMaterial({
                    color: steelTint,
                    metalness: 0.5,
                    roughness: 0.5,
                });
                const steelMesh = steel.build(
                    shared.unitBox,
                    steelMat,
                    "standSteel",
                );
                steelMesh.castShadow = true;
                objects.push(steelMesh);
                owned.push(steelMat, steelMesh);
            } else {
                props.append(steel.fill(steelTint));
            }

            // Behind the press box face and scoreboards mounted on these boxes.
            const propMat = setFlushBacking(
                new MeshStandardMaterial({
                    color: 0xffffff,
                    roughness: 0.78,
                    metalness: 0.05,
                }),
            );
            const propMesh = props.build(shared.unitBox, propMat, "props");
            propMesh.castShadow = propMesh.receiveShadow = true;
            objects.push(propMesh);
            owned.push(propMat, propMesh);
            return objects;
        },
        setLighting(preset: LightingPreset) {
            const k = glowFor(preset);
            stands.forEach((s) => s.setGlow(k));
            if (rearMat) rearMat.emissiveIntensity = k;
            site.setLighting(preset);
        },
        dispose() {
            stands.forEach((s) => s.dispose());
            site.dispose();
            owned.forEach((o) => o.dispose());
        },
    };
}

/** The director's podium: a scaffold tower with a deck, rails and a ladder. */
function addPodium(
    props: BoxBatch,
    steel: BoxBatch,
    [x, y, z]: Vector3Tuple,
    size: typeof PODIUM,
    homeColor: string,
    high: boolean,
): void {
    const { w, h, d } = size;
    const t = ft(0.25);
    const rail = ft(3.5);
    const at = new Matrix4().setPosition(x, y, z);
    const local = new BoxBatch();
    const lp = new BoxBatch();
    lp.add([0, h - ft(0.2), 0], [w, ft(0.4), d], [0, 0, 0], 0xb7bbc1);
    lp.add(
        [0, h - ft(1.8), -d / 2 - ft(0.05)],
        [w, ft(3), ft(0.1)],
        [0, 0, 0],
        parseMuted(homeColor),
    );
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            local.add([(sx * w) / 2, h / 2, (sz * d) / 2], [t, h, t]);
        }
    }
    if (high) {
        for (const sx of [-1, 1]) {
            const px = (sx * w) / 2;
            local.beam([px, 0.2, -d / 2], [px, h - 0.3, d / 2], ft(0.15));
            local.beam([px, 0.2, d / 2], [px, h - 0.3, -d / 2], ft(0.15));
            local.beam([px, h + rail, -d / 2], [px, h + rail, d / 2], ft(0.18));
            local.add([px, h + rail / 2, -d / 2], [t, rail, t]);
            local.add([px, h + rail / 2, d / 2], [t, rail, t]);
        }
        local.beam(
            [-w / 2, h + rail, d / 2],
            [w / 2, h + rail, d / 2],
            ft(0.18),
        );
        for (const sx of [-1, 1]) {
            local.add(
                [sx * ft(0.8), h / 2, d / 2 + ft(0.4)],
                [ft(0.18), h, ft(0.18)],
            );
        }
        for (let yy = ft(1); yy < h; yy += ft(1)) {
            local.add([0, yy, d / 2 + ft(0.4)], [ft(1.6), ft(0.12), ft(0.12)]);
        }
    }
    steel.append(local.transform(at));
    props.append(lp.transform(at));
}

function parseMuted(css: string): number {
    const m = muted(css, 0.45).match(/\d+/g) ?? ["60", "60", "70"];
    return (Number(m[0]) << 16) | (Number(m[1]) << 8) | Number(m[2]);
}
