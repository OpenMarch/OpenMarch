import clsx from "clsx";
import React from "react";

import * as RadixCollapsible from "@radix-ui/react-collapsible";
import type { CollapsibleProps as RadixCollapsibleProps } from "@radix-ui/react-collapsible";

export type ListItemProps = {
    text: string;
    selected?: boolean;
    className?: string;
};

export const ListItem = ({
    text = "List Item",
    selected = false,
    className,
}: ListItemProps) => {
    return (
        <div
            className={clsx(
                `flex w-full items-center justify-between gap-x-10 ${selected && "rounded-6 border-stroke bg-fg-2 border"} px-22 text-text h-[2.5rem]`,
                className,
            )}
        >
            {text}
        </div>
    );
};

export type ListItemCollapsibleProps = RadixCollapsibleProps & {
    text: string;
    selected?: boolean;
    className?: string;
    children: React.ReactNode;
};

export const ListItemCollapsible = ({
    text = "List Item",
    selected = false,
    className,
    children,
    ...props
}: ListItemCollapsibleProps) => {
    const [open, setOpen] = React.useState<boolean>();
    return (
        <RadixCollapsible.Root open={open} onOpenChange={setOpen} {...props}>
            <RadixCollapsible.Trigger
                className={clsx(
                    `flex w-full items-center justify-between gap-x-10 ${selected && "rounded-6 border-stroke bg-fg-2 border"} px-22 text-text h-[2.5rem]`,
                    className,
                )}
            >
                {text}
                <IconChevronDown />
            </RadixCollapsible.Trigger>
            <RadixCollapsible.Content className="flex flex-col gap-0 pl-24">
                {children}
            </RadixCollapsible.Content>
        </RadixCollapsible.Root>
    );
};

const IconChevronDown = () => {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1.5rem"
            height="1.5rem"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text duration-100 ease-out group-data-[state=open]:-rotate-180"
        >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M6 9l6 6l6 -6" />
        </svg>
    );
};
