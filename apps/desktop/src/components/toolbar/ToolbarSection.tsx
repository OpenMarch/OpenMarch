import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** A rounded group of toolbar controls. In touch mode it grows so each control can be finger-sized. */
export default function ToolbarSection({
    children,
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            role="group"
            {...props}
            className={twMerge(
                clsx(
                    "rounded-6 border-stroke bg-fg-1 touch:h-auto touch:min-h-48 touch:gap-12 touch:*:min-h-44 flex h-[2.55rem] w-fit items-center gap-20 border px-16",
                    className,
                ),
            )}
        >
            {children}
        </div>
    );
}
