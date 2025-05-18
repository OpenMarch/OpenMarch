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
                `flex w-full items-center justify-between gap-x-10 ${selected && "rounded-6 border-stroke bg-fg-2 border"} text-text h-[2.5rem] px-22`,
                className,
            )}
        >
            {children}
        </div>
    );
};
