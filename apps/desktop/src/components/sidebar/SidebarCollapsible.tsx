import * as RadixCollapsible from "@radix-ui/react-collapsible";
import { CollapsibleProps } from "@radix-ui/react-collapsible";
import { useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";

export const SidebarCollapsible = ({
    children,
    className,
    title,
    defaultOpen,
    ...props
}: CollapsibleProps) => {
    const [open, setOpen] = useState<boolean>(defaultOpen || false);

    return (
        <RadixCollapsible.Root
            {...props}
            open={open}
            onOpenChange={setOpen}
            defaultOpen={defaultOpen}
        >
            <RadixCollapsible.Trigger className="focus-visible:text-accent flex h-fit w-full justify-between outline-none duration-150 ease-out">
                <h4 className="text-h4">{title}</h4>
                {open ? <CaretUp size={24} /> : <CaretDown size={24} />}
            </RadixCollapsible.Trigger>
            <RadixCollapsible.Content className={className}>
                {children}
            </RadixCollapsible.Content>
        </RadixCollapsible.Root>
    );
};
