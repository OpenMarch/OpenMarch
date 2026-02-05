import { useEffect } from "react";
import { T } from "@tolgee/react";
import { useAlertModalStore } from "@/stores/AlertModalStore";

/**
 * Registers a listener for load file responses and shows an alert dialog
 * when file loading fails (403, 404, 500, or other errors).
 */
export function useLoadFileErrorHandler() {
    const { setTitle, setContent, setOpen } = useAlertModalStore();

    useEffect(() => {
        window.electron.onLoadFileResponse((resCode: number) => {
            if (resCode !== 200) {
                switch (resCode) {
                    case 403:
                        setTitle("fileAccessDialogError.forbidden.title");
                        setContent(
                            <>
                                <T keyName="fileAccessDialogError.forbidden.description" />
                                <span>
                                    Refer to the{" "}
                                    <a
                                        href="https://www.openmarch.com/troubleshooting/file-errors/#invalid-file-permissions-error"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-accent underline"
                                    >
                                        OpenMarch File Error Guide
                                    </a>{" "}
                                    for more information.
                                </span>
                            </>,
                        );
                        break;
                    case 404:
                        setTitle("fileAccessDialogError.notFound.title");
                        setContent(
                            <>
                                <T keyName="fileAccessDialogError.notFound.description" />
                                <span>
                                    Refer to the{" "}
                                    <a
                                        href="https://www.openmarch.com/troubleshooting/file-errors/#file-not-found-error"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-accent underline"
                                    >
                                        OpenMarch File Error Guide
                                    </a>{" "}
                                    for more information.
                                </span>
                            </>,
                        );
                        break;
                    case 500:
                        setTitle("fileAccessDialogError.server.title");
                        setContent(
                            <>
                                <T keyName="fileAccessDialogError.server.description" />
                                <span>
                                    Refer to the{" "}
                                    <a
                                        href="https://www.openmarch.com/troubleshooting/file-errors/#server-error"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-accent underline"
                                    >
                                        OpenMarch File Error Guide
                                    </a>{" "}
                                    for more information.
                                </span>
                            </>,
                        );
                        break;
                    default:
                        setTitle("fileAccessDialogError.default.title");
                        setContent(
                            <>
                                <T keyName="fileAccessDialogError.default.description" />
                                <span>
                                    Refer to the{" "}
                                    <a
                                        href="https://www.openmarch.com/troubleshooting/file-errors/#unable-to-open-file-error-or-render-failure"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-accent underline"
                                    >
                                        OpenMarch File Error Guide
                                    </a>{" "}
                                    for more information.
                                </span>
                            </>,
                        );
                }

                setOpen(true);
            }
        });
    }, [setContent, setOpen, setTitle]);
}
