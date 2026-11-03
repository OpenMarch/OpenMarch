import clsx from "clsx";
import * as Popover from "@radix-ui/react-popover";
import {
    CaretDownIcon,
    CheckIcon,
    CompassToolIcon,
} from "@phosphor-icons/react";
import tolgee from "@/global/singletons/Tolgee";
import {
    useShapeGuidesStore,
    type ShapeGuide,
} from "@/shapes/field/shapeGuides";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import type { ShapeEditTarget } from "./editTargets";
import { arrowFocus, useEditorMenu, useMenuFocus } from "./menuFocus";
import { ChoicePicture } from "./ChoicePicture";
import { GlyphText } from "./GlyphText";
import { Tip } from "@/components/ui/Tip";

// A kind's menus hold choices of any kind's params
type Choice = NonNullable<AnyToolKind["choices"]>[number];

/**
 * A kind's own menus (#523), under the floating editor beside how it's filled: a Line's spacing.
 * Like the mode menu, its button names the answer the shape has, and picking another is one change
 * of the shape (one undo step, or one save for a placed shape). None for a kind without.
 */
export function ChoiceMenus({
    target,
    envFor,
}: {
    target: Pick<ShapeEditTarget, "kind" | "params" | "spots" | "apply">;
    /** The field's tool environment when an answer is picked; null with no field */
    envFor: () => ToolEnv | null;
}) {
    return (
        <>
            {(target.kind.choices ?? [])
                .filter(
                    (choice) =>
                        choice.shown?.(target.params, target.spots) ?? true,
                )
                .map((choice) => (
                    <ChoiceMenu
                        key={choice.key}
                        choice={choice}
                        target={target}
                        envFor={envFor}
                    />
                ))}
        </>
    );
}

function ChoiceMenu({
    choice,
    target,
    envFor,
}: {
    choice: Choice;
    target: Pick<ShapeEditTarget, "params" | "spots" | "apply">;
    envFor: () => ToolEnv | null;
}) {
    const [open, setOpen] = useEditorMenu();
    // Opened by keyboard, focus goes to the answer the shape has now
    const focus = useMenuFocus((el) =>
        el.querySelector<HTMLElement>(
            '[role="menuitemradio"][aria-checked="true"]',
        ),
    );
    const options = choice.options(target.params, target.spots);
    const current = choice.current(target.params, target.spots);
    const currentOption = options.find((o) => o.value === current);
    const currentLabel = currentOption?.label ?? current;
    const pick = (value: string) => {
        setOpen(false);
        const env = envFor();
        if (!env || value === current) return;
        if (options.find((o) => o.value === value)?.disabled) return;
        const next = choice.pick(target.params, target.spots, value, env);
        if (next !== target.params) target.apply(next);
    };
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Tip label={choice.label}>
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label={`${choice.label}: ${currentLabel}`}
                        {...focus.trigger}
                        data-testid={`shape-choice-${choice.key}`}
                        data-value={current}
                        className="rounded-4 hover:bg-fg-2 flex min-h-24 items-center gap-4 px-4 py-2"
                    >
                        {currentOption?.picture && (
                            <ChoicePicture
                                picture={currentOption.picture}
                                testId={`shape-choice-${choice.key}-picture`}
                            />
                        )}
                        <span>
                            <GlyphText text={currentLabel} size={12} />
                        </span>
                        <CaretDownIcon size={10} />
                    </button>
                </Popover.Trigger>
            </Tip>
            <Popover.Portal>
                <Popover.Content
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    {...focus.content}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="rounded-6 border-stroke bg-bg-1 bg-modal text-sub text-text shadow-modal z-50 border p-6"
                    data-testid={`shape-choice-${choice.key}-content`}
                >
                    <div
                        className="flex flex-col gap-1"
                        role="menu"
                        aria-label={choice.label}
                        onKeyDown={(e) =>
                            arrowFocus(e, [
                                ...e.currentTarget.querySelectorAll<HTMLElement>(
                                    '[role="menuitemradio"]',
                                ),
                            ])
                        }
                    >
                        {options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                role="menuitemradio"
                                aria-checked={option.value === current}
                                // Greyed out but still reachable, so its reason can be read
                                aria-disabled={
                                    option.disabled ? true : undefined
                                }
                                aria-describedby={
                                    option.disabled
                                        ? `shape-choice-${choice.key}-${option.value}-reason`
                                        : undefined
                                }
                                onClick={() => pick(option.value)}
                                data-testid={`shape-choice-${choice.key}-${option.value}`}
                                className={clsx(
                                    "rounded-4 flex min-h-24 items-center gap-8 px-4 py-2 text-left",
                                    option.value === current
                                        ? "bg-fg-2 text-accent"
                                        : option.disabled
                                          ? "text-text/40 cursor-default"
                                          : "hover:text-accent",
                                )}
                            >
                                {option.picture && (
                                    <ChoicePicture
                                        picture={option.picture}
                                        testId={`shape-choice-${choice.key}-${option.value}-picture`}
                                    />
                                )}
                                <span className="flex flex-col items-start">
                                    <span className="flex items-center gap-4">
                                        <GlyphText
                                            text={option.label}
                                            size={12}
                                        />
                                    </span>
                                    {option.disabled && (
                                        <span
                                            id={`shape-choice-${choice.key}-${option.value}-reason`}
                                            className="text-text/60 text-xs"
                                        >
                                            {option.disabled}
                                        </span>
                                    )}
                                </span>
                            </button>
                        ))}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

