import * as RadixCollapsible from "@radix-ui/react-collapsible";
import { CollapsibleProps } from "@radix-ui/react-collapsible";
import { useState } from "react";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";

interface InspectorCollapsibleProps extends CollapsibleProps {
    title?: string;
    translatableTitle?: {
        keyName: string;
        parameters?: Record<string, string | number>;
    };
}

export const InspectorCollapsible = ({
    children,
    className,
    title,
    translatableTitle,
    defaultOpen,
    ...props
}: InspectorCollapsibleProps) => {
    const { t } = useTranslate();
    const [open, setOpen] = useState<boolean>(defaultOpen || false);

    const getTitleText = () => {
        if (translatableTitle) {
            return t(
                translatableTitle.keyName,
                translatableTitle.parameters || {},
            );
        }
        if (title) {
            return t(title);
        }
        return t("inspector.title");
    };

    return (
        <RadixCollapsible.Root
            {...props}
            open={open}
            onOpenChange={setOpen}
            defaultOpen={defaultOpen}
        >
            <RadixCollapsible.Trigger className="focus-visible:text-accent flex h-fit w-full justify-between outline-hidden duration-150 ease-out">
                <h4 className="text-h4">{getTitleText()}</h4>
                {open ? <CaretUpIcon size={24} /> : <CaretDownIcon size={24} />}
            </RadixCollapsible.Trigger>
            <RadixCollapsible.Content className={className}>
                {children}
            </RadixCollapsible.Content>
        </RadixCollapsible.Root>
    );
};
