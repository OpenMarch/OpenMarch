import { useEffect, useState } from "react";
import clsx from "clsx";
import { Tip } from "@/components/ui/Tip";
import tolgee from "@/global/singletons/Tolgee";
import * as Popover from "@radix-ui/react-popover";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { LAYOUT_LABELS, type LayoutFamily } from "../distribute/distribution";
import {
    hintText,
    isVersionAnyTurn,
    layoutVersionName,
    nearestVersion,
    shownFamily,
    versionDots,
    versionOf,
    type LayoutHint,
    type LayoutRow,
    type LayoutVersion,
    type ResolvedLayout,
} from "../distribute/layouts";
import { layoutOf, withLayout } from "../distribute/modes";
import { useLastLayoutStore } from "../tool/lastLayout";
import type { ToolEnv } from "../tool/toolKind";
import type { ShapeEditTarget } from "./editTargets";
import { keepFocus } from "./keepFocus";
import { arrowFocus, useEditorMenu, useMenuFocus } from "./menuFocus";

/**
 * The box's layout menu (#387, spec #385; owner lab feedback, 2026-10-23), on the floating
 * editor's second row (#435). Full · Stagger · Rounded · Short back · Notched always keep their
 * places: a layout the count can't make shows greyed, as a picture of it at the nearest count it
 * makes, with what it needs ("add 1 / remove 2"). Each version is a live thumbnail labelled by its block
 * ("5 × 5"), the counts in its tooltip. A shape and its quarter turn are one version: the chip's
 * turn button makes the other. Picking a version is one change of the shape and becomes the
 * layout a new box starts in.
 */

type Target = Pick<ShapeEditTarget, "kind" | "params" | "spots" | "apply">;

/** The layout menu's height, in CSS px: the five layouts, and two or three versions beside them */
const LAYOUT_MENU_HEIGHT = 240;

interface PickerProps {
    target: Target;
    /** The field's tool environment when a version is picked; null with no field */
    envFor: () => ToolEnv | null;
    /** The look of what holds it where it sits (the floating editor's pill) */
    className?: string;
}

/**
 * Picks `version` for the shape, and remembers its layout for the next new box. Picking what the
 * box already shows is nothing: a Short back block that reads as Full stays Short back underneath
 * when Full's same version is picked (#437)
 */
function usePick({ target, envFor }: PickerProps) {
    const remember = useLastLayoutStore((s) => s.remember);
    return (version: LayoutVersion) => {
        const env = envFor();
        if (!env) return;
        const now = layoutOf(target.kind, target.params, target.spots);
        if (
            now &&
            shownFamily(now) === version.layout.family &&
            isOwn(version, now)
        )
            return;
        remember(version.layout.family);
        const next = withLayout(
            target.kind,
            target.params,
            target.spots,
            version.layout,
            env,
        );
        if (next !== target.params) target.apply(next);
    };
}

/** Whether `version` is the shape's own, as it is or turned a quarter */
const isOwn = (version: LayoutVersion, now: ResolvedLayout) =>
    isVersionAnyTurn(version, now.lines, now.layout.byFile);

/** "Full needs 24 or 21 marchers: add 1 / remove 2" */
function needsTitle(label: string, hint: LayoutHint, n: number): string {
    const counts = [
        hint.more !== null && n + hint.more,
        hint.fewer !== null && n - hint.fewer,
    ].filter((c): c is number => c !== false);
    if (counts.length === 0)
        return tolgee.t(
            "shapes.edit.layout.cantMake",
            "{label} can't make {count}",
            {
                label,
                count: n,
            },
        );
    return counts.length > 1
        ? tolgee.t(
              "shapes.edit.layout.needsEither",
              "{label} needs {a} or {b} marchers: {hint}",
              { label, a: counts[0], b: counts[1], hint: hintText(hint) },
          )
        : tolgee.t(
              "shapes.edit.layout.needs",
              "{label} needs {count, plural, one {# marcher} other {# marchers}}: {hint}",
              { label, count: counts[0], hint: hintText(hint) },
          );
}

/**
 * The chip's layout menu: the layout the box has on its button, and nothing more when the count
 * can't make the one picked (owner, #435): open, it lists every layout, greyed with what it needs
 * where the count can't make it; hovering a layout or clicking its arrow shows its versions beside
 * the list.
 */
