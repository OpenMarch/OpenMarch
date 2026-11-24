import type React from "react";
import { useMemo } from "react";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import { getButtonClassName, SegmentedTextSwitch } from "@openmarch/ui";
import { CaretDownIcon, WarningIcon } from "@phosphor-icons/react";
import ActionButton from "@/shortcuts/ActionButton";
import { runAction } from "@/shortcuts/registry";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useUnlockedOnly } from "@/items/lockedItems";
import { useQuery } from "@tanstack/react-query";
import { fieldPropertiesQueryOptions } from "@/hooks/queries/useFieldProperties";
import { frameCorners } from "../frame/frame";
import { placedOf } from "../placed/placedBox";
import type { ShapeContext, XY } from "../types";
import {
    pictureFit,
    pictureSummary,
    type CopiedPicture,
    type PictureFit,
    type PictureSummary,
} from "./picture";
import { useCopiedPictureStore } from "./pictureStore";

/**
 * What's copied and how it fits the selection now (#961), for the Clipboard chip and its card:
 * the picture, what it is as copied and as it pastes, how many marchers are selected and the fit.
 * Null while nothing is copied.
 */
export function useClipboardView() {
    const { t } = useTranslate();
    const picture = useCopiedPictureStore((s) => s.picture);
    const pasteAs = useCopiedPictureStore((s) => s.pasteAs);
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const selectedMarchers = useSelectedMarchers()?.selectedMarchers ?? [];
    const selected = useUnlockedOnly(selectedMarchers).length;
    const stepPx = fieldProperties?.pixelsPerStep;
    // What was copied, and what pasting it does now (a shape can paste as its positions)
    const copied = useMemo(
        () => (picture && stepPx ? pictureSummary(picture, stepPx) : null),
        [picture, stepPx],
    );
    const summary = useMemo(
        () =>
            picture && stepPx
                ? pictureSummary(picture, stepPx, {
                      asPositions: pasteAs === "positions",
                  })
                : null,
        [picture, stepPx, pasteAs],
    );
    if (!picture || !copied || !summary) return null;
    const fit = pictureFit(summary, selected);
    // A shape pasting as its positions says both, so it doesn't still read "Box"
    const shapeName = copied.kind?.shape.label;
    const name = !shapeName
        ? t("shapes.clipboard.positions")
        : summary.type === "positions"
          ? t("shapes.clipboard.shapeAsPositions", { name: shapeName })
          : shapeName;
    // A shape is drawn as it will paste: laid out for the marchers selected
    const drawnCount =
        fit.fit === "laidOut" ? fit.selected : picture.dots.length;
    return { picture, pasteAs, copied, summary, fit, name, drawnCount };
}

export type ClipboardView = NonNullable<ReturnType<typeof useClipboardView>>;

/**
 * A button in the chip and its card: a compact secondary pill, a finger's height in the touch
 * layout. Its key is in its tooltip, not beside it. The size goes after the merge (ui-styling)
 */
export const CLIPBOARD_BUTTON_CLASS = `${getButtonClassName({
    variant: "secondary",
    size: "compact",
})} touch:min-h-44 text-body`;

/**
 * The Clipboard chip opened (#961, owner 2026-11-22): everything about what's copied. The
 * picture, what it is and how many marchers, the Paste as switch for a shape, Paste and Paste
 * exactly (their keys in their tooltips), and one line on how it fits the selection now (or,
 * with none selected, how many it takes). It's as wide as what it says. Clear is the chip's X.
 */
