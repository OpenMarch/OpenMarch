// cspell:words meshopt
/**
 * Words the model import report (package C1.10). The pipeline's rows carry a
 * `code` and typed details, never English (C1.7); the review words them here
 * through Tolgee (`library.import.rows.*`). Artwork notes keep the
 * pipeline's English `message` for v1 (owner decision Q58).
 */
import { formatLength } from "@/view3d/core/sizes/units";
import type { ModelImportReport, ModelKind } from "@/view3d/library/protocol";

export type Translate = (
    key: string,
    params?: Record<string, string | number>,
) => string;

type Rejection = ModelImportReport["cantImport"][number];
type FixRow = ModelImportReport["fixedForYou"][number];
type NoteRow = ModelImportReport["notes"][number];

export interface RowText {
    title: string;
    detail?: string;
}

const n = (value: number) => Math.round(value).toLocaleString("en-US");
const list = (items: readonly string[], max = 4) =>
    items.length > max
        ? `${items.slice(0, max).join(", ")} +${items.length - max}`
        : items.join(", ");
const meters = (m: number) => formatLength(m, "metric");

export function kindName(kind: ModelKind, t: Translate): string {
    return t(`library.import.kinds.${kind}`);
}

// eslint-disable-next-line max-lines-per-function -- one case per rejection code
export function rejectionText(
    row: Rejection,
    t: Translate,
    kind: ModelKind | null,
): RowText {
    const k = (key: string, params?: Record<string, string | number>) =>
        t(`library.import.rows.${key}`, params);
    switch (row.code) {
        case "unreadable":
            return { title: k("unreadable"), detail: row.reason };
        case "missingResource":
            return { title: k("missingResource"), detail: row.uri };
        case "externalUri":
            return { title: k("externalUri"), detail: row.uri };
        case "resourceOutsideFolder":
            return { title: k("resourceOutsideFolder"), detail: row.uri };
        case "validatorErrors":
            return {
                title: k("validatorErrors", { count: row.count }),
                detail: row.messages
                    .slice(0, 3)
                    .map((m) => m.message)
                    .join(" · "),
            };
        case "requiredExtension":
            return {
                title: k("requiredExtension"),
                detail: list(row.extensions),
            };
        case "noGeometry":
            return { title: k("noGeometry") };
        case "overTriangleCap":
            return {
                title: k("overTriangleCap", {
                    triangles: n(row.triangles),
                    limit: n(row.limit),
                }),
                detail: k("overTriangleCapDetail", {
                    cap: n(row.cap),
                    kind: kind ? kindName(kind, t) : "",
                }),
            };
        case "rigNotAllowed":
            return {
                title: k("rigNotAllowed", { kind: kindName(row.kind, t) }),
            };
        case "garmentNotRigged":
            return { title: k("garmentNotRigged") };
        case "garmentJointsNotV4":
            return {
                title: k("garmentJointsNotV4"),
                detail: [
                    row.missing.length
                        ? k("missingJoints", { names: list(row.missing) })
                        : "",
                    row.unexpected.length
                        ? k("unexpectedJoints", {
                              names: list(row.unexpected),
                          })
                        : "",
                ]
                    .filter(Boolean)
                    .join(" · "),
            };
        case "garmentRestPoseMismatch":
            return {
                title: k("garmentRestPoseMismatch"),
                detail: list(row.joints.map((j) => j.name)),
            };
        case "garmentQuantized":
            return { title: k("garmentQuantized"), detail: list(row.meshes) };
        case "garmentTransformsNotApplied":
            return {
                title: k("garmentTransformsNotApplied"),
                detail: list(row.nodes),
            };
        case "garmentNoPartPaint":
            return {
                title: k("garmentNoPartPaint"),
                detail: list(row.meshes),
            };
        case "garmentNoMedianFit":
            return {
                title: k("garmentNoMedianFit"),
                detail: list(row.fits),
            };
        case "garmentUnknownFit":
            return {
                title: k("garmentUnknownFit"),
                detail: list(row.meshes.map((m) => `${m.node}: ${m.fit}`)),
            };
    }
}

export function fixText(row: FixRow, t: Translate): RowText {
    const k = (key: string, params?: Record<string, string | number>) =>
        t(`library.import.rows.${key}`, params);
    switch (row.code) {
        case "texturesDownsized":
            return {
                title: k("texturesDownsized", {
                    count: row.textures.length,
                    cap: row.cap,
                }),
                detail: list(
                    row.textures.map(
                        (tx) =>
                            `${tx.name} ${tx.from[0]}×${tx.from[1]} → ${tx.to[0]}×${tx.to[1]}`,
                    ),
                    3,
                ),
            };
        case "dracoDecoded":
            return { title: k("dracoDecoded") };
        case "meshoptDecoded":
            return { title: k("meshOptimizerDecoded") };
        case "instancesExpanded":
            return { title: k("instancesExpanded") };
        case "extensionsStripped":
            return {
                title: k("extensionsStripped"),
                detail: list(row.extensions),
            };
        case "extrasStripped":
            return { title: k("extrasStripped") };
        case "contentStripped":
            return {
                title: k("contentStripped"),
                detail: k("contentStrippedDetail", {
                    animations: row.animations,
                    cameras: row.cameras,
                    morphTargets: row.morphTargets,
                    scenes: row.scenes,
                }),
            };
        case "influencesRenormalized":
            return {
                title: k("influencesRenormalized", {
                    vertices: n(row.vertices),
                }),
            };
    }
}

export function noteText(row: NoteRow, t: Translate): RowText {
    const k = (key: string, params?: Record<string, string | number>) =>
        t(`library.import.rows.${key}`, params);
    switch (row.code) {
        case "validatorWarnings":
            return { title: k("validatorWarnings", { count: row.count }) };
        case "sizeOutOfRange":
            return {
                title: k("sizeOutOfRange", { size: meters(row.largestM) }),
                detail: k("sizeOutOfRangeDetail", {
                    min: meters(row.minM),
                    max: meters(row.maxM),
                }),
            };
        case "noStretchZones":
            return {
                title: k("noStretchZones"),
                detail: k("noStretchZonesDetail"),
            };
        case "customPropertiesOff":
            return {
                title: k("customPropertiesOff"),
                detail: k("customPropertiesOffDetail"),
            };
        case "stillOverTriangleCap":
            return {
                title: k("stillOverTriangleCap", {
                    triangles: n(row.triangles),
                    cap: n(row.cap),
                }),
            };
        case "slotWithoutUVs":
            return { title: k("slotWithoutUVs", { slot: row.slot }) };
        case "slotDropped":
            return { title: k("slotDropped", { slot: row.slot }) };
        case "invalidOpenMarchData":
            return {
                title: k("invalidOpenMarchData", { where: row.where }),
                detail: row.reason,
            };
        case "unknownStampKind":
            return { title: k("unknownStampKind", { value: row.value }) };
        case "missingFits":
            return {
                title: k("missingFits"),
                detail: list(row.bodyTypes, 7),
            };
        case "duplicateFits":
            return {
                title: k("duplicateFits"),
                detail: list(row.fits.map((f) => f.bodyType)),
            };
        case "wgi":
            return {
                title: k(
                    row.wgi === "equipmentUnderMinimum"
                        ? "wgiEquipmentUnderMinimum"
                        : "wgiFloorOverMaximum",
                ),
            };
    }
}

/** The unit conversion's factor text: "×0.01". */
export const UNIT_FACTORS = {
    none: "×1",
    cm: "×0.01",
    in: "×0.0254",
    ft: "×0.3048",
} as const;
