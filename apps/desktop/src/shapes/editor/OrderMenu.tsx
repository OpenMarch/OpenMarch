import clsx from "clsx";
import * as Popover from "@radix-ui/react-popover";
import { CaretDownIcon } from "@phosphor-icons/react";
import tolgee from "@/global/singletons/Tolgee";
import type { OrderChoice } from "../assign";
import type { ShapeEditTarget } from "./editTargets";
import { arrowFocus, useEditorMenu, useMenuFocus } from "./menuFocus";
import { OrderPicture } from "./OrderPicture";
import { Tip } from "@/components/ui/Tip";

/** The answers, in the menu's order; Keep order only when offered */
export function orderOptions(
    keepOffered: boolean,
): { value: OrderChoice; label: string }[] {
    return [
        {
            value: "nearest",
            label: tolgee.t("shapes.edit.order.nearest", "Least travel"),
        },
        ...(keepOffered
            ? [
                  {
                      value: "keep" as const,
                      label: tolgee.t("shapes.edit.order.keep", "Keep order"),
                  },
              ]
            : []),
        {
            value: "reverse",
            label: tolgee.t("shapes.edit.order.reverse", "Reverse order"),
        },
    ];
}

/**
 * Who goes where on a kind with an order along it (a Line, #528): Least travel, Keep order (when
 * every marcher comes from one placed Line) or Reverse order. Like the kind's own menus, its button
 * names the answer the shape has, and picking another lays the marchers out again as one change.
 * Each answer's picture reads the new line as numbers (#559). None for a kind without an order.
 */
export function OrderMenu({
    target,
}: {
    target: Pick<ShapeEditTarget, "order">;
}) {
    const [open, setOpen] = useEditorMenu();
    const focus = useMenuFocus((el) =>
        el.querySelector<HTMLElement>(
            '[role="menuitemradio"][aria-checked="true"]',
        ),
    );
    const order = target.order;
    if (!order) return null;
    const label = tolgee.t("shapes.edit.order.label", "Who goes where");
    const options = orderOptions(order.keepOffered);
    const currentLabel =
        options.find((o) => o.value === order.current)?.label ?? order.current;
    const pick = (value: OrderChoice) => {
        setOpen(false);
        if (value !== order.current) order.pick(value);
    };
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Tip label={label}>
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label={`${label}: ${currentLabel}`}
                        {...focus.trigger}
                        data-testid="shape-order"
                        data-value={order.current}
                        className="rounded-4 hover:bg-fg-2 flex min-h-24 items-center gap-4 px-4 py-2"
                    >
                        <OrderPicture
                            choice={order.current}
                            testId="shape-order-picture"
                        />
                        <span>{currentLabel}</span>
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
                    data-testid="shape-order-content"
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
                        {options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                role="menuitemradio"
                                aria-checked={option.value === order.current}
                                onClick={() => pick(option.value)}
                                data-testid={`shape-order-${option.value}`}
                                className={clsx(
                                    "rounded-4 flex min-h-24 items-center gap-8 px-4 py-2 text-left",
                                    option.value === order.current
                                        ? "bg-fg-2 text-accent"
                                        : "hover:text-accent",
                                )}
                            >
                                <OrderPicture
                                    choice={option.value}
                                    testId={`shape-order-${option.value}-picture`}
                                />
                                <span>{option.label}</span>
                            </button>
                        ))}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
