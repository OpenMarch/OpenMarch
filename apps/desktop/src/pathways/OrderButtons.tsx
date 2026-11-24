import clsx from "clsx";
import {
    ArrowsLeftRightIcon,
    EraserIcon,
    ListNumbersIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import tolgee from "@/global/singletons/Tolgee";
import ActionButton from "@/shortcuts/ActionButton";
import type { ActionId } from "@/shortcuts/definitions";
import { Tip } from "@/components/ui/Tip";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import { useMarcherOrderStore, useOrderHoverProps } from "./marcherOrderStore";
import { orderRefusal } from "./useMarcherOrder";

const BUTTON =
    "enabled:hover:text-accent flex items-center gap-6 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The toolbar's line order (pathways step 4g): Set order (lit while it's on), Reverse and Clear
 * order, each running its action. Greyed with fewer than two marchers, the tooltip saying why.
 * Pointing at any of them shows the selection's order, so you see what it changes.
 */
export function OrderButtons({ performers }: { performers: number }) {
    const sweeping = useMarcherOrderStore((s) => s.sweep !== null);
    const refusal = orderRefusal(performers, false);
    const label = tolgee.t("pathways.toolbar.order", "Order");
    const orderHover = useOrderHoverProps();
    return (
        <ToolbarSection aria-label={label}>
            <OrderButton
                action="setMarcherOrder"
                label={tolgee.t("actions.path.setOrder", "Set order")}
                tip={tolgee.t(
                    "pathways.toolbar.setOrderTip",
                    "Set order: drag through the selected marchers from the leader to the tail, or click them one by one",
                )}
                refusal={refusal}
                pressed={sweeping}
                testId="toolbar-set-order"
                hover={orderHover}
            >
                <ListNumbersIcon size={22} />
                {tolgee.t("actions.path.setOrder", "Set order")}
            </OrderButton>
            <OrderButton
                action="reverseMarcherOrder"
                label={tolgee.t("actions.path.reverseOrder", "Reverse order")}
                tip={tolgee.t(
                    "pathways.toolbar.reverseOrderTip",
                    "Reverse order: the tail leads",
                )}
                refusal={refusal}
                testId="toolbar-reverse-order"
                hover={orderHover}
            >
                <ArrowsLeftRightIcon size={22} />
            </OrderButton>
            <OrderButton
                action="clearMarcherOrder"
                label={tolgee.t("actions.path.clearOrder", "Clear order")}
                tip={tolgee.t(
                    "pathways.toolbar.clearOrderTip",
                    "Clear order: forget the order set here, and guess it from where the marchers stand",
                )}
                refusal={refusal}
                testId="toolbar-clear-order"
                hover={orderHover}
            >
                <EraserIcon size={22} />
            </OrderButton>
        </ToolbarSection>
    );
}

function OrderButton({
    action,
    label,
    tip,
    refusal,
    pressed,
    testId,
    hover,
    children,
}: {
    action: ActionId;
    label: string;
    tip: string;
    refusal: string | null;
    pressed?: boolean;
    testId: string;
    /** Shows the selection's order while pointed at */
    hover: ReturnType<typeof useOrderHoverProps>;
    children: ReactNode;
}) {
    return (
        <Tip
            label={refusal ? `${label}: ${refusal}` : tip}
            action={refusal ? undefined : action}
        >
            <span {...hover}>
                <ActionButton
                    action={action}
                    tooltip=""
                    disabled={refusal !== null}
                    aria-pressed={pressed}
                    aria-label={label}
                    data-testid={testId}
                    className={clsx(
                        BUTTON,
                        pressed ? "text-accent" : "text-text",
                    )}
                >
                    {children}
                </ActionButton>
            </span>
        </Tip>
    );
}
