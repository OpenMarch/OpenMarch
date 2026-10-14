import { useEffect } from "react";
import { T } from "@tolgee/react";
import { useAlertModalStore } from "@/stores/AlertModalStore";
import { FILE_TOO_NEW_STATUS } from "@om-electron/database/fileVersion";
import {
    NEEDS_CONVERSION_STATUS,
    OPEN_STOPPED_STATUS,
} from "@om-electron/database/convertOnOpenGate";

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
        const explain = (resCode: number) => {
            // OPEN_STOPPED_STATUS: the main process already showed a dialog (convert on open);
            // NEEDS_CONVERSION_STATUS: ConvertShowDialog asks the person.
            if (
                resCode !== 200 &&
                resCode !== OPEN_STOPPED_STATUS &&
                resCode !== NEEDS_CONVERSION_STATUS
            ) {
                switch (resCode) {
                    case 403:
                        setTitle("fileAccessDialogError.forbidden.title");
                        setContent(
                            <>
                                <T keyName="fileAccessDialogError.forbidden.description" />
                                <ReferToGuide
                                    guideUrl={FILE_ERROR_GUIDE_URLS.forbidden}
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
                                    guideUrl={FILE_ERROR_GUIDE_URLS.notFound}
                                />
                            </>,
                        );
                        break;
                    case FILE_TOO_NEW_STATUS:
                        setTitle("fileAccessDialogError.tooNew.title");
                        setContent(
                            <T keyName="fileAccessDialogError.tooNew.description" />,
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
        };
        const unsubscribe = window.electron.onLoadFileResponse(explain);
        // A refused open that closed the show reloads to the launch page, which explains it.
        let unmounted = false;
        void window.electron.takeLoadFileRefusal?.().then((resCode) => {
            if (!unmounted && resCode !== null) explain(resCode);
        });

        return () => {
            unmounted = true;
            unsubscribe();
        };
    }, [setContent, setOpen, setTitle]);
}
