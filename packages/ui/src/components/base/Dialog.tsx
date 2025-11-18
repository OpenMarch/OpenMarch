import React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import type {
    DialogProps as RadixDialogProps,
    DialogContentProps as RadixDialogContentProps,
    DialogTriggerProps,
} from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { XIcon } from "@phosphor-icons/react";

export type DialogProps = {
    children: React.ReactNode;
} & RadixDialogProps;

export const Dialog = ({ children, ...props }: DialogProps) => (
    <RadixDialog.Root {...props}>{children}</RadixDialog.Root>
);

export const DialogTrigger = ({
    children,
    className,
    ...rest
}: DialogTriggerProps & {
    children: React.ReactNode;
    className?: string;
}) => (
    <RadixDialog.Trigger className={className} {...rest}>
        {children}
    </RadixDialog.Trigger>
);

export const DialogTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="flex w-full justify-between">
        <RadixDialog.Title className="text-h4 text-text leading-none">
            {children}
        </RadixDialog.Title>
        <RadixDialog.Close asChild>
            <XIcon
                size={24}
                className="text-text hover:text-red cursor-pointer duration-150 ease-out"
            />
        </RadixDialog.Close>
    </div>
);

export const DialogDescription = ({
    children,
}: {
    children: React.ReactNode;
}) => (
    <RadixDialog.Description className="text-body text-text">
        {children}
    </RadixDialog.Description>
);

export const DialogClose = ({ children }: { children: React.ReactNode }) => (
    <RadixDialog.Close asChild>{children}</RadixDialog.Close>
);

export const DialogContent = ({
    children,
    className,
    ...props
}: RadixDialogContentProps) => {
    return (
        <RadixDialog.Portal>
            <RadixDialog.Overlay className="bg-modal-overlay data-[state=open]:animate-fade-in fixed inset-0 z-[998]" />
            <div className="data-[state=open]:animate-fade-in fixed inset-0 z-[999] flex items-center justify-center">
                <RadixDialog.Content
                    {...props}
                    className={clsx(
                        "rounded-6 border-stroke bg-modal text-text shadow-modal backdrop-blur-32 flex h-fit max-h-[36rem] min-w-[18.75rem] flex-col gap-16 border p-20 font-sans",
                        className,
                    )}
                >
                    {children}
                </RadixDialog.Content>
            </div>
        </RadixDialog.Portal>
    );
};
