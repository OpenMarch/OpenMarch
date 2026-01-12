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
import { useAccessToken, useAuth } from "@/hooks/queries/useAuth";
import {
    AlertDialog,
    AlertDialogTitle,
    AlertDialogContent,
    Button,
    AlertDialogDescription,
    AlertDialogCancel,
    AlertDialogAction,
} from "@openmarch/ui";
import { SignInButton } from "../auth/AuthButton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hasAnyEnsemblesQueryOptions } from "./queries/useEnsembles";

type AlertState = {
    type:
        | "no-access"
        | "not-signed-in"
        | "signed-in-no-ensembles"
        | "error"
        | null;
};

/**
 * Hook that validates mobile export prerequisites
 * Returns the validation state (which check failed, or null if all pass)
 */
function useMobileExportValidation(): AlertState {
    const { isAuthenticated } = useAuth();
    const { getAccessToken } = useAccessToken();
    const productionId = useOtmProductionId();
    const { data: hasAnyEnsembles } = useQuery(
        hasAnyEnsemblesQueryOptions(getAccessToken),
    );
    const { data: currentProduction, error: currentProductionError } =
        useCurrentProduction();

    return useMemo(() => {
        const isSignedIn = isAuthenticated;
        const hasProductionId = !!productionId;
        const hasEnsembles = hasAnyEnsembles;
        const hasError = !!currentProductionError;
        const hasAccess = !!currentProduction && !currentProductionError;

        let output: AlertState = { type: null };

        // Validation order matters - check in priority order
        switch (true) {
            case !isSignedIn:
                output = { type: "not-signed-in" };
                break;
            case !hasProductionId && !hasEnsembles:
                output = { type: "signed-in-no-ensembles" };
                break;
            case hasError:
                output = { type: "error" };
                break;
            case !hasAccess && hasProductionId:
                output = { type: "no-access" };
                break;
            default:
                // All validations passed
                output = { type: null };
                break;
        }

        return output;
    }, [
        isAuthenticated,
        productionId,
        currentProductionError,
        currentProduction,
        hasAnyEnsembles,
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

    const { isAuthenticated } = useAuth();
    const { getAccessToken } = useAccessToken();
    const validationState = useMobileExportValidation();
    const [alertDialogState, setAlertDialogState] =
        useState<AlertState["type"]>(null);

    const prefetchEnsembles = useCallback(() => {
        void queryClient.prefetchQuery(
            hasAnyEnsemblesQueryOptions(getAccessToken),
        );
    }, [getAccessToken, queryClient]);

    const handleClick = useCallback(() => {
        // If sidebar is already open with this content, close it
        if (isOpen && contentId === "mobile-export") {
            toggleOpen();
            return;
        }

        // Run validation checks
        if (validationState.type !== null) {
            // Validation failed - show AlertDialog
            setAlertDialogState(validationState.type);
        } else {
            // Validation passed - open sidebar
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
                    isSignedIn={isAuthenticated}
                    hasInternetConnection={navigator.onLine}
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
    const { data: currentProduction } = useCurrentProduction();

    const heading = "Export to Mobile";

    return (
        <section className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">{heading}</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex w-[30rem] grow flex-col gap-16 overflow-y-auto">
                <div className="flex flex-col gap-12">
                    {currentProduction ? (
                        <MobileExportView />
                    ) : (
                        <EnsembleList />
                    )}
                </div>
            </div>
        </section>
    );
}

function OtmAlertDialog({
    alertState,
    handleAlertClose,
    isSignedIn,
    hasInternetConnection,
}: {
    alertState: AlertState;
    handleAlertClose: (open: boolean) => void;
    isSignedIn: boolean;
    hasInternetConnection: boolean;
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
        case "not-signed-in":
            output = (
                <ProductionDefinedButNotSignedIn
                    open={true}
                    onOpenChange={handleAlertClose}
                />
            );
            break;
        case "signed-in-no-ensembles":
            output = (
                <OtmPromotionalAlert
                    isSignedIn={isSignedIn}
                    hasInternetConnection={hasInternetConnection}
                    open={true}
                    onOpenChange={handleAlertClose}
                />
            );
            break;
        case "error":
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
                        <Button variant="red">Detach from production</Button>
                    </AlertDialogAction>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function ProductionDefinedButNotSignedIn({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogTitle>Not signed in</AlertDialogTitle>
                <AlertDialogDescription>
                    To connect to On the Move, you must be signed in.
                </AlertDialogDescription>
                <div className="flex items-center justify-end gap-8 align-middle">
                    <AlertDialogCancel asChild>
                        <Button variant="secondary">Dismiss</Button>
                    </AlertDialogCancel>
                    <AlertDialogAction>
                        <SignInButton />
                    </AlertDialogAction>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}

/**
 * Promotional alert for On the Move
 *
 * This should show only if the user is not signed in, or they are signed in and have no ensembles
 */
function OtmPromotionalAlert({
    isSignedIn,
    hasInternetConnection,
    open,
    onOpenChange,
}: {
    isSignedIn: boolean;
    hasInternetConnection: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogTitle>Take your show On the Move!</AlertDialogTitle>
                <AlertDialogDescription>
                    OpenMarch On the Move lets you instantly share your shows to
                    performer&apos;s mobile devices.
                </AlertDialogDescription>
                <div className="flex items-center justify-end gap-8 align-middle">
                    <AlertDialogCancel asChild>
                        <Button variant="secondary">Dismiss</Button>
                    </AlertDialogCancel>
                    <AlertDialogAction>
                        {isSignedIn ? (
                            <Button>Unlock Instant Sync</Button>
                        ) : (
                            <div
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                            >
                                <SignInButton />
                            </div>
                        )}
                    </AlertDialogAction>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}
