import tolgee from "@/global/singletons/Tolgee";
import clsx from "clsx";
import { T } from "@tolgee/react";
import Shortcut from "@/components/ui/Shortcut";
import { useMemo } from "react";
import { performersOnly } from "@/global/classes/Marcher";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import ActionButton from "@/shortcuts/ActionButton";
import { getEffectiveBindings } from "@/shortcuts/keymap";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import { clickPickedKind, kindPickGate } from "./pickKind";
import { SHAPE_TOOLS } from "./shapeTools";
import { toolId } from "./toolKind";
import { useShapeShown, useShapeToolStore } from "./shapeToolStore";
import ShapePreviewIcon from "../preview/ShapePreviewIcon";
import { Tip } from "@/components/ui/Tip";
import { CircleDashedIcon } from "@phosphor-icons/react";
import { useIsTouchMode } from "@/stores/InputModeStore";
import { useShowShortcutHints } from "@/stores/KeyboardSeenStore";

/** Shapes show as pictures only, so many fit (#378): the name is the tooltip and the label */
const PREVIEW_SIZE = 26;

/**
 * The top bar's Shapes tab (#348), the quick pick: every kind that can be drawn, as its picture
 * (#378), named by its tooltip. A kind's button runs its action, which goes through the host's `pickShapeKind`: it arms
 * the kind, or turns the open shape into it. With nobody selected the kinds are greyed out and
 * say why.
 *
 * In the touch layout each kind is captioned with its name (no tooltips there), and a Ring button
 * opens the favorites ring, the `openShapeRing` action that holding R runs. The "Hold R" hint
 * shows only once a keyboard has been used (tablet plan 2.2).
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
    const hasRingKey =
        getEffectiveBindings("openShapeRing", overrides).length > 0;
    const isTouch = useIsTouchMode();
    const showHints = useShowShortcutHints();
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
                                    caption={kind.shape.label}
                                    data-testid={`shapes-tab-${toolId(kind)}`}
                                    className={clsx(
                                        "touch:flex-col touch:gap-2 flex items-center",
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
            </ToolbarSection>
            {/* A finger has no R to hold: the ring gets a button, opening it at the field's middle */}
            {isTouch && (
                <ToolbarSection>
                    <ActionButton
                        action="openShapeRing"
                        args={{ latched: true, atField: true }}
                        caption={tolgee.t(
                            "shapes.tool.tab.ringCaption",
                            "Ring",
                        )}
                        data-testid="shapes-tab-ring"
                        className="touch:min-h-44 flex flex-col items-center justify-center gap-2"
                    >
                        <CircleDashedIcon size={24} />
                    </ActionButton>
                </ToolbarSection>
            )}
            {/* With a mouse the ring has no button, so the tab says how to open it (sims, ring
                round 1); on a tablet only once a keyboard has been used */}
            {hasRingKey && showHints && (
                <span
                    className="text-sub text-text-subtitle flex items-center gap-4"
                    data-testid="shapes-tab-ring-hint"
                >
                    <T
                        keyName="shapes.tool.tab.ringHintKeys"
                        params={{
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
