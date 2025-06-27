import * as RadixCollapsible from "@radix-ui/react-collapsible";
import { CollapsibleProps } from "@radix-ui/react-collapsible";
import { useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";

export const Collapsible = ({
    children,
    className,
    trigger,
    defaultOpen,
    ...props
}: CollapsibleProps & { trigger: React.ReactNode }) => {
    const [open, setOpen] = useState<boolean>(defaultOpen || false);

    return (
        <RadixCollapsible.Root
            {...props}
            open={open}
            onOpenChange={setOpen}
            defaultOpen={defaultOpen}
        >
            <RadixCollapsible.Trigger className="focus-visible:text-accent flex h-fit w-full items-center justify-between outline-hidden duration-150 ease-out">
                {trigger}
                {open ? <CaretUp size={18} /> : <CaretDown size={18} />}
            </RadixCollapsible.Trigger>
            <RadixCollapsible.Content className={className}>
                {children}
            </RadixCollapsible.Content>
        </RadixCollapsible.Root>
    );
};
