/**
 * The words for a model import's report on the review screen (fork #999): each refusal, fix and
 * note as a title and an optional detail. Kept apart from the screen so every code has a test.
 */
import type { Fix, Note, Refusal } from "../types";

export type Translate = (
    key: string,
    params?: Record<string, string | number>,
) => string;

export interface ReportLine {
    title: string;
    detail?: string;
}

const MB = 1024 * 1024;
const megabytes = (bytes: number) => String(Math.round(bytes / MB));
const number = (value: number) => value.toLocaleString();
const names = (list: readonly string[]) => list.join(", ");

const K = "props.import.cantImport";

/** Why the model can't be imported */
export function refusalText(refusal: Refusal, t: Translate): ReportLine {
    switch (refusal.code) {
        case "noModelFile":
            return {
                title: t(`${K}.noModelFile.title`),
                detail: t(`${K}.noModelFile.detail`),
            };
        case "severalModelFiles":
            return {
                title: t(`${K}.severalModelFiles.title`),
                detail: t(`${K}.severalModelFiles.detail`, {
                    names: names(refusal.names),
                }),
            };
        case "tooLarge":
            return {
                title: t(`${K}.tooLarge.title`),
                detail: t(`${K}.tooLarge.detail`, {
                    size: megabytes(refusal.bytes),
                    limit: megabytes(refusal.limit),
                }),
            };
        case "unreadable":
            return {
                title: t(`${K}.unreadable.title`),
                detail: refusal.reason,
            };
        case "externalUri":
            return {
                title: t(`${K}.externalUri.title`),
                detail: t(`${K}.externalUri.detail`, { uri: refusal.uri }),
            };
        case "outsidePickedFiles":
            return {
                title: t(`${K}.outsidePickedFiles.title`),
                detail: t(`${K}.outsidePickedFiles.detail`, {
                    uri: refusal.uri,
                }),
            };
        case "missingFile":
            return {
                title: t(`${K}.missingFile.title`, { uri: refusal.uri }),
                detail: t(`${K}.missingFile.detail`),
            };
        case "requiredExtension":
            return {
                title: t(`${K}.requiredExtension.title`),
                detail: t(`${K}.requiredExtension.detail`, {
                    extensions: names(refusal.extensions),
                }),
            };
        case "validatorErrors":
            return {
                title: t(`${K}.validatorErrors.title`, {
                    count: refusal.count,
                }),
                detail: refusal.messages
                    .slice(0, 3)
                    .map((m) => m.message)
                    .join(" · "),
            };
        case "imageTooLarge":
            return {
                title: t(`${K}.imageTooLarge.title`, { image: refusal.image }),
                detail: t(`${K}.imageTooLarge.detail`, {
                    width: refusal.width,
                    height: refusal.height,
                    limit: refusal.limit,
                }),
            };
        case "imageUnreadable":
            return {
                title: t(`${K}.imageUnreadable.title`, {
                    image: refusal.image,
                }),
            };
        case "tooManyTriangles":
            return {
                title: t(`${K}.tooManyTriangles.title`),
                detail: t(`${K}.tooManyTriangles.detail`, {
                    triangles: number(refusal.triangles),
                    limit: number(refusal.limit),
                }),
            };
        case "rigged":
            return {
                title: t(`${K}.rigged.title`),
                detail: t(`${K}.rigged.detail`),
            };
        case "noGeometry":
            return { title: t(`${K}.noGeometry.title`) };
        case "timedOut":
            return {
                title: t(`${K}.timedOut.title`),
                detail: t(`${K}.timedOut.detail`, { seconds: refusal.seconds }),
            };
        case "failed":
            return {
                title: t(`${K}.failed.title`),
                detail: refusal.reason,
            };
    }
}

/** A refusal Try again can help with: the import itself failed, not the file */
export const canRetry = (refusal: Refusal) =>
    refusal.code === "timedOut" || refusal.code === "failed";

const F = "props.import.fixed";

/** What the import changed on its own */
export function fixText(fix: Fix, t: Translate): ReportLine {
    switch (fix.code) {
        case "texturesShrunk":
            return {
                title: t(`${F}.texturesShrunk.title`, {
                    count: fix.textures.length,
                    cap: fix.cap,
                }),
                detail: fix.textures
                    .map(
                        (texture) =>
                            `${texture.name}: ${texture.from.join(" × ")} → ${texture.to.join(" × ")}`,
                    )
                    .join(" · "),
            };
        case "dracoDecoded":
            return { title: t(`${F}.dracoDecoded`) };
        case "meshoptDecoded":
            return { title: t(`${F}.meshoptDecoded`) };
        case "instancesExpanded":
            return { title: t(`${F}.instancesExpanded`) };
        case "extensionsDropped":
            return {
                title: t(`${F}.extensionsDropped`),
                detail: names(fix.extensions),
            };
        case "contentDropped": {
            const dropped = [
                [fix.animations, "animations"],
                [fix.cameras, "cameras"],
                [fix.morphTargets, "morphTargets"],
                [fix.scenes, "scenes"],
            ] as const;
            return {
                title: t(`${F}.contentDropped.title`),
                detail: dropped
                    .filter(([count]) => count > 0)
                    .map(([count, what]) =>
                        t(`${F}.contentDropped.${what}`, { count }),
                    )
                    .join(" · "),
            };
        }
        case "rigFrozen":
            return { title: t(`${F}.rigFrozen`) };
        case "pivotMoved":
            return { title: t(`${F}.pivotMoved`) };
    }
}

const N = "props.import.notes";

/** A quiet note, its lengths as `length` writes meters (in the show's units) */
export function noteText(
    note: Note,
    t: Translate,
    length: (meters: number) => string,
): ReportLine {
    switch (note.code) {
        case "validatorWarnings":
            return {
                title: t(`${N}.validatorWarnings`, { count: note.count }),
            };
        case "sizeOutOfRange":
            return {
                title: t(`${N}.sizeOutOfRange.title`),
                detail: t(`${N}.sizeOutOfRange.detailOf`, {
                    largest: length(note.largestM),
                    min: length(note.minM),
                    max: length(note.maxM),
                }),
            };
        case "overTriangleCap":
            return {
                title: t(`${N}.overTriangleCap`, {
                    triangles: number(note.triangles),
                    cap: number(note.cap),
                }),
            };
    }
}
