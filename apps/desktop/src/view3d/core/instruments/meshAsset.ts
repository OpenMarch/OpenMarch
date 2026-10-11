/**
 * Instrument meshes authored in Blender and baked into the instrument frame
 * by `scripts/view3d-assets/export-horn.py` (docs/3d/instruments.md §4):
 * per part, positions in tenths of a millimeter and normals scaled to 127,
 * at a "high" and a "low" detail. Pure: no three.js.
 */
import type { Piece } from "./mesh";
import type { Detail } from "./model";

/** One part of a baked mesh, as the exporter writes it. */
interface BakedPart {
    part: number;
    positions: number[];
    normals: number[];
    indices: number[];
}

/** A baked mesh file: where it came from, and its parts per detail. */
export interface BakedMesh {
    source: string;
    lods: Record<Detail, BakedPart[]>;
}

/** The pieces of a baked mesh at `detail`, in meters with unit normals. */
export function bakedPieces(mesh: BakedMesh, detail: Detail): Piece[] {
    return mesh.lods[detail].map((b) => {
        const normals: number[] = [];
        for (let i = 0; i < b.normals.length; i += 3) {
            const [x, y, z] = [
                b.normals[i],
                b.normals[i + 1],
                b.normals[i + 2],
            ];
            const l = Math.hypot(x, y, z) || 1;
            normals.push(x / l, y / l, z / l);
        }
        return {
            part: b.part,
            positions: b.positions.map((v) => v / 1e4),
            normals,
            indices: [...b.indices],
        };
    });
}
