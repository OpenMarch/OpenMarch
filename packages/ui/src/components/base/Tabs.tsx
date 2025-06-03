import * as RadixTabs from "@radix-ui/react-tabs";
import type {
    TabsContentProps as RadixTabContentProps,
    TabsTriggerProps as RadixTabTriggerProps,
    TabsProps as RadixTabsProps,
} from "@radix-ui/react-tabs";
import { clsx } from "clsx";
import type React from "react";
import { twMerge } from "tailwind-merge";

export type TabsProps = RadixTabsProps & { children: React.ReactNode };
export const Tabs = ({ children, className, ...props }: TabsProps) => {
    return (
        <RadixTabs.Root
            {...props}
            className={twMerge(clsx("flex flex-col gap-20", className))}
        >
            {children}
        </RadixTabs.Root>
    );
};

export const TabsList = ({
    children,
    className,
    ...props
}: {
    children: React.ReactNode;
    className?: string;
}) => {
    return (
        <RadixTabs.List
            className={twMerge(
                clsx("border-stroke flex gap-8 border-b", className),
            )}
            {...props}
        >
            {children}
        </RadixTabs.List>
    );
};

export type TabItemProps = RadixTabTriggerProps & {
    children: React.ReactNode;
};
export const TabItem = ({ children, ...props }: TabItemProps) => {
    return (
        <RadixTabs.Trigger
<<<<<<< HEAD
            className="text-body text-text group focus-visible:text-accent hover:text-accent flex flex-col gap-2 px-10 pt-6 pb-4 duration-150 ease-out"
            {...props}
        >
            {children}
            <div className="bg-accent group-data-[state=active]:animate-fade-in h-[0.125rem] w-full rounded-full opacity-0 group-data-[state=active]:opacity-100" />
=======
            className="text-body text-text group flex flex-col gap-2 px-10 pt-6 pb-4"
            {...props}
        >
            {children}
            <div className="bg-accent h-[0.125rem] w-full rounded-full opacity-0 group-data-[state=active]:opacity-100" />
>>>>>>> 7d8b28a (rearrange, add tabs ui component)
        </RadixTabs.Trigger>
    );
};

export type TabContentProps = RadixTabContentProps & { className?: string };
export const TabContent = ({ className, ...props }: TabContentProps) => {
    return (
        <RadixTabs.Content
<<<<<<< HEAD
            className={twMerge(clsx("text-text", className))}
=======
            className={clsx(className, "text-text")}
>>>>>>> 7d8b28a (rearrange, add tabs ui component)
            {...props}
        />
    );
};
