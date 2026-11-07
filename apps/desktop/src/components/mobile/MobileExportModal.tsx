import React, { useMemo, useCallback, useEffect } from "react";
import {
    ArrowSquareOutIcon,
    DeviceMobileIcon,
    WarningCircleIcon,
    XIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { TouchCaption } from "@/components/ui/InfoTip";
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
import { getClerkSignUpUrl, isSignInEnabled } from "@/global/auth/constants";
import { T, useTranslate } from "@tolgee/react";
import { isWebBuild } from "@/utilities/webBuild";
import WebMobileUnavailable from "./WebMobileUnavailable";
import { editorApiStatus } from "@/api/editor-client";

const mobileExportScreenshotUrls = [1, 2, 3, 4, 5].map(
    (index) => `https://assets.openmarch.com/desktop/mobile-wipe/${index}.webp`,
);

type AlertState = {
    /**
     * "no-access": the server said this account can't see the production.
     * "unreachable": no answer, or no sign-in token right now (offline).
     * "sign-in-rejected": the server turned down the sign-in token it got.
     */
    type: "no-access" | "unreachable" | "sign-in-rejected" | null;
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
            // Only the server turning the account down is "no access";
            // anything else (offline, sign-in not refreshed) is worth a retry
            // rather than detaching the show.
            // A 401 came back for a token that was sent (no token, no
            // request): signing in again is the way out, not a retry.
            const status = editorApiStatus(currentProductionError);
            output = {
                type:
                    !hasError || status === 403 || status === 404
                        ? "no-access"
                        : status === 401
                          ? "sign-in-rejected"
                          : "unreachable",
            };
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
    const { t } = useTranslate();

    useEffect(() => {
        // Not on the web: asking the API means loading sign-in (ClerkJS),
        // which waits until someone opens Mobile export.
        if (productionId == null || isWebBuild) return;

        void queryClient.prefetchQuery(
            currentProductionQueryOptions(productionId),
        );
    }, [productionId, queryClient]);

    const prefetchMobileExportData = useCallback(() => {
        // A web build that can't sign in has nothing to fetch.
        if (isWebBuild && !isSignInEnabled) return;
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
                aria-label={t("mobileExport.title")}
                className={twMerge(
                    clsx(
                        "hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50",
                        "touch:flex touch:min-h-44 touch:w-full touch:flex-col touch:items-center touch:justify-center touch:gap-2",
                        {
                            "text-accent":
                                isOpen && contentId === "mobile-export",
                        },
                        buttonClassName,
                    ),
                )}
                id="sidebar-launcher-mobile-export"
            >
                <span aria-hidden>{label}</span>
                <TouchCaption className="max-w-full text-center leading-tight whitespace-normal">
                    {t("sidebar.mobile")}
                </TouchCaption>
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
    const { t } = useTranslate();
    const { data: currentProduction } = useCurrentProduction();
    const validationState = useMobileExportValidation();
    const productionId = useOtmProductionId();
    const isSignedInView = isAuthenticated || isAuthLoading;

    const heading = currentProduction ? (
        <div className="">
            <h4 className="text-h4 mb-8 leading-none">
                {currentProduction.name}
            </h4>
            <div className="text-body text-text-subtitle flex flex-wrap items-center gap-8">
                <h5 className="leading-none">
                    {currentProduction.ensemble.name}
                </h5>
                <span aria-hidden="true">|</span>
                <ViewEnsembleDetailsLink
                    ensembleId={currentProduction.ensemble.id}
                />
            </div>
        </div>
    ) : (
        <h4 className="text-h4 leading-none">
            <T keyName="mobileExport.title" />
        </h4>
    );

    return (
        <section className="animate-scale-in text-text flex h-full w-[30rem] flex-col gap-16">
            <header className="flex items-start justify-between gap-24">
                {heading}
                <div className="flex shrink-0 items-center gap-8">
                    {isSignedInView && <AuthButton />}
                    <button
                        onClick={toggleOpen}
                        aria-label={t("mobileExport.close")}
                        className="hover:text-red duration-150 ease-out"
                    >
                        <XIcon size={24} aria-hidden />
                    </button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1 grow flex-col gap-16 overflow-y-auto pr-3">
                <div
                    className={clsx(
                        "flex flex-col gap-12",
                        !isSignedInView && "min-h-0 flex-1",
                    )}
                >
                    {isWebBuild && !isSignInEnabled ? (
                        <WebMobileUnavailable />
                    ) : validationState.type === "no-access" ? (
                        <MobileExportAccessError />
                    ) : validationState.type === "unreachable" ? (
                        <MobileExportUnreachable />
                    ) : validationState.type === "sign-in-rejected" ? (
                        <MobileExportSignInRejected />
                    ) : isAuthLoading ? (
                        <MobileExportLoading
                            message={t("mobileExport.loading.checkingSignIn")}
                        />
                    ) : !isAuthenticated ? (
                        <SignedOutMobileExportContent />
                    ) : currentProduction ? (
                        <MobileExportView
                            currentProduction={currentProduction}
                        />
                    ) : productionId ? (
                        <MobileExportLoading
                            message={t("mobileExport.loading.validatingAccess")}
                        />
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
                    <T keyName="mobileExport.accessError.title" />
                </h4>
            </div>
            <p className="text-body text-text-subtitle">
                <T keyName="mobileExport.accessError.description" />
            </p>
            <p className="text-sub text-text-subtitle">
                <T keyName="mobileExport.accessError.hint" />
            </p>
            <div className="flex gap-8 align-middle">
                <DetachButton variant="red" />
                <Button variant="secondary" onClick={toggleOpen}>
                    <T keyName="mobileExport.close" />
                </Button>
            </div>
        </div>
    );
}

/** What went wrong with signing in, in the user's language; null if nothing. */
function signInErrorKey(code: string | undefined) {
    if (!code) return null;
    if (code === "TOKEN_EXPIRED")
        return "mobileExport.signedOut.errors.sessionExpired";
    if (code === "AUTH_UNAVAILABLE")
        return "mobileExport.signedOut.errors.unavailable";
    return "mobileExport.signedOut.errors.failed";
}

/** The server couldn't be reached, or the sign-in couldn't be refreshed. */
function MobileExportUnreachable() {
    const { toggleOpen } = useSidebarModalStore();
    const { refetch, isFetching } = useCurrentProduction();

    return (
        <div className="flex h-full flex-col justify-center gap-16 text-center">
            <div className="flex flex-col items-center gap-8">
                <WarningCircleIcon size={40} />
                <h4 className="text-h4 leading-none">
                    <T keyName="mobileExport.unreachable.title" />
                </h4>
            </div>
            <p className="text-body text-text-subtitle">
                <T keyName="mobileExport.unreachable.description" />
            </p>
            <div className="flex justify-center gap-8 align-middle">
                <Button
                    variant="primary"
                    disabled={isFetching}
                    onClick={() => void refetch()}
                >
                    <T keyName="mobileExport.unreachable.retry" />
                </Button>
                <Button variant="secondary" onClick={toggleOpen}>
                    <T keyName="mobileExport.close" />
                </Button>
            </div>
        </div>
    );
}

/** The server didn't accept the sign-in: sign out, then sign in again. */
function MobileExportSignInRejected() {
    const { toggleOpen } = useSidebarModalStore();
    const { logout, isLoggingOut } = useAuth();

    return (
        <div className="flex h-full flex-col justify-center gap-16 text-center">
            <div className="flex flex-col items-center gap-8">
                <WarningCircleIcon size={40} />
                <h4 className="text-h4 leading-none">
                    <T keyName="mobileExport.signInRejected.title" />
                </h4>
            </div>
            <p className="text-body text-text-subtitle">
                <T keyName="mobileExport.signInRejected.description" />
            </p>
            <div className="flex justify-center gap-8 align-middle">
                <Button
                    variant="primary"
                    disabled={isLoggingOut}
                    onClick={logout}
                >
                    <T keyName="mobileExport.signInRejected.signOut" />
                </Button>
                <Button variant="secondary" onClick={toggleOpen}>
                    <T keyName="mobileExport.close" />
                </Button>
            </div>
        </div>
    );
}

function SignedOutMobileExportContent() {
    const { t } = useTranslate();
    const { error } = useAuth();
    const errorKey = signInErrorKey(error?.code);
    const signUpUrl = isSignInEnabled ? getClerkSignUpUrl() : null;
    const handleSetupAccount = useCallback(() => {
        if (!signUpUrl) return;
        if (window.electron?.openExternal) {
            void window.electron.openExternal(signUpUrl);
        } else {
            window.open(signUpUrl, "_blank");
        }
    }, [signUpUrl]);

    const imageClassname = clsx(
        " block h-200 w-auto shrink-0  drop-shadow-text-subtitle",
    );
    return (
        <div className="text-body text-text-subtitle flex h-full min-h-0 flex-col gap-24 overflow-y-auto text-center">
            <div className="flex shrink-0 grow flex-col items-center gap-16">
                <div className="translate-x-[-32px]">
                    <img
                        src="https://assets.openmarch.com/otm-logo-purple-light.webp"
                        alt={t("mobileExport.logoAlt")}
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
                {signUpUrl && (
                    <div className="flex w-[85%] flex-col items-center gap-12">
                        <p className="text-body text-text-subtitle">
                            <T keyName="mobileExport.signedOut.createAccountPrompt" />
                        </p>
                        <Button variant="primary" onClick={handleSetupAccount}>
                            <ArrowSquareOutIcon size={16} />{" "}
                            <T keyName="mobileExport.signedOut.setupAccount" />
                        </Button>
                    </div>
                )}
                {isSignInEnabled && (
                    <div className="flex w-[85%] flex-col items-center gap-12">
                        <p className="text-body text-text-subtitle">
                            {isWebBuild ? (
                                <T keyName="mobileExport.signedOut.signInPromptWeb" />
                            ) : (
                                <T keyName="mobileExport.signedOut.signInPrompt" />
                            )}
                        </p>
                        <SignInButton variant="secondary" />
                        {errorKey && (
                            <p role="alert" className="text-sub text-red">
                                {t(errorKey)}
                            </p>
                        )}
                    </div>
                )}
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
                            className="border-stroke shadow-fg-1 rounded-20 aspect-[9/19.5] h-300 w-auto shrink-0 border object-cover"
                            draggable={false}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
