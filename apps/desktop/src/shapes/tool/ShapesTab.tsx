import tolgee from "@/global/singletons/Tolgee";
import clsx from "clsx";
import { T } from "@tolgee/react";
import Shortcut from "@/components/ui/Shortcut";
import { useMemo } from "react";
import { ShapesIcon } from "@phosphor-icons/react";
import { performersOnly } from "@/global/classes/Marcher";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import ActionButton from "@/shortcuts/ActionButton";
import { getActionShortcutLabel } from "@/shortcuts/labels";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import { showShapeLibrary } from "../library/ShapeLibraryPanel";
import { clickPickedKind, kindPickGate, pickShapeKind } from "./pickKind";
import { SHAPE_TOOLS } from "./shapeTools";
import { toolId } from "./toolKind";
import { useShapeShown, useShapeToolStore } from "./shapeToolStore";
import { useStarredShapes } from "./starredShapes";
import ShapePreviewIcon from "../preview/ShapePreviewIcon";
import { Tip } from "@/components/ui/Tip";

/** Shapes show as pictures only, so many fit (#378): the name is the tooltip and the label */
const PREVIEW_SIZE = 26;

const BUTTON =
    "enabled:hover:text-accent flex items-center gap-6 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The top bar's Shapes tab (#348), the quick pick: every kind that can be drawn, as its picture
 * (#378), named by its tooltip. A kind's button runs its action, which goes through the host's `pickShapeKind`: it arms
 * the kind, or turns the open shape into it. With nobody selected the kinds are greyed out and
 * say why. After a divider come the starred shapes (#352), picked the same way, and the Library
 * button, which opens the shape library in the left sidebar.
 */
export default function ShapesTab() {
    const selected = useSelectedMarchers()?.selectedMarchers;
    const performers = useMemo(
        () => performersOnly(selected ?? []),
        [selected],
    );
    // A shape waiting away from its moment isn't picked: a kind starts over (#416)
    const shown = useShapeShown();
    const openKind = useShapeToolStore((s) => s.tool?.kind ?? null);
    const armed = shown ? openKind : null;
    const gate = kindPickGate(shown, performers);
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const ringKey = getActionShortcutLabel("openShapeRing", { overrides });
    const starred = useStarredShapes();
    /** A greyed-out shape's tooltip: its name, then why it can't be picked */
    const greyedTitle = (label: string) =>
        gate.ok
            ? undefined
            : tolgee.t("shapes.tool.tab.greyed", "{name}: {reason}", {
                  name: label,
                  reason: gate.reason,
              });
    return (
        <div className="flex w-full flex-wrap items-center gap-8">
            <ToolbarSection
                aria-label={tolgee.t("shapes.tool.tab.kinds", "Shape kinds")}
            >
                {SHAPE_TOOLS.map(({ kind, action }) => {
                    const on = kind === armed;
                    return (
                        // A disabled button gets no hover, so the tooltip sits on the wrapper: the
                        // name and key, or why it can't be picked
                        <Tip
                            key={toolId(kind)}
                            label={
                                greyedTitle(kind.shape.label) ??
                                kind.shape.label
                            }
                            action={gate.ok ? action : undefined}
                        >
                            <span>
                                <ActionButton
                                    action={action}
                                    // The app tooltip above, not the button's own title
                                    tooltip=""
                                    disabled={!gate.ok}
                                    // The picked kind again closes the tool if nothing is drawn (#411)
                                    onClick={(event) => {
                                        if (!on) return;
                                        event.preventDefault();
                                        clickPickedKind();
                                    }}
                                    aria-pressed={on}
                                    aria-label={kind.shape.label}
                                    data-testid={`shapes-tab-${toolId(kind)}`}
                                    className={clsx(
                                        "flex items-center",
                                        on ? "text-accent" : "text-text",
                                    )}
                                >
                                    <ShapePreviewIcon
                                        kind={kind}
                                        size={PREVIEW_SIZE}
                                        picked={on}
                                    />
                                </ActionButton>
                            </span>
                        </Tip>
                    );
                })}
                <span
                    aria-hidden
                    className="bg-stroke h-20 w-px"
                    data-testid="shapes-tab-divider"
                />
                {starred.map((shape) => {
                    const on = shape.kind === armed;
                    return (
                        <Tip key={shape.id} label={greyedTitle(shape.label)}>
                            <span>
                                <Tip label={gate.ok ? shape.label : undefined}>
                                    <button
                                        type="button"
                                        disabled={!gate.ok}
                                        onClick={() =>
                                            on
                                                ? clickPickedKind()
                                                : pickShapeKind(
                                                      shape.kind,
                                                      performers,
                                                  )
                                        }
                                        aria-label={shape.label}
                                        aria-pressed={on}
                                        className={clsx(
                                            BUTTON,
                                            on ? "text-accent" : "text-text",
                                        )}
                                        data-testid={`shapes-tab-starred-${shape.id}`}
                                    >
                                        <ShapePreviewIcon
                                            kind={shape.kind}
                                            size={PREVIEW_SIZE}
                                            picked={on}
                                        />
                                    </button>
                                </Tip>
                            </span>
                        </Tip>
                    );
                })}
                <Tip
                    label={tolgee.t(
                        "shapes.tool.tab.libraryTip",
                        "Open the shape library, to star shapes",
                    )}
                >
                    <button
                        type="button"
                        onClick={showShapeLibrary}
                        className={clsx(BUTTON, "text-text")}
                        data-testid="shapes-tab-library"
                    >
                        <ShapesIcon size={22} />
                        {tolgee.t("shapes.tool.tab.library", "Library")}
                    </button>
                </Tip>
            </ToolbarSection>
            {/* The ring has no button, so the tab says how to open it (sims, ring round 1) */}
            {ringKey && (
                <span
                    className="text-sub text-text-subtitle"
                    data-testid="shapes-tab-ring-hint"
                >
                    <T
                        keyName="shapes.tool.tab.ringHint"
                        defaultValue="Hold <keys></keys> on the field for the shape ring"
                        params={{
                            key: ringKey,
                            keys: () => <Shortcut action="openShapeRing" />,
                        }}
                    />
                </span>
            )}
            {!gate.ok && (
                <span
                    className="text-sub text-text-subtitle"
                    data-testid="shapes-tab-reason"
                >
                    {gate.reason}
                </span>
            )}
        </div>
    );
}
