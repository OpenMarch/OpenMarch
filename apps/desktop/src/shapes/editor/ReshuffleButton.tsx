import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import * as Popover from "@radix-ui/react-popover";
import { CaretDownIcon, CopyIcon, ShuffleIcon } from "@phosphor-icons/react";
import { Tip } from "@/components/ui/Tip";
import tolgee from "@/global/singletons/Tolgee";
import {
    distributionOf,
    parseSeed,
    reshuffle,
    withSeed,
} from "../distribute/modes";
import type { ToolEnv } from "../tool/toolKind";
import type { ShapeEditTarget } from "./editTargets";
import { keepFocus } from "./keepFocus";
import { useEditorMenu, useMenuFocus } from "./menuFocus";

type Target = Pick<
    ShapeEditTarget,
    "kind" | "params" | "spots" | "apply" | "update"
>;

/**
 * Reshuffle (spec #385): a spread's next layout, on the floating editor's second row. Shown only
 * while the shape is an even spread. One change of the shape (one undo step, or one save for a
 * placed shape). A split button (#437): its caret opens the spread's seed, for people who want a
 * spread back exactly, to type or copy. A spread is its seed, its count and its shape's
 * proportions (a box's across × deep); the spacing only scales it, and the size it was drawn at
 * doesn't count (`spreadScale`), so the seed shows with the count and the hint says so (owner).
 */
export function ReshuffleButton({
    target,
    envFor,
    className,
    testId,
}: {
    target: Target;
    /** The field's tool environment when it's pressed; null with no field */
    envFor: () => ToolEnv | null;
    className?: string;
    testId: string;
}) {
    const d = distributionOf(target.kind, target.params, target.spots);
    if (d?.mode !== "spread") return null;
    return (
        <span className="flex items-center">
            <Tip
                label={tolgee.t(
                    "shapes.edit.reshuffle.title",
                    "Reshuffle: a new layout",
                )}
            >
                <button
                    type="button"
                    onPointerDown={keepFocus}
                    onClick={() => {
                        const env = envFor();
                        if (!env) return;
                        const next = reshuffle(
                            target.kind,
                            target.params,
                            target.spots,
                            env,
                        );
                        if (next !== null) target.apply(next);
                    }}
                    data-testid={testId}
                    data-seed={d.seed}
                    className={clsx("flex items-center gap-4", className)}
                >
                    <ShuffleIcon size={14} />
                    {tolgee.t("shapes.edit.reshuffle.label", "Reshuffle")}
                </button>
            </Tip>
            <SeedMenu
                target={target}
                envFor={envFor}
                seed={d.seed}
                testId={`${testId}-seed`}
            />
        </span>
    );
}

