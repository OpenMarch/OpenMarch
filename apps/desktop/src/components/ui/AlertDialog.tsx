import React, { forwardRef } from "react";
import * as RadixAlertDialog from "@radix-ui/react-alert-dialog";
import { AlertDialogProps as RadixAlertDialogProps } from "@radix-ui/react-alert-dialog";
import { AlertDialogContentProps as RadixAlertDialogContentProps } from "@radix-ui/react-alert-dialog";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { X } from "@phosphor-icons/react";

export type AlertDialogProps = {
    children: React.ReactNode;
} & RadixAlertDialogProps;

export const AlertDialog = ({ children, ...props }: AlertDialogProps) => (
    <RadixAlertDialog.Root {...props}>{children}</RadixAlertDialog.Root>
);

export const AlertDialogTrigger = forwardRef<
    HTMLButtonElement,
    React.ComponentPropsWithoutRef<typeof RadixAlertDialog.Trigger>
>(({ children, ...props }, ref) => (
    <RadixAlertDialog.Trigger {...props} ref={ref} asChild>
        {children}
    </RadixAlertDialog.Trigger>
));

export const AlertDialogTitle = ({
    children,
}: {
    children: React.ReactNode;
}) => (
    <div className="flex w-full justify-between">
        <RadixAlertDialog.Title className="text-h4 text-text leading-none">
            {children}
        </RadixAlertDialog.Title>
        <RadixAlertDialog.Cancel asChild>
            <X
                size={24}
                className="text-text hover:text-red cursor-pointer duration-150 ease-out"
            />
        </RadixAlertDialog.Cancel>
    </div>
);

export const AlertDialogDescription = ({
    children,
}: {
    children: React.ReactNode;
}) => (
    <RadixAlertDialog.Description className="text-body text-text">
        {children}
    </RadixAlertDialog.Description>
);

export const AlertDialogCancel = forwardRef<
    HTMLButtonElement,
    React.ComponentPropsWithoutRef<typeof RadixAlertDialog.Cancel>
>(({ children, ...props }, ref) => (
    <RadixAlertDialog.Cancel {...props} ref={ref}>
        {children}
    </RadixAlertDialog.Cancel>
));

export const AlertDialogAction = ({
    children,
}: {
    children: React.ReactNode;
}) => <RadixAlertDialog.Action asChild>{children}</RadixAlertDialog.Action>;

export type AlertDialogContentProps = RadixAlertDialogContentProps & {
    children: React.ReactNode;
    className?: string;
};

export const AlertDialogContent = ({
    children,
    className,
    ...props
}: AlertDialogContentProps) => (
    <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay className="data-[state=open]:animate-fade-in fixed inset-0 z-998 bg-[rgb(var(--modal-overlay))]" />
        <RadixAlertDialog.Content
            {...props}
            className={twMerge(
                clsx(
                    className,
                    "rounded-6 border-stroke bg-modal text-text shadow-modal data-[state=open]:animate-fade-in fixed top-1/2 left-1/2 z-999 flex max-w-[27.5rem] min-w-[18.75rem] -translate-x-1/2 -translate-y-1/2 flex-col gap-16 border p-20 font-sans backdrop-blur-xs",
                ),
            )}
        >
            {children}
        </RadixAlertDialog.Content>
    </RadixAlertDialog.Portal>
);
