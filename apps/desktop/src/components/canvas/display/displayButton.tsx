import { TouchCaption } from "@/components/ui/InfoTip";

/** The bar's square icon button, the same look as the transport's */
export const DISPLAY_BUTTON_CLASS =
    "focus-visible:ring-accent rounded-4 enabled:hover:text-accent enabled:hover:bg-fg-2 flex size-24 items-center justify-center outline-hidden transition-[color,background-color] duration-150 focus-visible:ring-2 touch:size-auto touch:min-w-48 touch:flex-col touch:gap-2 touch:p-4";

/** In touch mode, where tooltips can't show, each button says what it is under its icon */
export function DisplayCaption({ children }: { children: string }) {
    return <TouchCaption className="text-[10px]">{children}</TouchCaption>;
}
