import { useState, useEffect } from "react";
import { Button, Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { FileIcon, ArrowSquareInIcon } from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import clsx from "clsx";
import { conToastError } from "@/utilities/utils";

interface NewFileModalProps {
    /** Called with true when a new file is successfully created/loaded */
    onSuccess: (isReady: boolean) => void;
    /** The trigger element (button) that opens this modal */
    children: React.ReactNode;
}

const extractFileName = (p: string) => p.split(/[/\\]/).pop() ?? p;

const activateOnKeyDown = (action: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        action();
    }
};

/**
 * Modal that lets the user choose between creating a blank new file or a new
 * file pre-populated with marchers and starting positions from the last page
 * of another .dots file.
 */
export default function NewFileModal({
    onSuccess,
    children,
}: NewFileModalProps) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<"blank" | "last-page">("blank");
    const [currentFilePath, setCurrentFilePath] = useState<string>("");
    const [sourceFilePath, setSourceFilePath] = useState<string>("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            window.electron
                .databaseGetPath()
                .then((p) => setCurrentFilePath(p ?? ""))
                .catch(() => setCurrentFilePath(""));
        }
    }, [open]);

    const hasCurrentFile = currentFilePath !== "";

    const sourceFileName = hasCurrentFile
        ? extractFileName(currentFilePath)
        : sourceFilePath
          ? extractFileName(sourceFilePath)
          : null;

    async function handleBrowse() {
        const path = await window.electron.pickSourceFile();
        if (path) setSourceFilePath(path);
    }

    async function handleCreate() {
        setLoading(true);
        try {
            if (mode === "blank") {
                const result = await window.electron.databaseCreate();
                if (result === 200) {
                    onSuccess(true);
                    setOpen(false);
                } else if (result !== undefined) {
                    conToastError("Failed to create new file");
                }
            } else {
                const source = hasCurrentFile
                    ? undefined
                    : sourceFilePath || undefined;
                const result =
                    await window.electron.databaseCreateFromLastPage(source);
                if (result === 200) {
                    onSuccess(true);
                    setOpen(false);
                } else if (result !== undefined) {
                    conToastError("Failed to create file from source");
                }
            }
        } catch (error) {
            conToastError(
                error instanceof Error
                    ? error.message
                    : "An unexpected error occurred",
            );
        } finally {
            setLoading(false);
        }
    }

    const canCreate =
        !loading &&
        (mode === "blank" ||
            (mode === "last-page" &&
                (hasCurrentFile || sourceFilePath !== "")));

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <span
                onClick={() => {
                    setMode("blank");
                    setSourceFilePath("");
                    setOpen(true);
                }}
                className="contents"
            >
                {children}
            </span>

            <DialogContent
                className="flex w-[480px] flex-col gap-16 p-24"
                aria-describedby={undefined}
            >
                <DialogTitle>
                    <T keyName="newFileModal.title" />
                </DialogTitle>

                <div className="flex flex-col gap-8">
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setMode("blank")}
                        onKeyDown={activateOnKeyDown(() => setMode("blank"))}
                        className={clsx(
                            "rounded-6 flex cursor-pointer items-start gap-12 border-2 p-16 text-left transition-colors duration-100",
                            mode === "blank"
                                ? "border-purple bg-fg-2"
                                : "border-stroke bg-fg-1 hover:bg-fg-2",
                        )}
                    >
                        <FileIcon
                            size={24}
                            className="text-text/60 mt-2 flex-shrink-0"
                        />
                        <div>
                            <p className="text-body font-medium">
                                <T keyName="newFileModal.blankTitle" />
                            </p>
                            <p className="text-sub text-text/60 mt-2">
                                <T keyName="newFileModal.blankDescription" />
                            </p>
                        </div>
                    </div>

                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setMode("last-page")}
                        onKeyDown={activateOnKeyDown(() =>
                            setMode("last-page"),
                        )}
                        className={clsx(
                            "rounded-6 flex cursor-pointer items-start gap-12 border-2 p-16 text-left transition-colors duration-100",
                            mode === "last-page"
                                ? "border-purple bg-fg-2"
                                : "border-stroke bg-fg-1 hover:bg-fg-2",
                        )}
                    >
                        <ArrowSquareInIcon
                            size={24}
                            className="text-text/60 mt-2 flex-shrink-0"
                        />
                        <div className="min-w-0">
                            <p className="text-body font-medium">
                                {hasCurrentFile ? (
                                    <T keyName="newFileModal.lastPageCurrentFile" />
                                ) : (
                                    <T keyName="newFileModal.lastPageOtherFile" />
                                )}
                            </p>
                            <p className="text-sub text-text/60 mt-2">
                                <T keyName="newFileModal.lastPageDescription" />
                            </p>
                            {mode === "last-page" && (
                                <div className="mt-8">
                                    {hasCurrentFile ? (
                                        <p className="text-sub text-text/80 truncate">
                                            <T keyName="newFileModal.source" />{" "}
                                            <span className="font-medium">
                                                {sourceFileName}
                                            </span>
                                        </p>
                                    ) : sourceFilePath ? (
                                        <div className="flex items-center gap-8">
                                            <p className="text-sub text-text/80 min-w-0 truncate">
                                                <span className="font-medium">
                                                    {sourceFileName}
                                                </span>
                                            </p>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    void handleBrowse();
                                                }}
                                                className="text-sub text-accent flex-shrink-0 underline"
                                            >
                                                <T keyName="newFileModal.change" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void handleBrowse();
                                            }}
                                            className="text-sub text-accent mt-4 underline"
                                        >
                                            <T keyName="newFileModal.browseForFile" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-8">
                    <Button
                        variant="secondary"
                        onClick={() => setOpen(false)}
                        disabled={loading}
                    >
                        <T keyName="newFileModal.cancel" />
                    </Button>
                    <Button
                        onClick={() => void handleCreate()}
                        disabled={!canCreate}
                    >
                        {loading ? (
                            <T keyName="newFileModal.creating" />
                        ) : (
                            <T keyName="newFileModal.create" />
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
