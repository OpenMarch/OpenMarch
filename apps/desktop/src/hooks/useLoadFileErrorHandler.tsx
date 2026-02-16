import { useEffect } from "react";
import { T } from "@tolgee/react";
import { useAlertModalStore } from "@/stores/AlertModalStore";

const FILE_ERROR_GUIDE_URLS = {
    forbidden:
        "https://www.openmarch.com/troubleshooting/file-errors/#invalid-file-permissions-error",
    notFound:
        "https://www.openmarch.com/troubleshooting/file-errors/#file-not-found-error",
    server: "https://www.openmarch.com/troubleshooting/file-errors/#server-error",
    default:
        "https://www.openmarch.com/troubleshooting/file-errors/#unable-to-open-file-error-or-render-failure",
} as const;

function ReferToGuide({ guideUrl }: { guideUrl: string }) {
    return (
        <span>
            <T
                keyName="fileAccessDialogError.referToGuide"
                params={{
                    link: () => (
                        <a
                            href={guideUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent underline"
                        >
                            <T keyName="fileAccessDialogError.guideLinkText" />
                        </a>
                    ),
                }}
            />
        </span>
    );
}

/**
 * Registers a listener for load file responses and shows an alert dialog
 * when file loading fails (403, 404, 500, or other errors).
 */
export function useLoadFileErrorHandler() {
    const { setTitle, setContent, setOpen } = useAlertModalStore();

    useEffect(() => {
        const unsubscribe = window.electron.onLoadFileResponse(
            (resCode: number) => {
                if (resCode !== 200) {
                    switch (resCode) {
                        case 403:
                            setTitle("fileAccessDialogError.forbidden.title");
                            setContent(
                                <>
                                    <T keyName="fileAccessDialogError.forbidden.description" />
                                    <ReferToGuide
                                        guideUrl={
                                            FILE_ERROR_GUIDE_URLS.forbidden
                                        }
                                    />
                                </>,
                            );
                            break;
                        case 404:
                            setTitle("fileAccessDialogError.notFound.title");
                            setContent(
                                <>
                                    <T keyName="fileAccessDialogError.notFound.description" />
                                    <ReferToGuide
                                        guideUrl={
                                            FILE_ERROR_GUIDE_URLS.notFound
                                        }
                                    />
                                </>,
                            );
                            break;
                        case 500:
                            setTitle("fileAccessDialogError.server.title");
                            setContent(
                                <>
                                    <T keyName="fileAccessDialogError.server.description" />
                                    <ReferToGuide
                                        guideUrl={FILE_ERROR_GUIDE_URLS.server}
                                    />
                                </>,
                            );
                            break;
                        default:
                            setTitle("fileAccessDialogError.default.title");
                            setContent(
                                <>
                                    <T keyName="fileAccessDialogError.default.description" />
                                    <ReferToGuide
                                        guideUrl={FILE_ERROR_GUIDE_URLS.default}
                                    />
                                </>,
                            );
                    }

                    setOpen(true);
                }
            },
        );

        return () => {
            unsubscribe();
        };
    }, [setContent, setOpen, setTitle]);
}
