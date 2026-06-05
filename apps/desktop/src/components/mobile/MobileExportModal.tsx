import React, { useMemo, useState, useCallback } from "react";
import { DeviceMobileIcon, XIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import EnsembleList from "./EnsembleList";
import MobileExportView from "./MobileExportView";
import {
    useCurrentProduction,
    useOtmProductionId,
} from "./queries/useProductions";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { useAuth } from "@/auth/useAuth";
import {
    AlertDialog,
    AlertDialogTitle,
    AlertDialogContent,
    Button,
    AlertDialogDescription,
    AlertDialogCancel,
    AlertDialogAction,
} from "@openmarch/ui";
import { AuthButton, SignInButton } from "../../auth/AuthButton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetApiEditorV1EnsemblesAnyQueryOptions } from "@/api/generated/ensembles/ensembles";
import {
    updateWorkspaceSettingsMutationOptions,
    workspaceSettingsQueryOptions,
} from "@/hooks/queries/useWorkspaceSettings";
import { conToastError } from "@/utilities/utils";

const mobileExportScreenshotUrls = [1, 2, 3, 4, 5].map(
    (index) => `https://assets.openmarch.com/desktop/mobile-wipe/${index}.webp`,
);

type AlertState = {
    type: "no-access" | null;
};

/**
 * Hook that validates mobile export prerequisites
 * Returns the validation state (which check failed, or null if all pass)
 */
function useMobileExportValidation(): AlertState {
    const { isAuthenticated } = useAuth();
    const productionId = useOtmProductionId();
    const {
        data: currentProduction,
        error: currentProductionError,
        isFetched: hasFetchedCurrentProduction,
    } = useCurrentProduction();

    return useMemo(() => {
        const hasProductionId = !!productionId;
        const hasError = !!currentProductionError;
        const hasAccess = !!currentProduction && !currentProductionError;

        let output: AlertState = { type: null };

        if (
            isAuthenticated &&
            hasProductionId &&
            (hasError || (hasFetchedCurrentProduction && !hasAccess))
        ) {
            output = { type: "no-access" };
        }

        return output;
    }, [
        isAuthenticated,
        productionId,
        currentProductionError,
        currentProduction,
        hasFetchedCurrentProduction,
    ]);
}

/**
 * Mobile Export Modal Component
 */
export default function MobileExportModal({
    label = <DeviceMobileIcon size={24} />,
    buttonClassName,
}: {
    label?: string | React.ReactNode;
    buttonClassName?: string;
}) {
    const { toggleOpen, setContent, isOpen, contentId } =
        useSidebarModalStore();
    const queryClient = useQueryClient();

    const validationState = useMobileExportValidation();
    const [alertDialogState, setAlertDialogState] =
        useState<AlertState["type"]>(null);

    const prefetchEnsembles = useCallback(() => {
        void queryClient.prefetchQuery(
            getGetApiEditorV1EnsemblesAnyQueryOptions(),
        );
    }, [queryClient]);

    const handleClick = useCallback(() => {
        // If sidebar is already open with this content, close it
        if (isOpen && contentId === "mobile-export") {
            toggleOpen();
            return;
        }

        if (validationState.type !== null) {
            setAlertDialogState(validationState.type);
        } else {
            setContent(<MobileExportModalContents />, "mobile-export");
            if (!isOpen) {
                toggleOpen();
            }
        }
    }, [isOpen, contentId, toggleOpen, setContent, validationState.type]);

    const handleAlertClose = useCallback((open: boolean) => {
        if (!open) {
            setAlertDialogState(null);
        }
    }, []);

    return (
        <>
            <button
                onClick={handleClick}
                onMouseEnter={prefetchEnsembles}
                className={twMerge(
                    clsx(
                        "hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50",
                        {
                            "text-accent":
                                isOpen && contentId === "mobile-export",
                        },
                        buttonClassName,
                    ),
                )}
                id="sidebar-launcher-mobile-export"
            >
                {label}
            </button>

            {/* Render AlertDialogs at root level */}
            {alertDialogState && (
                <OtmAlertDialog
                    alertState={{ type: alertDialogState }}
                    handleAlertClose={handleAlertClose}
                />
            )}
        </>
    );
}

/**
 * Modal contents that conditionally shows EnsembleList or MobileExportView
 */
function MobileExportModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    const { isAuthenticated } = useAuth();
    const { data: currentProduction } = useCurrentProduction();

    const heading = currentProduction ? (
        <div className="">
            <h4
                className="text-h4 mb-8 leading-none"
                aria-label={"current production name"}
            >
                {currentProduction.name}
            </h4>
            <h5
                className="text-body text-text-subtitle"
                aria-label={"current ensemble name"}
            >
                {currentProduction.ensemble.name}
            </h5>
        </div>
    ) : (
        <h4 className="text-h4 leading-none">Export to Mobile</h4>
    );

    return (
        <section className="animate-scale-in text-text flex h-full w-[30rem] flex-col gap-16">
            <header className="flex items-start justify-between gap-24">
                {heading}
                <div className="flex shrink-0 items-center gap-8">
                    {isAuthenticated && <AuthButton />}
                    <button
                        onClick={toggleOpen}
                        className="hover:text-red duration-150 ease-out"
                    >
                        <XIcon size={24} />
                    </button>
                </div>
            </header>

            <div
                className={clsx(
                    "flex grow flex-col gap-16 pr-3",
                    isAuthenticated
                        ? "overflow-y-auto"
                        : "min-h-0 flex-1 overflow-hidden",
                )}
            >
                <div
                    className={clsx(
                        "flex flex-col gap-12",
                        !isAuthenticated && "min-h-0 flex-1",
                    )}
                >
                    {!isAuthenticated ? (
                        <SignedOutMobileExportContent />
                    ) : currentProduction ? (
                        <MobileExportView
                            currentProduction={currentProduction}
                        />
                    ) : (
                        <EnsembleList />
                    )}
                </div>
            </div>
        </section>
    );
}

