import type { ReactNode } from "react";
import { clsx } from "clsx";

/**
 * A setting: label (and optional help) left, control right. Stacks when the window is narrow,
 * or always with `stacked`, for a control too wide to sit beside its label.
 */
export default function SettingRow({
    label,
    htmlFor,
    description,
    stacked = false,
    children,
}: {
    label: ReactNode;
    htmlFor?: string;
    description?: ReactNode;
    stacked?: boolean;
    children: ReactNode;
}) {
    return (
        <div
            className={clsx(
                "flex flex-col gap-8 py-12",
                !stacked &&
                    "@[480px]:flex-row @[480px]:items-center @[480px]:justify-between @[480px]:gap-16",
            )}
        >
            <div className="flex min-w-0 flex-col gap-2">
                <label htmlFor={htmlFor} className="text-body text-text">
                    {label}
                </label>
                {description && (
                    <p className="text-sub text-text-subtitle">{description}</p>
                )}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}
