import type { ReactNode } from "react";

/** A soft filled group of setting rows, with an optional heading above it. */
export default function SettingsPanel({
    heading,
    children,
}: {
    heading?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-8">
            {heading && (
                <h2 className="text-sub text-text-subtitle font-medium">
                    {heading}
                </h2>
            )}
            <div className="bg-fg-1 rounded-6 divide-stroke flex flex-col divide-y px-16">
                {children}
            </div>
        </div>
    );
}
