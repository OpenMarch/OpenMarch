import type { ReactNode } from "react";

/** A setting: label (and optional help) left, control right. Stacks when the window is narrow. */
export default function SettingRow({
    label,
    htmlFor,
    description,
    children,
}: {
    label: ReactNode;
    htmlFor?: string;
    description?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-8 py-12 @[480px]:flex-row @[480px]:items-center @[480px]:justify-between @[480px]:gap-16">
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
