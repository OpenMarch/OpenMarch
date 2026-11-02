import clsx from "clsx";
import * as Popover from "@radix-ui/react-popover";
import { CaretDownIcon } from "@phosphor-icons/react";
import tolgee from "@/global/singletons/Tolgee";
import { MODE_LABELS, type DistributionMode } from "../distribute/distribution";
import { distributionOf, switchModes, withMode } from "../distribute/modes";
import { ModePicture } from "./modePictures";
import type { ToolEnv } from "../tool/toolKind";
import type { ShapeEditTarget } from "./editTargets";
import { arrowFocus, useEditorMenu, useMenuFocus } from "./menuFocus";
import { Tip } from "@/components/ui/Tip";

const modeLabel = (mode: DistributionMode) =>
    tolgee.t(`shapes.edit.mode.${mode}`, MODE_LABELS[mode]);

/**
 * How the shape is filled (spec #385): Grid, Outline or Spread, first on the floating editor's
 * second row (#435). A menu like the layout menu (owner): its button names the mode, and each row
 * shows one example of that mode, the same for every kind (`modePictures`), beside its name.
 * Only the kind's own modes show, and nothing while it has one. Picking one is one change of the shape
 * (one undo step, or one save for a placed shape).
 */
export function ModeMenu({
    target,
    envFor,
}: {
    target: Pick<ShapeEditTarget, "kind" | "params" | "spots" | "apply">;
    /** The field's tool environment when the mode is picked; null with no field */
    envFor: () => ToolEnv | null;
}) {
    const [open, setOpen] = useEditorMenu();
    // Opened by keyboard, focus goes to the mode the shape is in now
    const focus = useMenuFocus((el) =>
        el.querySelector<HTMLElement>(
            '[role="menuitemradio"][aria-checked="true"]',
        ),
    );
    const modes = switchModes(target.kind);
    const current = distributionOf(target.kind, target.params, target.spots);
    if (modes.length === 0 || !current) return null;
    const pick = (mode: DistributionMode) => {
        setOpen(false);
        const env = envFor();
        if (!env) return;
        const next = withMode(
            target.kind,
            target.params,
            target.spots,
            mode,
            env,
        );
        if (next !== target.params) target.apply(next);
    };
    const label = tolgee.t("shapes.edit.mode.label", "Fill");
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Tip label={label}>
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label={`${label}: ${modeLabel(current.mode)}`}
                        {...focus.trigger}
                        data-testid="shape-mode-menu"
                        data-mode={current.mode}
                        className="rounded-4 hover:bg-fg-2 flex min-h-24 items-center gap-4 px-4 py-2"
                    >
                        <span>{modeLabel(current.mode)}</span>
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
                    data-testid="shape-mode-menu-content"
                >
                    <div
                        className="flex flex-col gap-1"
                        role="menu"
                        aria-label={label}
                        onKeyDown={(e) =>
                            arrowFocus(e, [
                                ...e.currentTarget.querySelectorAll<HTMLElement>(
                                    '[role="menuitemradio"]',
                                ),
                            ])
                        }
                    >
                        {modes.map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                role="menuitemradio"
                                aria-checked={mode === current.mode}
                                onClick={() => pick(mode)}
                                data-testid={`shape-mode-${mode}`}
                                className={clsx(
                                    "rounded-4 flex min-h-24 items-center gap-8 px-4 py-2 text-left",
                                    mode === current.mode
                                        ? "bg-fg-2 text-accent"
                                        : "hover:text-accent",
                                )}
                            >
                                <ModePicture mode={mode} />
                                <span>{modeLabel(mode)}</span>
                            </button>
                        ))}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
