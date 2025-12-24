import React from "react";
import clsx from "clsx";

export type ListItemProps = {
    children: React.ReactNode;
    selected?: boolean;
    className?: string;
};

export const ListItem = ({
    children,
    selected = false,
    className,
}: ListItemProps) => {
    return (
        <div
            className={clsx(
                `rounded-6 flex w-full items-center justify-start gap-8 ${selected && "border-stroke bg-fg-2 border"} text-text min-h-[2.5rem] min-w-0 px-12`,
                className,
            )}
        >
            {children}
        </div>
    );
};