export function LayoutMenu(props: PickerProps) {
    const { target } = props;
    const pick = usePick(props);
    const [open, setOpen] = useEditorMenu();
    const [active, setActive] = useState<LayoutFamily | null>(null);
    // Closed any way (another of the editor's menus opening too), it opens next on the box's own
    useEffect(() => {
        if (!open) setActive(null);
    }, [open]);
    // Closed by a press (a layout picked, a click away): focus isn't handed back to the button,
    // or the floating editor would stay solid with the pointer away (#426). Opened by keyboard,
    // focus goes to the shape's layout, the arrows move up and down the list, and Escape or a
    // pick hands focus back (review)
    const focus = useMenuFocus((el) =>
        el.querySelector<HTMLElement>('[role="menuitem"][data-current]'),
    );
    const now = layoutOf(target.kind, target.params, target.spots);
    const rows = target.kind.closed?.layouts?.catalogue(target.spots) ?? [];
    if (now === null || rows.length === 0) return null;
    const n = target.spots;
    // Short back with nothing short reads as Full (#437)
    const family = shownFamily(now);
    const showing = active ?? family;
    const choose = (version: LayoutVersion) => {
        pick(version);
        setOpen(false);
        setActive(null);
    };
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <span
                className={clsx("flex items-center gap-4", props.className)}
                data-testid="shape-layout-pill"
            >
                <Tip label={tolgee.t("shapes.edit.layout.label", "Layout")}>
                    <Popover.Trigger asChild>
                        <button
                            type="button"
                            aria-label={tolgee.t(
                                "shapes.edit.layout.aria",
                                "Layout: {label}",
                                {
                                    label: LAYOUT_LABELS[family],
                                },
                            )}
                            {...focus.trigger}
                            data-testid="shape-layout-menu"
                            className="rounded-4 hover:bg-fg-2 flex items-center gap-4 px-4 py-2"
                        >
                            <Thumbnail
                                version={versionOf(now.layout, now.lines)}
                                small
                            />
                            <span>{LAYOUT_LABELS[family]}</span>
                            <CaretDownIcon size={10} />
                        </button>
                    </Popover.Trigger>
                </Tip>
            </span>
            <Popover.Portal>
                <Popover.Content
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    {...focus.content}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="rounded-6 border-stroke bg-bg-1 bg-modal text-sub text-text shadow-modal z-50 flex gap-8 border p-6"
                    // One height whatever's hovered, so it doesn't jump: every layout and two or
                    // three versions, less where the screen has no room (owner)
                    style={{
                        height: `min(${LAYOUT_MENU_HEIGHT}px, var(--radix-popover-content-available-height))`,
                    }}
                    data-testid="shape-layout-menu-content"
                >
                    {/* Built only while open: closed, the editor re-renders it for nothing (#455) */}
                    {open && (
                        <LayoutMenuBody
                            rows={rows}
                            now={now}
                            n={n}
                            family={family}
                            showing={showing}
                            setActive={setActive}
                            choose={choose}
                        />
                    )}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

/** The open layout menu: every layout with its picture, and the shown one's versions beside it */
function LayoutMenuBody({
    rows,
    now,
    n,
    family,
    showing,
    setActive,
    choose,
}: {
    rows: readonly LayoutRow[];
    now: ResolvedLayout;
    n: number;
    family: LayoutFamily;
    showing: LayoutFamily;
    setActive: (family: LayoutFamily) => void;
    choose: (version: LayoutVersion) => void;
}) {
    const aspect = now.across / now.deep;
    /** A layout's row picture: the shape's own version, or the one nearest its proportions */
    const pictureOf = (row: LayoutRow) =>
        row.versions.find((v) => isOwn(v, now)) ??
        nearestVersion(row.family, n, aspect) ??
        undefined;
    const shownRow = rows.find((r) => r.family === showing);
    return (
        <>
            <div
                className="flex flex-col gap-1 overflow-y-auto"
                role="menu"
                onKeyDown={(e) =>
                    arrowFocus(e, [
                        ...e.currentTarget.querySelectorAll<HTMLElement>(
                            '[role="menuitem"]:not([aria-disabled])',
                        ),
                    ])
                }
            >
                {rows.map((row) => {
                    const missing = row.versions.length === 0;
                    const picture = missing
                        ? row.preview?.version
                        : pictureOf(row);
                    return (
                        <div
                            key={row.family}
                            className={clsx(
                                "rounded-4 flex items-center",
                                showing === row.family && !missing && "bg-fg-2",
                            )}
                        >
                            <Tip
                                label={
                                    missing && row.hint
                                        ? needsTitle(row.label, row.hint, n)
                                        : undefined
                                }
                            >
                                <button
                                    type="button"
                                    role="menuitem"
                                    // aria-disabled, not disabled: the tooltip says why
                                    aria-disabled={missing || undefined}
                                    data-current={
                                        family === row.family || undefined
                                    }
                                    onPointerEnter={() => {
                                        if (!missing) setActive(row.family);
                                    }}
                                    // The versions follow the keyboard as the pointer
                                    onFocus={() => {
                                        if (!missing) setActive(row.family);
                                    }}
                                    onClick={() => {
                                        if (picture && !missing)
                                            choose(picture);
                                    }}
                                    data-testid={`shape-layout-menu-row-${row.family}`}
                                    className={clsx(
                                        "flex min-w-40 items-center gap-6 px-4 py-2 text-left",
                                        missing
                                            ? "text-text/40"
                                            : family === row.family
                                              ? "text-accent"
                                              : "hover:text-accent",
                                    )}
                                >
                                    <span
                                        className={clsx(
                                            "flex w-24 justify-center",
                                            missing && "opacity-40",
                                        )}
                                    >
                                        {picture && (
                                            <Thumbnail
                                                version={picture}
                                                small
                                            />
                                        )}
                                    </span>
                                    <span className="grow">{row.label}</span>
                                    {missing && row.hint && (
                                        <span className="text-xs">
                                            {hintText(row.hint)}
                                        </span>
                                    )}
                                </button>
                            </Tip>
                            {!missing && (
                                <button
                                    type="button"
                                    aria-label={tolgee.t(
                                        "shapes.edit.layout.showVersions",
                                        "Show the {label} versions",
                                        { label: row.label },
                                    )}
                                    onPointerDown={keepFocus}
                                    onClick={() => setActive(row.family)}
                                    data-testid={`shape-layout-menu-expand-${row.family}`}
                                    className="hover:text-accent px-4 py-2"
                                >
                                    <CaretRightIcon size={10} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
            {/* The versions in a panel as tall as the list and of one width, scrolling
            when a layout has more (owner: the menu jumped as Short back's tall list
            grew it) */}
            <div className="border-stroke relative w-[96px] shrink-0 self-stretch border-l">
                <div
                    className="absolute inset-0 flex flex-wrap content-start gap-2 overflow-y-auto pl-8"
                    data-testid="shape-layout-menu-versions"
                >
                    {shownRow?.versions.map((version, i) => (
                        <VersionButton
                            key={i}
                            name={layoutVersionName(
                                shownRow.label,
                                version.label,
                            )}
                            version={version}
                            on={isOwn(version, now)}
                            onPick={() => choose(version)}
                            testId={`shape-layout-menu-version-${shownRow.family}-${i}`}
                            caption={version.label}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}

function VersionButton({
    name,
    version,
    on,
    onPick,
    testId,
    caption,
}: {
    /** "Stagger 5 × 5" */
    name: string;
    version: LayoutVersion;
    on: boolean;
    onPick: () => void;
    testId: string;
    caption?: string;
}) {
    return (
        <Tip label={`${name}: ${version.tooltip}`}>
            <button
                type="button"
                aria-label={name}
                aria-pressed={on}
                onPointerDown={keepFocus}
                onClick={onPick}
                data-testid={testId}
                className={clsx(
                    "rounded-4 flex flex-col items-center gap-2 border p-4",
                    on
                        ? "border-accent bg-accent/10 text-accent"
                        : "hover:bg-fg-2 text-text border-transparent",
                )}
            >
                <Thumbnail version={version} />
                {caption && (
                    <span className={clsx("text-xs", !on && "text-text/60")}>
                        {caption}
                    </span>
                )}
            </button>
        </Tip>
    );
}

/** The version's spots as dots, drawn from the layout itself */
function Thumbnail({
    version,
    small,
}: {
    version: LayoutVersion;
    small?: boolean;
}) {
    const dots = versionDots(version.lines, version.layout.byFile);
    // Half an interval per unit; big enough in the inspector to read a version at a glance
    const most = Math.max(version.across, version.deep);
    const unit = Math.min(small ? 1.75 : 4, (small ? 18 : 48) / (2 * most));
    const w = version.across * 2 * unit;
    const h = version.deep * 2 * unit;
    return (
        <svg
            width={w}
            height={h}
            viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`}
            aria-hidden
        >
            {dots.map((d, i) => (
                <circle
                    key={i}
                    cx={d.x * unit}
                    cy={d.y * unit}
                    r={unit * 0.6}
                    fill="currentColor"
                />
            ))}
        </svg>
    );
}
