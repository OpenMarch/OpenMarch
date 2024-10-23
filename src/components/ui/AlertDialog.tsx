import React from "react";
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

export const AlertDialogTrigger = ({
    children,
}: {
    children: React.ReactNode;
}) => <RadixAlertDialog.Trigger asChild>{children}</RadixAlertDialog.Trigger>;

export const AlertDialogTitle = ({
    children,
}: {
    children: React.ReactNode;
}) => (
    <div className="flex w-full justify-between">
        <RadixAlertDialog.Title className="text-h4 leading-none text-text">
            {children}
        </RadixAlertDialog.Title>
        <RadixAlertDialog.Cancel asChild>
            <X
                size={24}
                className="cursor-pointer text-text duration-150 ease-out hover:text-red"
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

export const AlertDialogCancel = ({
    children,
}: {
    children: React.ReactNode;
}) => <RadixAlertDialog.Cancel asChild>{children}</RadixAlertDialog.Cancel>;

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
        <RadixAlertDialog.Overlay className="fixed inset-0 z-[998] bg-[rgb(var(--modal-overlay))] data-[state=open]:animate-fade-in" />
        <RadixAlertDialog.Content
            {...props}
            className={twMerge(
                clsx(
                    className,
                    "fixed left-1/2 top-1/2 z-[999] flex min-w-[18.75rem] max-w-[27.5rem] -translate-x-1/2 -translate-y-1/2 flex-col gap-16 rounded-6 border border-stroke bg-modal p-20 font-sans text-text shadow-modal backdrop-blur-sm data-[state=open]:animate-fade-in",
                ),
            )}
        >
            {children}
        </RadixAlertDialog.Content>
    </RadixAlertDialog.Portal>
);