export function ClipboardCard({
    view,
    onFold,
    foldRef,
}: {
    view: ClipboardView;
    /** Folds the card back into the chip */
    onFold: () => void;
    foldRef?: React.Ref<HTMLButtonElement>;
}) {
    const { t } = useTranslate();
    const { picture, pasteAs, copied, summary, fit, name, drawnCount } = view;
    return (
        <section
            data-testid="clipboard-section"
            aria-label={t("shapes.clipboard.title")}
            className="flex w-max max-w-320 flex-col gap-8"
        >
            <div className="flex items-center gap-12">
                <PicturePreview
                    picture={picture}
                    summary={summary}
                    count={drawnCount}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                    <span
                        className="text-body font-medium"
                        data-testid="clipboard-kind"
                    >
                        {name}
                    </span>
                    <span
                        className="text-sub text-text-subtitle"
                        data-testid="clipboard-count"
                    >
                        {t("shapes.clipboard.marchers", {
                            count: summary.count,
                        })}
                    </span>
                </div>
                <button
                    ref={foldRef}
                    type="button"
                    onClick={onFold}
                    aria-expanded
                    aria-label={t("shapes.clipboard.fold")}
                    data-testid="clipboard-fold"
                    className={`${getButtonClassName({ variant: "ghost", size: "compact", content: "icon" })} text-text-subtitle shrink-0 self-start`}
                >
                    <CaretDownIcon size={16} aria-hidden />
                </button>
            </div>
            {copied.type === "shape" && (
                <div className="flex items-center gap-8">
                    <span className="text-sub text-text-subtitle">
                        {t("shapes.clipboard.pasteAs")}
                    </span>
                    <SegmentedTextSwitch
                        ariaLabel={t("shapes.clipboard.pasteAs")}
                        testId="clipboard-paste-as"
                        selected={pasteAs}
                        // Through the action, as the palette's Paste as positions does
                        setSelected={(value) => {
                            if (value !== pasteAs)
                                runAction("pasteAsPositions");
                        }}
                        options={[
                            {
                                value: "shape",
                                label: t("shapes.clipboard.asShape"),
                                testId: "clipboard-paste-as-shape",
                            },
                            {
                                value: "positions",
                                label: t("shapes.clipboard.positions"),
                                testId: "clipboard-paste-as-positions",
                            },
                        ]}
                    />
                </div>
            )}
            <div className="flex flex-wrap gap-8">
                <ActionButton
                    action="pasteFormation"
                    data-testid="clipboard-paste"
                    className={CLIPBOARD_BUTTON_CLASS}
                >
                    {t("actions.edit.paste")}
                </ActionButton>
                <ActionButton
                    action="pasteFormationInPlace"
                    data-testid="clipboard-paste-in-place"
                    hint={t("shapes.clipboard.pasteExactlyHint")}
                    className={CLIPBOARD_BUTTON_CLASS}
                >
                    {t("actions.edit.pasteInPlace")}
                </ActionButton>
                <ActionButton
                    action="pasteMirrored"
                    data-testid="clipboard-paste-mirrored"
                    hint={t("shapes.clipboard.pasteMirroredHint")}
                    className={CLIPBOARD_BUTTON_CLASS}
                >
                    {t("actions.edit.pasteMirrored")}
                </ActionButton>
            </div>
            {/* One line about the fit: how it fits the marchers selected, or with none selected
                how many it takes (Clear is the chip's X). Room for two lines, so the buttons
                above it don't move as the selection changes (sims, 2026-11-16) */}
            <div className="min-h-32">
                <FitLine fit={fit} summary={summary} />
            </div>
        </section>
    );
}

/** How the copied picture fits the marchers selected now; nothing with none selected */
export function FitLine({
    fit,
    summary,
}: {
    fit: PictureFit;
    summary: PictureSummary;
}) {
    const { t } = useTranslate();
    if (fit.fit === "none")
        return (
            <p
                className="text-sub text-text-subtitle"
                data-testid="clipboard-fit"
                data-fit="none"
            >
                {summary.anyNumber
                    ? t("shapes.clipboard.anyNumber")
                    : t("shapes.clipboard.fixed", { count: summary.count })}
            </p>
        );
    const mismatch = fit.fit === "emptySpots" || fit.fit === "leftOut";
    const text =
        fit.fit === "laidOut"
            ? t("shapes.clipboard.fitLaidOut", { count: fit.selected })
            : fit.fit === "exact"
              ? t("shapes.clipboard.fitExact", { count: fit.selected })
              : fit.fit === "emptySpots"
                ? t("shapes.clipboard.fitEmptySpots", {
                      count: fit.empty,
                      selected: fit.selected,
                  })
                : t("shapes.clipboard.fitLeftOut", { count: fit.left });
    return (
        <p
            className="text-sub text-text-subtitle flex items-start gap-4"
            data-testid="clipboard-fit"
            data-fit={fit.fit}
        >
            {mismatch && (
                <WarningIcon
                    size={16}
                    weight="fill"
                    className="text-yellow mt-2 shrink-0"
                    aria-hidden
                />
            )}
            <span>{text}</span>
        </p>
    );
}

/** The picture's box in the card, in CSS pixels */
const VIEW = { width: 72, height: 52 } as const;
/** The chip's smaller box */
export const CHIP_VIEW = { width: 40, height: 28 } as const;

