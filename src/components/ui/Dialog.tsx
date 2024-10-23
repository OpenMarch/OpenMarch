import React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { DialogProps as RadixDialogProps } from "@radix-ui/react-dialog";
import { DialogContentProps as RadixDialogContentProps } from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { X } from "@phosphor-icons/react";

export type DialogProps = {
    children: React.ReactNode;
} & RadixDialogProps;

export const Dialog = ({ children, ...props }: DialogProps) => (
    <RadixDialog.Root {...props}>{children}</RadixDialog.Root>
);

export const DialogTrigger = ({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) => (
    <RadixDialog.Trigger asChild className={className}>
        {children}
    </RadixDialog.Trigger>
);

export const DialogTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="flex w-full justify-between">
        <RadixDialog.Title className="text-h4 leading-none text-text">
            {children}
        </RadixDialog.Title>
        <RadixDialog.Close asChild>
            <X
                size={24}
                className="cursor-pointer text-text duration-150 ease-out hover:text-red"
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
            <RadixDialog.Overlay className="fixed inset-0 z-[48] bg-[rgb(var(--modal-overlay))] data-[state=open]:animate-fade-in" />
            <RadixDialog.Content
                {...props}
                className={twMerge(
                    clsx(
                        className,
                        "fixed left-1/2 top-1/2 z-[49] flex min-w-[18.75rem] -translate-x-1/2 -translate-y-1/2 flex-col gap-16 rounded-6 border border-stroke bg-modal p-20 font-sans text-text shadow-modal backdrop-blur-sm data-[state=open]:animate-fade-in",
                    ),
                )}
            >
                {children}
            </RadixDialog.Content>
        </RadixDialog.Portal>
    );
};
