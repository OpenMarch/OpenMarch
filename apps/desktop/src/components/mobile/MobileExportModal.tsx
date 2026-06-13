import React, { useMemo, useCallback, useEffect } from "react";
import {
    ArrowSquareOutIcon,
    DeviceMobileIcon,
    WarningCircleIcon,
    XIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import EnsembleList from "./EnsembleList";
import MobileExportView from "./MobileExportView";
import DetachButton from "./DetachButton";
import ViewEnsembleDetailsLink from "./ViewEnsembleDetailsLink";
import {
    currentProductionQueryOptions,
    useCurrentProduction,
    useOtmProductionId,
} from "./queries/useProductions";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@openmarch/ui";
import { AuthButton, SignInButton } from "../../auth/AuthButton";
import { useQueryClient } from "@tanstack/react-query";
import { getGetApiEditorV1EnsemblesAnyQueryOptions } from "@/api/generated/ensembles/ensembles";
import { getGetApiEditorV1ProductionsProductionIdAudioFilesQueryOptions } from "@/api/generated/audio-files/audio-files";
import { getClerkSignUpUrl } from "@/global/auth/constants";

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
        const hasProductionId = productionId != null;
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
    const productionId = useOtmProductionId();

    useEffect(() => {
        if (productionId == null) return;

        void queryClient.prefetchQuery(
            currentProductionQueryOptions(productionId),
        );
    }, [productionId, queryClient]);

    const prefetchMobileExportData = useCallback(() => {
        void queryClient.prefetchQuery(
            getGetApiEditorV1EnsemblesAnyQueryOptions(),
        );

        if (productionId == null) return;

        void queryClient.prefetchQuery(
            currentProductionQueryOptions(productionId),
        );
        void queryClient.prefetchQuery(
            getGetApiEditorV1ProductionsProductionIdAudioFilesQueryOptions(
                productionId,
            ),
        );
    }, [productionId, queryClient]);

    const handleClick = useCallback(() => {
        // If sidebar is already open with this content, close it
        if (isOpen && contentId === "mobile-export") {
            toggleOpen();
            return;
        }

        setContent(<MobileExportModalContents />, "mobile-export");
        if (!isOpen) {
            toggleOpen();
        }
    }, [isOpen, contentId, toggleOpen, setContent]);

    return (
        <>
            <button
                onClick={handleClick}
                onMouseEnter={prefetchMobileExportData}
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
        </>
    );
}

/**
 * Modal contents that conditionally shows EnsembleList or MobileExportView
 */
export function MobileExportModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
    const { data: currentProduction } = useCurrentProduction();
    const validationState = useMobileExportValidation();
    const productionId = useOtmProductionId();
    const isSignedInView = isAuthenticated || isAuthLoading;

    const heading = currentProduction ? (
        <div className="">
            <h4
                className="text-h4 mb-8 leading-none"
                aria-label={"current production name"}
            >
                {currentProduction.name}
            </h4>
            <div className="text-body text-text-subtitle flex flex-wrap items-center gap-8">
                <h5
                    className="leading-none"
                    aria-label={"current ensemble name"}
                >
                    {currentProduction.ensemble.name}
                </h5>
                <span aria-hidden="true">|</span>
                <ViewEnsembleDetailsLink
                    ensembleId={currentProduction.ensemble.id}
                />
            </div>
        </div>
    ) : (
        <h4 className="text-h4 leading-none">Export to Mobile</h4>
    );

    return (
        <section className="animate-scale-in text-text flex h-full w-[30rem] flex-col gap-16">
            <header className="flex items-start justify-between gap-24">
                {heading}
                <div className="flex shrink-0 items-center gap-8">
                    {isSignedInView && <AuthButton />}
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
                    isSignedInView
                        ? "overflow-y-auto"
                        : "min-h-0 flex-1 overflow-hidden",
                )}
            >
                <div
                    className={clsx(
                        "flex flex-col gap-12",
                        !isSignedInView && "min-h-0 flex-1",
                    )}
                >
                    {validationState.type === "no-access" ? (
                        <MobileExportAccessError />
                    ) : isAuthLoading ? (
                        <MobileExportLoading message="Checking sign-in..." />
                    ) : !isAuthenticated ? (
                        <SignedOutMobileExportContent />
                    ) : currentProduction ? (
                        <MobileExportView
                            currentProduction={currentProduction}
                        />
                    ) : productionId ? (
                        <MobileExportLoading message="Validating On the Move access..." />
                    ) : (
                        <EnsembleList />
                    )}
                </div>
            </div>
        </section>
    );
}

function MobileExportLoading({ message }: { message: string }) {
    return (
        <div className="text-text-subtitle flex h-full flex-col items-center justify-center gap-12 text-center">
            <DeviceMobileIcon size={32} />
            <p className="text-body">{message}</p>
        </div>
    );
}

function MobileExportAccessError() {
    const { toggleOpen } = useSidebarModalStore();

    return (
        <div className="flex h-full flex-col justify-center gap-16 text-center">
            <div className="text-red flex flex-col items-center gap-8">
                <WarningCircleIcon size={40} />
                <h4 className="text-h4 leading-none">
                    Could not validate On the Move access
                </h4>
            </div>
            <p className="text-body text-text-subtitle">
                We could not validate that you have access to the OTM Production
                this show is attached to. The signed-in account may not have
                access, or the production may no longer exist.
            </p>
            <p className="text-sub text-text-subtitle">
                Detach this file from the production to choose a different one,
                or close the sidebar and sign in with an account that has
                access.
            </p>
            <div className="flex gap-8 align-middle">
                <DetachButton variant="red" />
                <Button variant="secondary" onClick={toggleOpen}>
                    Close
                </Button>
            </div>
        </div>
    );
}

function SignedOutMobileExportContent() {
    const handleSetupAccount = useCallback(() => {
        const signupUrl = getClerkSignUpUrl();
        if (window.electron?.openExternal) {
            void window.electron.openExternal(signupUrl);
        } else {
            window.open(signupUrl, "_blank");
        }
    }, []);

    const imageClassname = clsx(
        " block h-200 w-auto shrink-0  drop-shadow-text-subtitle",
    );
    return (
        <div className="text-body text-text-subtitle flex h-full min-h-0 flex-col gap-24 overflow-hidden text-center">
            <div className="flex shrink-0 grow flex-col items-center gap-16">
                <div className="translate-x-[-32px]">
                    <img
                        src="https://assets.openmarch.com/otm-logo-purple-light.webp"
                        alt="OTM Logo"
                        className={clsx(
                            imageClassname,
                            "drop-shadow-sm dark:hidden",
                        )}
                    />
                    <img
                        src="https://assets.openmarch.com/otm-logo-purple-dark.webp"
                        alt=""
                        aria-hidden="true"
                        className={clsx(
                            imageClassname,
                            "hidden drop-shadow-xs dark:block",
                        )}
                    />
                </div>
                <div className="flex w-[85%] flex-col items-center gap-12">
                    <p className="text-body text-text-subtitle">
                        Don&apos;t have an account yet? Create one now!
                    </p>
                    <Button variant="primary" onClick={handleSetupAccount}>
                        <ArrowSquareOutIcon size={16} /> Set up your account
                    </Button>
                </div>
                <div className="flex w-[85%] flex-col items-center gap-12">
                    <p className="text-body text-text-subtitle">
                        Already have an account? Connect it to the desktop app
                        to start taking it On The Move!
                    </p>
                    <SignInButton variant="secondary" />
                </div>
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