/** The Guides menu's words for each guide */
const GUIDE_LABELS: Record<ShapeGuide, () => string> = {
    circle: () => tolgee.t("shapes.edit.guides.circle", "Circle"),
    angles: () => tolgee.t("shapes.edit.guides.angles", "Angle lines"),
};

/**
 * The Guides menu (owner on #634): which of the kind's construction guides are drawn while it's
 * edited, each checked on or off on its own (an Arc's circle, and its angle lines). A compass
 * among the editor's view controls, since it changes what's shown, not the shape. The user's
 * choice, kept for every shape. None for a kind without guides, or a shape with none to draw now.
 */
export function GuidesMenu({
    target,
}: {
    target: Pick<ShapeEditTarget, "kind" | "params" | "spots">;
}) {
    const [open, setOpen] = useEditorMenu();
    const shown = useShapeGuidesStore((s) => s.shown);
    const focus = useMenuFocus((el) =>
        el.querySelector<HTMLElement>('[role="menuitemcheckbox"]'),
    );
    const guides = target.kind.guides ?? [];
    if (
        guides.length === 0 ||
        (target.kind.construction?.(target.params, target.spots) ?? [])
            .length === 0
    )
        return null;
    const label = tolgee.t("shapes.edit.guides.label", "Guides");
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Tip label={label}>
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label={label}
                        {...focus.trigger}
                        data-testid="shape-guides"
                        className="rounded-4 hover:text-accent flex min-h-24 items-center gap-2 p-4"
                    >
                        <CompassToolIcon size={14} />
                        <CaretDownIcon size={8} />
                    </button>
                </Popover.Trigger>
            </Tip>
            <Popover.Portal>
                <Popover.Content
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    {...focus.content}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="rounded-6 border-stroke bg-bg-1 bg-modal text-sub text-text shadow-modal z-50 border p-6"
                    data-testid="shape-guides-content"
                >
                    <div
                        className="flex flex-col gap-1"
                        role="menu"
                        aria-label={label}
                        onKeyDown={(e) =>
                            arrowFocus(e, [
                                ...e.currentTarget.querySelectorAll<HTMLElement>(
                                    '[role="menuitemcheckbox"]',
                                ),
                            ])
                        }
                    >
                        {guides.map((guide) => (
                            // Checked on and off in place: the menu stays open
                            <button
                                key={guide}
                                type="button"
                                role="menuitemcheckbox"
                                aria-checked={shown[guide]}
                                onClick={() =>
                                    useShapeGuidesStore.getState().toggle(guide)
                                }
                                data-testid={`shape-guides-${guide}`}
                                className="rounded-4 hover:text-accent flex min-h-24 items-center gap-8 px-4 py-2 text-left"
                            >
                                <span className="flex w-12 justify-center">
                                    {shown[guide] && <CheckIcon size={12} />}
                                </span>
                                <span>{GUIDE_LABELS[guide]()}</span>
                            </button>
                        ))}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