/**
 * The copied picture drawn small: its dots where they stood, and a shape's outline, a shape laid
 * out for the marchers selected when it pastes for another count. North is the
 * back of the field, as on the field itself. Decoration: the words beside it say what it is.
 */
export function PicturePreview({
    picture,
    summary,
    count,
    view = VIEW,
    testId = "clipboard-picture",
}: {
    picture: CopiedPicture;
    summary: PictureSummary;
    /** How many dots to draw: a shape laid out for another count draws that many */
    count: number;
    /** Its size: the card's by default */
    view?: { width: number; height: number };
    testId?: string;
}) {
    const { t } = useTranslate();
    // Room kept clear inside the box
    const pad = view.width < VIEW.width ? 4 : 6;
    const drawn = useMemo(() => {
        const shape = shapeDrawn(picture, summary, count);
        const dots = shape?.dots ?? picture.dots;
        const outline = shape?.outline ?? null;
        const points = [...dots, ...(outline?.points ?? [])];
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const width = Math.max(...xs) - left;
        const height = Math.max(...ys) - top;
        const scale = Math.min(
            width > 0 ? (view.width - 2 * pad) / width : Infinity,
            height > 0 ? (view.height - 2 * pad) / height : Infinity,
        );
        const k = Number.isFinite(scale) ? scale : 1;
        // Centered in the box
        const ox = (view.width - width * k) / 2 - left * k;
        const oy = (view.height - height * k) / 2 - top * k;
        const at = (p: { x: number; y: number }) => ({
            x: ox + p.x * k,
            y: oy + p.y * k,
        });
        return {
            dots: dots.map(at),
            outline: outline && {
                open: outline.open,
                points: outline.points
                    .map(at)
                    .map((p) => `${p.x},${p.y}`)
                    .join(" "),
            },
        };
    }, [picture, summary, count, view, pad]);
    // Smaller dots when there are many, so a block still reads as a block
    const r =
        (drawn.dots.length > 40 ? 1.25 : drawn.dots.length > 16 ? 1.75 : 2.25) *
        (view.width < VIEW.width ? 0.6 : 1);
    return (
        <svg
            width={view.width}
            height={view.height}
            viewBox={`0 0 ${view.width} ${view.height}`}
            role="img"
            aria-label={t("shapes.clipboard.pictureLabel")}
            className={clsx(
                // The chip's small one sits in a row: a row's radius (ui-styling)
                view.width < VIEW.width ? "rounded-4" : "rounded-6",
                "bg-fg-2 text-text shrink-0",
            )}
            data-testid={testId}
            data-dots={drawn.dots.length}
        >
            {drawn.outline &&
                (drawn.outline.open ? (
                    <polyline
                        points={drawn.outline.points}
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity={0.5}
                        strokeWidth={1.25}
                        strokeLinejoin="round"
                    />
                ) : (
                    <polygon
                        points={drawn.outline.points}
                        fill="currentColor"
                        fillOpacity={0.06}
                        stroke="currentColor"
                        strokeOpacity={0.5}
                        strokeWidth={1.25}
                        strokeLinejoin="round"
                    />
                ))}
            {drawn.dots.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={r} fill="currentColor" />
            ))}
        </svg>
    );
}

/** Snaps nothing: the picture is drawn too small for the grid to show */
const PICTURE_CONTEXT: ShapeContext = { stepPx: 1, snapPoint: (p) => p };

/**
 * A copied shape in field units as its kind draws it for `count` marchers: its outline, and its
 * spots when `count` isn't the number copied. None for positions or a group.
 */
function shapeDrawn(
    picture: CopiedPicture,
    summary: PictureSummary,
    count: number,
): {
    dots: readonly XY[] | null;
    outline: { points: XY[]; open: boolean } | null;
} | null {
    if (summary.type !== "shape" || !picture.shape) return null;
    const read = placedOf({ id: 0, ...picture.shape, members: [] });
    if (!read) return null;
    const { kind, params } = read;
    try {
        const dots =
            count === picture.dots.length
                ? null
                : kind.shape.generate(params, count, {
                      ...PICTURE_CONTEXT,
                      stepPx: picture.stepPx,
                  });
        const points = kind.outline
            ? [...kind.outline(params, count)]
            : frameCorners(kind.frameOf(params, count));
        return {
            dots,
            outline:
                points.length > 1
                    ? {
                          points,
                          open: kind.outlineOpen?.(params, count) ?? false,
                      }
                    : null,
        };
    } catch {
        return null;
    }
}
