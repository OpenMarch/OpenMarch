import { CubeIcon } from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import clsx from "clsx";
import ActionButton from "@/shortcuts/ActionButton";

/**
 * Opens the 3D View window, or focuses it (3D View UI-1). Beside the workspace switch, since the
 * 3D View is another way to look at the show; it was in the toolbar's View tab.
 */
export default function View3dButton({
    className,
    labelClassName,
}: {
    className?: string;
    /** For the words alone, e.g. to keep only the icon where space is short */
    labelClassName?: string;
}) {
    return (
        <ActionButton
            action="openView3d"
            data-testid="open-view3d"
            className={clsx(
                "bg-fg-1 border-stroke text-text-subtitle hover:text-accent focus-visible:ring-accent flex items-center gap-4 rounded-[24px] border px-10 py-4 text-xs outline-hidden duration-150 ease-out focus-visible:ring-2 disabled:opacity-50",
                className,
            )}
        >
            <CubeIcon size={14} />
            <span className={labelClassName}>
                <T keyName="view3d.open" />
            </span>
        </ActionButton>
    );
}
