import tolgee from "@/global/singletons/Tolgee";
import {
    planCanvasEdit,
    timelinePositionsSettled,
} from "@/timeline/timelineCoordinateWrites";
import {
    currentShapeField,
    marchersOnField,
    shapeContextFor,
} from "../field/shapeFieldContext";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useBoxSelectionStore } from "../placed/boxSelectionStore";
import type { PlacedBox } from "../placed/placedBox";
import { placedBoxesAt, placedBoxesRead } from "../placed/placedBoxStore";
import { startOverWaitingShape } from "../tool/shapeLeave";
import {
    isShapeShown,
    openShapeTool,
    useShapeToolStore,
} from "../tool/shapeToolStore";
import { openDrawn, slotsOf } from "../tool/toolMachine";
import { mirrorParams, type Mirror } from "../tool/mirror";
import { toolEnvFor } from "../tool/toolEnv";
import type { ShapeField } from "../field/shapeField";
import type { XY } from "../types";
import {
    keepMirrorPoint,
    lastMirrorPoint,
    startingMirrorPoint,
} from "./mirrorPointStore";
import {
    pictureOf,
    pictureSummary,
    planPaste,
    standingOnSpots,
    type CopiedPicture,
    type PictureFit,
} from "./picture";
import {
    copiedPicture,
    keepPicture,
    useCopiedPictureStore,
    announceClipboard,
    usePasteNoticeStore,
} from "./pictureStore";

/** The paste's notice goes with it: placed, discarded, or another shape opened in its place */
useShapeToolStore.subscribe((now, before) => {
    if (
        usePasteNoticeStore.getState().fit !== null &&
        (now.tool === null || now.tool.kind !== before.tool?.kind)
    )
        usePasteNoticeStore.setState({ fit: null });
});

/**
 * Copy and paste of a formation (#961, owner 2026-11-15). Copy keeps where the marchers `ids`
 * stand at the moment on screen; Paste shows that picture on the marchers selected then, as an
 * open shape of the shape host, so it's moved, turned and placed (Enter, one undo step) like a
 * shape drawn here, and Escape throws it away. Pasting rearranges: no marcher is ever added.
 */

/** The placed shape on the field whose members are exactly `ids`, if any */
function shapeSelectedWhole(ids: readonly number[]): PlacedBox | null {
    const picked = new Set(ids);
    const exactly = (box: PlacedBox) =>
        box.recipe.members.length === picked.size &&
        box.recipe.members.every((m) => picked.has(m.marcherId));
    const { selected } = useBoxSelectionStore.getState();
    if (selected && exactly(selected)) return selected;
    // A shape placed a moment ago isn't selected whole until the field hears of it: read it here
    if (useUiSettingsStore.getState().uiSettings.shapes === "off") return null;
    return (
        placedBoxesAt(displayedBeat(useTimelineSelectionStore.getState())).find(
            exactly,
        ) ?? null
    );
}

/**
 * Copies the formation of the marchers `ids`, in selection order: as its shape when they are
 * exactly one placed shape, as loose dots otherwise. Nothing on the field changes. Waits for a
 * shape placed just before to be read back, so Copy right after Place copies the shape. False
 * when there was nothing to copy.
 */
export async function copyFormation(ids: readonly number[]): Promise<boolean> {
    await Promise.all([placedBoxesRead(), timelinePositionsSettled()]);
    const field = currentShapeField();
    if (!field) return false;
    const drawn = field.drawn(ids);
    const positions = ids.flatMap((id) => drawn.get(id) ?? []);
    const shape = shapeSelectedWhole(ids);
    const picture = pictureOf({
        positions,
        shape,
        stepPx: field.fieldProperties.pixelsPerStep,
    });
    if (!picture) return false;
    keepPicture(picture);
    return true;
}

/** The open paste's mirror point is kept as it moves, for the next Paste mirrored */
/** The mirror point last kept, so it's written once per change */
let keptPoint: XY | null = null;
useShapeToolStore.subscribe((now) => {
    const point = now.tool?.mirror?.point;
    // Once a drag lets go, not on every move of it
    if (!point || now.tool?.gesture || point === keptPoint) return;
    const field = currentShapeField();
    if (!field) return;
    keptPoint = point;
    const { width, height } = field.fieldProperties;
    keepMirrorPoint(point, width, height);
});