/** The spread's seed: typed to lay the spread out with it, or copied */
function SeedMenu({
    target,
    envFor,
    seed,
    testId,
}: {
    target: Target;
    envFor: () => ToolEnv | null;
    seed: number;
    testId: string;
}) {
    const [open, setOpen] = useEditorMenu();
    // What's typed, kept in the one input (never remounted, so it keeps the focus) and shown
    // afresh when the seed changes: Reshuffle, undo, a seed applied (review)
    const [text, setText] = useState(String(seed));
    const [invalid, setInvalid] = useState(false);
    const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
    // Escape cancels what's typed; any other close (a click away) commits it
    const escaped = useRef(false);
    useEffect(() => {
        setText(String(seed));
        setInvalid(false);
    }, [seed]);
    // Closed, by Escape, a click away or another of the editor's menus opening: Escape cancels
    // what's typed, any other way commits it
    const wasOpen = useRef(false);
    useEffect(() => {
        if (wasOpen.current && !open) {
            if (escaped.current || !commit(text)) setText(String(seed));
            setInvalid(false);
            escaped.current = false;
        }
        wasOpen.current = open;
        // Only the change of open matters: text and seed are read as they are then
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    // Opened by keyboard, focus goes to the seed
    const focus = useMenuFocus((el) => el.querySelector<HTMLElement>("input"));
    const label = tolgee.t("shapes.edit.seed.label", "Seed");
    const copyLabel = tolgee.t("shapes.edit.seed.copy", "Copy the seed");
    const canCopy = typeof navigator.clipboard?.writeText === "function";
    /**
     * Lays the spread out with the typed seed, from the shape as it is now (`update`), as one
     * change; false when it isn't a seed
     */
    const commit = (typedText: string) => {
        const typed = parseSeed(typedText);
        if (typed === null) return false;
        if (typed === seed) return true;
        target.update((now) => {
            const env = envFor();
            return (
                (env && withSeed(target.kind, now, target.spots, typed, env)) ??
                now
            );
        });
        return true;
    };
    return (
        <Popover.Root
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                setCopy("idle");
            }}
        >
            <Tip label={`${label}: ${seed}`}>
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label={`${label}: ${seed}`}
                        {...focus.trigger}
                        data-testid={testId}
                        className="rounded-4 hover:text-accent hover:bg-fg-2 flex min-h-24 items-center px-2"
                    >
                        <CaretDownIcon size={10} />
                    </button>
                </Popover.Trigger>
            </Tip>
            <Popover.Portal>
                <Popover.Content
                    side="bottom"
                    align="end"
                    sideOffset={6}
                    {...focus.content}
                    onEscapeKeyDown={() => {
                        escaped.current = true;
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="rounded-6 border-stroke bg-bg-1 bg-modal text-sub text-text shadow-modal z-50 flex flex-col gap-6 border p-8"
                    data-testid={`${testId}-menu`}
                >
                    <div className="flex items-center gap-8">
                        <span className="text-text/80">{label}</span>
                        <input
                            value={text}
                            onChange={(e) => {
                                setText(e.currentTarget.value);
                                setInvalid(false);
                            }}
                            inputMode="numeric"
                            aria-label={label}
                            aria-invalid={invalid || undefined}
                            className="rounded-4 border-stroke bg-fg-1 w-80 border px-6 py-2 tabular-nums"
                            data-testid={`${testId}-input`}
                            onKeyDown={(e) => {
                                // Its keys are its own: Enter applies it rather than placing the
                                // shape, and digits don't reach the app's shortcuts. Escape still
                                // closes the menu
                                if (e.key !== "Escape") e.stopPropagation();
                                if (e.key !== "Enter") return;
                                e.preventDefault();
                                setInvalid(!commit(text));
                            }}
                        />
                        <span
                            className="text-text/60"
                            data-testid={`${testId}-count`}
                        >
                            {tolgee.t(
                                "shapes.edit.seed.count",
                                "for {count} marchers",
                                { count: target.spots },
                            )}
                        </span>
                        {canCopy && (
                            <Tip
                                label={
                                    copy === "copied"
                                        ? tolgee.t(
                                              "shapes.edit.seed.copied",
                                              "Copied",
                                          )
                                        : copy === "failed"
                                          ? tolgee.t(
                                                "shapes.edit.seed.copyFailed",
                                                "Copy failed",
                                            )
                                          : copyLabel
                                }
                            >
                                <button
                                    type="button"
                                    aria-label={copyLabel}
                                    onClick={() => {
                                        navigator.clipboard
                                            .writeText(String(seed))
                                            .then(
                                                () => setCopy("copied"),
                                                () => setCopy("failed"),
                                            );
                                    }}
                                    data-testid={`${testId}-copy`}
                                    data-copy={copy}
                                    className="rounded-4 hover:text-accent flex min-h-24 min-w-24 items-center justify-center p-4"
                                >
                                    <CopyIcon size={14} />
                                </button>
                            </Tip>
                        )}
                    </div>
                    <p className="text-text/60 max-w-[15rem] text-xs">
                        {tolgee.t(
                            "shapes.edit.seed.hint",
                            "Same seed and count in the same shape: same spread. The spacing only scales it.",
                        )}
                    </p>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
