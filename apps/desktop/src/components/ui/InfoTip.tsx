import * as Tooltip from "@radix-ui/react-tooltip";
import * as Popover from "@radix-ui/react-popover";
import { TooltipClassName } from "@openmarch/ui";
import { InfoIcon } from "@phosphor-icons/react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { forwardRef, useState, type ReactElement, type ReactNode } from "react";
import { useTolgee } from "@tolgee/react";
import { useIsTouchMode } from "@/stores/InputModeStore";

export interface InfoTipProps {
    /** What the tip says. */
    content: ReactNode;
    side?: "top" | "right" | "bottom" | "left";
    /** Accessible name of the default info button. Defaults to "More info". */
    label?: string;
    /**
     * A custom trigger, e.g. a warning icon. Rendered with `asChild`, so it must
     * forward its ref and props. Use only for triggers that do nothing else: in
     * touch mode a tap opens the tip.
     */
    children?: ReactElement;
    /** Extra classes for the tip's box. */
    contentClassName?: string;
    delayDuration?: number;
}

/**
 * A short explanation behind an icon. With a mouse it's a hover tooltip; in
 * touch mode, where hover doesn't exist, a tap opens it as a popover and a tap
 * anywhere else closes it.
 */
export default function InfoTip({
    content,
    side = "right",
    label,
    children,
    contentClassName,
    delayDuration,
}: InfoTipProps) {
    const isTouch = useIsTouchMode();
    const { t } = useTolgee();
    const [open, setOpen] = useState(false);
    const trigger = children ?? (
        <InfoTipButton aria-label={label ?? t("infoTip.moreInfo")} />
    );
    const className = clsx(TooltipClassName, contentClassName);

    if (isTouch) {
        return (
            <Popover.Root open={open} onOpenChange={setOpen}>
                <Popover.Trigger
                    asChild
                    // A trackpad on a tablet (touch layout, mouse pointer) can hover: show it as a tooltip would
                    onPointerEnter={(e) => {
                        if (e.pointerType === "mouse") setOpen(true);
                    }}
                    onPointerLeave={(e) => {
                        if (e.pointerType === "mouse") setOpen(false);
                    }}
                >
                    {trigger}
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content
                        className={className}
                        side={side}
                        collisionPadding={8}
                        // A tip is read, not typed into: keep focus (and the keyboard) where it was
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        data-testid="info-tip-content"
                    >
                        {content}
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>
        );
    }

    return (
        <Tooltip.Provider>
            <Tooltip.Root delayDuration={delayDuration}>
                <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
                <Tooltip.Portal>
                    <Tooltip.Content
                        className={className}
                        side={side}
                        data-testid="info-tip-content"
                    >
                        {content}
                    </Tooltip.Content>
                </Tooltip.Portal>
            </Tooltip.Root>
        </Tooltip.Provider>
    );
}

/**
 * The default trigger: a small info icon whose hit area grows to finger size in
 * touch mode without changing how it looks.
 */
export const InfoTipButton = forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode }
>(({ className, icon, ...props }, ref) => (
    <button
        ref={ref}
        type="button"
        className={clsx(
            "relative inline-flex shrink-0 items-center justify-center",
            "touch:before:absolute touch:before:-inset-14 touch:before:content-['']",
            className,
        )}
        {...props}
    >
        {/* Not aria-hidden: the accessible tree keeps the icon, as before InfoTip */}
        {icon ?? <InfoIcon size={18} className="text-text/60" />}
    </button>
));
InfoTipButton.displayName = "InfoTipButton";

/**
 * Text that appears only in touch mode, e.g. a caption under an icon button that
 * a mouse user would learn from its tooltip. Not rendered at all with a mouse.
 * Hidden from assistive tech, so give the button its own aria-label.
 */
export function TouchCaption({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    const isTouch = useIsTouchMode();
    if (!isTouch) return null;
    return (
        <span
            aria-hidden
            data-touch-caption
            className={twMerge(
                clsx("text-sub leading-none whitespace-nowrap", className),
            )}
        >
            {children}
        </span>
    );
}