function SignedOutMobileExportContent() {
    return (
        <div className="text-body text-text-subtitle flex h-full min-h-0 flex-col gap-24 overflow-hidden text-center">
            <div className="flex shrink-0 grow flex-col items-center gap-16 self-center">
                <div className="translate-x-[-32px]">
                    <img
                        src="https://assets.openmarch.com/otm-logo-purple-light.webp"
                        alt="OTM Logo"
                        className="block h-200 w-auto shrink-0 dark:hidden"
                    />
                    <img
                        src="https://assets.openmarch.com/otm-logo-purple-dark.webp"
                        alt=""
                        aria-hidden="true"
                        className="hidden h-200 w-auto shrink-0 dark:block"
                    />
                </div>
                <SignInButton variant="primary" />
                <p className="text-body text-text-subtitle w-[60%]">
                    Sign in or create an account to connect this show to On the
                    Move and export it to mobile devices.
                </p>
            </div>
            <div
                className="relative -mx-3 flex min-h-0 overflow-hidden py-4"
                aria-hidden="true"
            >
                <div className="from-bg-1 pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-linear-to-r to-transparent" />
                <div className="from-bg-1 pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-linear-to-l to-transparent" />
                <div className="mobile-export-screenshot-marquee flex w-max items-start gap-10">
                    {[
                        ...mobileExportScreenshotUrls,
                        ...mobileExportScreenshotUrls,
                    ].map((url, index) => (
                        <img
                            key={`${url}-${index}`}
                            src={url}
                            alt=""
                            className="border-stroke shadow-fg-1 aspect-[9/19.5] h-300 w-auto shrink-0 rounded-[1.25rem] border object-cover"
                            draggable={false}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function OtmAlertDialog({
    alertState,
    handleAlertClose,
}: {
    alertState: AlertState;
    handleAlertClose: (open: boolean) => void;
}): React.ReactNode | null {
    // Render only one Alert Dialog based on validation state
    let output: React.ReactNode | null = null;

    switch (alertState.type) {
        case "no-access":
            output = (
                <ProductionNotFound
                    open={true}
                    onOpenChange={handleAlertClose}
                />
            );
            break;
        default:
            output = null;
    }

    return output;
}

/**
 * AlertDialog that is displayed when the production is not found or the user does not have access
 */
function ProductionNotFound({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const queryClient = useQueryClient();
    const { mutate: updateWorkspaceSettings, isPending } = useMutation(
        updateWorkspaceSettingsMutationOptions(queryClient),
    );
    const { data: workspaceSettings } = useQuery(
        workspaceSettingsQueryOptions(),
    );

    const handleDetach = () => {
        if (!workspaceSettings) {
            conToastError(
                "Failed to detach file from production",
                new Error("Workspace settings not found"),
            );
            return;
        }
        updateWorkspaceSettings(
            { ...workspaceSettings, otmProductionId: undefined },
            { onSuccess: () => onOpenChange(false) },
        );
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogTitle>
                    Could not validate On the Move access
                </AlertDialogTitle>
                <AlertDialogDescription>
                    We could not validate that you have access to the OTM
                    Production this show is attached to. Either the account you
                    are signed in with does not have access, or the production
                    no longer exists.
                    <br />
                    First, verify that you are signed in with the correct
                    account. If you are, try detaching this file from the OTM
                    production and re-attaching it.
                    <br />
                    If you still encounter issues, please reach out to
                    otmhelp@openmarch.com for assistance.
                </AlertDialogDescription>
                <div className="flex items-center justify-end gap-8 align-middle">
                    <AlertDialogCancel asChild>
                        <Button
                            variant="secondary"
                            // disabled={isDeleting}
                            className="w-full"
                        >
                            Dismiss
                        </Button>
                    </AlertDialogCancel>
                    <AlertDialogAction>
                        <Button
                            variant="red"
                            onClick={handleDetach}
                            disabled={isPending}
                        >
                            Detach from production
                        </Button>
                    </AlertDialogAction>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}