/** Where Paste mirrored opens its mirror point on `field` (`startingMirrorPoint`) */
function mirrorPointFor(field: ShapeField, picture: CopiedPicture): XY {
    const { width, height, centerFrontPoint, pixelsPerStep } =
        field.fieldProperties;
    // The copy in this field's units, as the paste lays it out
    const scale = pixelsPerStep / picture.stepPx;
    return startingMirrorPoint({
        last: lastMirrorPoint(width, height),
        copied: picture.dots.map((p) => ({ x: p.x * scale, y: p.y * scale })),
        width,
        height,
        centerX: centerFrontPoint.xPixels,
        snap: toolEnvFor(field).gridSnap,
    });
}

/** Whether Paste can open now: something is copied, and no shape is open and showing */
export const canPaste = (): boolean =>
    copiedPicture() !== null && !isShapeShown();

/**
 * Pastes the copied picture onto the marchers `ids`: opens it as the open shape, centered on
 * them, or where it was copied when `inPlace`. Nobody moves until it's placed. Marchers a loose
 * picture has no dot for are left out, and a message says how many. False when nothing opened.
 */
export function pasteFormation(
    ids: readonly number[],
    {
        inPlace = false,
        mirrored = false,
    }: {
        inPlace?: boolean;
        /**
         * Paste mirrored: where it was copied, mirrored side to side through the last mirror
         * point used (the 50 the first time), tied to that point until it's placed
         */
        mirrored?: boolean;
    } = {},
): boolean {
    const field = currentShapeField();
    const picture = copiedPicture();
    if (!field || !picture || isShapeShown()) return false;
    const mirror = mirrored
        ? {
              point: mirrorPointFor(field, picture),
              across: true,
              deep: false,
          }
        : undefined;
    const plan = planPaste({
        picture,
        marchers: marchersOnField(field, ids),
        stepPx: field.fieldProperties.pixelsPerStep,
        inPlace,
        asPositions: useCopiedPictureStore.getState().pasteAs === "positions",
        ctx: shapeContextFor(field),
        mirror,
    });
    if (!plan) return false;
    // The mirror it stays tied to: its source is the copy as it was, the image mirrored back
    const tie: Mirror | undefined = mirror && {
        ...mirror,
        source: mirrorParams(
            plan.kind,
            plan.params,
            plan.marchers.length,
            mirror.point,
            mirror,
        ),
    };
    // One waiting away from its moment is dismissed, as a new shape started there does (#416)
    const startingOver = useShapeToolStore.getState().tool !== null;
    startOverWaitingShape();
    const ctx = shapeContextFor(field);
    const opened = openDrawn(
        plan.kind,
        plan.marchers,
        plan.params,
        ctx,
        plan.pivotMoved,
        tie,
    );
    // Marchers already standing on its spots keep them
    const kept =
        opened.assignment &&
        standingOnSpots(
            plan.marchers.map((m) => m.at),
            slotsOf(opened, ctx),
        );
    openShapeTool(
        kept ? { ...opened, assignment: kept } : opened,
        planCanvasEdit(),
        undefined,
        { keepDiscarded: startingOver },
    );
    // How it doesn't fit, from what the paste does: spots left empty (a copy that fills so many
    // spots, onto fewer marchers) or marchers left out. Under the paste's editor while it's
    // open, and said to a screen reader with the preview
    const summary = pictureSummary(
        picture,
        field.fieldProperties.pixelsPerStep,
        {
            asPositions:
                useCopiedPictureStore.getState().pasteAs === "positions",
        },
    );
    const empty = summary.anyNumber
        ? 0
        : Math.max(0, summary.count - plan.marchers.length);
    const fit: PictureFit | null =
        plan.left > 0
            ? {
                  fit: "leftOut",
                  selected: plan.marchers.length + plan.left,
                  left: plan.left,
              }
            : empty > 0
              ? { fit: "emptySpots", selected: plan.marchers.length, empty }
              : null;
    usePasteNoticeStore.setState({ fit });
    // No toast (owner 2026-11-22): the chip warned before the paste, and the editor says it
    const preview = mirror
        ? tolgee.t(
              "shapes.clipboard.announceMirrorPreview",
              "Mirrored paste preview. Move the mirror point with the arrow keys, by clicking the field or by dragging it. Enter places it, Escape discards it.",
          )
        : tolgee.t(
              "shapes.clipboard.announcePreview",
              "Paste preview. Enter places it, Escape discards it.",
          );
    const misfit =
        fit?.fit === "leftOut"
            ? tolgee.t(
                  "shapes.clipboard.left",
                  "{count, plural, one {# marcher has no spot and stays put} other {# marchers have no spot and stay put}}",
                  { count: fit.left },
              )
            : fit?.fit === "emptySpots"
              ? tolgee.t("shapes.clipboard.chipEmptySpots", {
                    count: fit.empty,
                })
              : null;
    announceClipboard(misfit ? `${misfit}. ${preview}` : preview);
    return true;
}
