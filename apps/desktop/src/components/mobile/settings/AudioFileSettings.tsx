import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import {
    PencilIcon,
    TrashIcon,
    CheckCircleIcon,
    PlusIcon,
    DotsThreeIcon,
    SpinnerIcon,
} from "@phosphor-icons/react";
import {
    Button,
    Checkbox,
    DangerNote,
    Dialog,
    DialogContent,
    DialogTitle,
    Input,
} from "@openmarch/ui";
import {
    useAudioFiles,
    useSetActiveAudioFileMutation,
    useUpdateAudioFileNicknameMutation,
    useDeleteAudioFileMutation,
    useAddAudioFileMutation,
} from "../queries/useAudioFiles";
import { getAudioDuration, getAudioSizeMegabytes } from "../audio-files/utils";
import clsx from "clsx";

export type AudioFileDetails = {
    id: number;
    name: string;
    sizeMb: number;
    durationSeconds: number;
    nickname?: string;
    createdAt: Date;
    checksum?: string;
};

function formatDuration(seconds: number): string {
    const roundedSeconds = Math.round(seconds);
    const m = Math.floor(roundedSeconds / 60);
    const s = roundedSeconds % 60;
    return `${m}m ${s}s`;
}

function formatDate(date: Date): string {
    return date.toLocaleString(undefined, {
        month: "numeric",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function AddAudioDialog({
    open,
    onOpenChange,
    file,
    nickname,
    onNicknameChange,
    setAsDefault,
    onSetAsDefaultChange,
    onClose,
    onSubmit,
    isPending,
    errorMessage,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    file: File | null;
    nickname: string;
    onNicknameChange: (value: string) => void;
    setAsDefault: boolean;
    onSetAsDefaultChange: (value: boolean) => void;
    onClose: () => void;
    onSubmit: () => void;
    isPending: boolean;
    errorMessage: string | null;
}) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            aria-describedby="Add Alternate Audio File"
        >
            <DialogContent className="flex h-fit max-w-sm flex-col gap-16">
                <DialogTitle>Add Alternate Audio File</DialogTitle>
                {file && (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSubmit();
                        }}
                        className="flex flex-col gap-16"
                    >
                        <p className="text-body text-text-subtitle">
                            {file.name}
                        </p>
                        <div className="flex flex-col gap-4">
                            <label
                                htmlFor="add-audio-nickname"
                                className="text-text-subtitle text-sub"
                            >
                                Nickname (optional)
                            </label>
                            <Input
                                id="add-audio-nickname"
                                value={nickname}
                                onChange={(e) =>
                                    onNicknameChange(e.target.value)
                                }
                                placeholder="Nickname (optional)"
                                aria-label="Nickname"
                            />
                        </div>
                        <div className="flex items-center gap-8">
                            <Checkbox
                                checked={setAsDefault}
                                onClick={() =>
                                    onSetAsDefaultChange(!setAsDefault)
                                }
                            />
                            <label>Set as active</label>
                        </div>
                        {errorMessage && (
                            <DangerNote>{errorMessage}</DangerNote>
                        )}
                        <p className="text-body text-text-subtitle">
                            Performers and instructors will be able to select
                            this audio file in the mobile app.
                        </p>
                        <div className="flex justify-end gap-8">
                            <Button
                                variant="secondary"
                                size="compact"
                                type="button"
                                onClick={onClose}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                size="compact"
                                type="submit"
                                disabled={isPending}
                            >
                                {isPending ? "Uploading…" : "Add"}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}

function EditNicknameDialog({
    open,
    onOpenChange,
    file,
    value,
    onValueChange,
    onClose,
    onSave,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    file: AudioFileDetails | null;
    value: string;
    onValueChange: (value: string) => void;
    onClose: () => void;
    onSave: () => void;
}) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            aria-describedby="Edit Nickname"
        >
            <DialogContent className="flex h-fit max-w-sm flex-col gap-16">
                <DialogTitle>Edit Nickname</DialogTitle>
                {file && (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSave();
                        }}
                        className="flex flex-col gap-16"
                    >
                        <Input
                            value={value}
                            onChange={(e) => onValueChange(e.target.value)}
                            placeholder="Nickname"
                            aria-label="Nickname"
                        />
                        <div className="flex justify-end gap-8">
                            <Button
                                variant="secondary"
                                size="compact"
                                type="button"
                                onClick={onClose}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                size="compact"
                                type="submit"
                            >
                                Save
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}

export function AudioFileSettings({
    production,
    setDefaultAudioFileId,
}: {
    production: { id: number; default_audio_file_id: number | null };
    setDefaultAudioFileId: (audioFileId: number) => void;
}) {
    const productionId = production.id;
    const queryClient = useQueryClient();
    const setActiveMutation = useSetActiveAudioFileMutation(queryClient);
    const { data: audioFiles, isSuccess: audioFilesLoaded } =
        useAudioFiles(productionId);
    const updateNicknameMutation =
        useUpdateAudioFileNicknameMutation(queryClient);
    const deleteMutation = useDeleteAudioFileMutation(queryClient);
    const addAudioMutation = useAddAudioFileMutation(queryClient);

    const [editNicknameFile, setEditNicknameFile] =
        useState<AudioFileDetails | null>(null);
    const [editNicknameValue, setEditNicknameValue] = useState("");

    const [addAudioOpen, setAddAudioOpen] = useState(false);
    const [addAudioFile, setAddAudioFile] = useState<File | null>(null);
    const [addAudioNickname, setAddAudioNickname] = useState("");
    const [addAudioSetAsDefault, setAddAudioSetAsDefault] = useState(false);
    const addAudioFileInputRef = useRef<HTMLInputElement>(null);

    const handleSetActive = (audioFileId: number) => {
        if (!productionId) return;
        setActiveMutation.mutate({ productionId, audioFileId });
        setDefaultAudioFileId(audioFileId);
    };

    const openEditNickname = (file: AudioFileDetails) => {
        setEditNicknameFile(file);
        setEditNicknameValue(file.nickname ?? file.name);
    };

    const closeEditNickname = () => {
        setEditNicknameFile(null);
        setEditNicknameValue("");
    };

    const confirmEditNickname = () => {
        if (!productionId || !editNicknameFile) return;
        updateNicknameMutation.mutate({
            productionId,
            audioFileId: editNicknameFile.id,
            nickname: editNicknameValue,
        });
        closeEditNickname();
    };

    const handleDelete = (audioFileId: number) => {
        if (!productionId) return;
        deleteMutation.mutate({ productionId, audioFileId });
    };

    const handleAddAlternateClick = () => {
        addAudioFileInputRef.current?.click();
    };

    const handleAddAudioFileSelected = (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        if (file) {
            setAddAudioFile(file);
            setAddAudioNickname(file.name.replace(/\.[^.]+$/, "") ?? "");
            setAddAudioSetAsDefault(production.default_audio_file_id === null);
            setAddAudioOpen(true);
        }
        e.target.value = "";
    };

    const closeAddAudio = () => {
        setAddAudioOpen(false);
        setAddAudioFile(null);
        setAddAudioNickname("");
        setAddAudioSetAsDefault(false);
        addAudioMutation.reset();
    };

    const confirmAddAudio = async () => {
        if (!productionId || !addAudioFile) return;
        const [durationSeconds, sizeMegabytes] = await Promise.all([
            getAudioDuration(addAudioFile),
            Promise.resolve(getAudioSizeMegabytes(addAudioFile)),
        ]);
        addAudioMutation.mutate(
            {
                productionId,
                file: addAudioFile,
                nickname: addAudioNickname || undefined,
                setAsDefault: addAudioSetAsDefault,
                durationSeconds: durationSeconds ?? 0,
                sizeMegabytes,
            },
            {
                onSuccess: () => closeAddAudio(),
            },
        );
    };

    const canMutate = !!productionId;

    return (
        <div className="flex flex-col gap-6">
            <h3 className="text-body text-text-subtitle font-medium">
                Audio Files
            </h3>

            <div className="flex flex-col gap-8">
                {!audioFilesLoaded ? (
                    <div className="flex animate-spin items-center justify-center">
                        <SpinnerIcon size={16} />
                    </div>
                ) : (
                    audioFiles.map((file) => {
                        const isActive =
                            file.id === production.default_audio_file_id;
                        return (
                            <div
                                key={file.id}
                                className={clsx(
                                    "rounded-6 bg-fg-1 flex items-center justify-between gap-12 border p-12",
                                    isActive
                                        ? "border-accent"
                                        : "border-stroke",
                                )}
                            >
                                <div className="text-body text-text flex min-w-0 flex-1 flex-col gap-4">
                                    <span className="truncate font-medium">
                                        {file.nickname ?? file.name}
                                    </span>
                                    <div className="text-text-subtitle flex flex-wrap gap-12 text-sm">
                                        <span>
                                            {formatDuration(
                                                Number(
                                                    file.durationSeconds ?? 0,
                                                ),
                                            )}
                                        </span>
                                        <span>
                                            {Number(file.sizeMb ?? 0).toFixed(
                                                2,
                                            )}{" "}
                                            MB
                                        </span>
                                        <span>
                                            {formatDate(file.createdAt)}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-8">
                                    {isActive && (
                                        <span className="text-accent text-sm font-medium">
                                            Active
                                        </span>
                                    )}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                className="hover:text-accent focus-visible:ring-accent rounded-4 text-text-subtitle p-4 outline-hidden transition-colors duration-150 ease-out focus-visible:-translate-y-4 focus-visible:ring-2"
                                                aria-label="Audio file options"
                                            >
                                                <DotsThreeIcon size={20} />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                            align="end"
                                            className="rounded-6 border-stroke bg-bg-1 z-50 border p-4 shadow-lg"
                                        >
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    handleSetActive(file.id)
                                                }
                                                hidden={isActive}
                                                className="rounded-4 text-text hover:bg-fg-1 focus:bg-fg-1 flex cursor-pointer items-center gap-8 px-12 py-8 text-sm transition-colors outline-none"
                                            >
                                                <CheckCircleIcon size={16} />
                                                <span>Set as active</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    openEditNickname(file)
                                                }
                                                className="rounded-4 text-text hover:text-accent flex cursor-pointer items-center gap-8 px-12 py-8 text-sm transition-colors outline-none"
                                            >
                                                <PencilIcon size={16} />
                                                <span>Edit Nickname</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    handleDelete(file.id)
                                                }
                                                className="rounded-4 text-text hover:text-red flex cursor-pointer items-center gap-8 px-12 py-8 text-sm transition-colors outline-none"
                                            >
                                                <TrashIcon size={16} />
                                                <span>Delete</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="flex justify-end">
                <input
                    ref={addAudioFileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    aria-hidden
                    onChange={handleAddAudioFileSelected}
                />
                <Button
                    variant="secondary"
                    size="compact"
                    onClick={handleAddAlternateClick}
                    disabled={!canMutate}
                >
                    <PlusIcon size={16} /> Add Alternate Audio File
                </Button>
            </div>

            <AddAudioDialog
                open={addAudioOpen}
                onOpenChange={(open) => {
                    if (!open) closeAddAudio();
                }}
                file={addAudioFile}
                nickname={addAudioNickname}
                onNicknameChange={setAddAudioNickname}
                setAsDefault={addAudioSetAsDefault}
                onSetAsDefaultChange={setAddAudioSetAsDefault}
                onClose={closeAddAudio}
                onSubmit={confirmAddAudio}
                isPending={addAudioMutation.isPending}
                errorMessage={
                    addAudioMutation.isError && addAudioMutation.error?.message
                        ? addAudioMutation.error.message
                        : null
                }
            />

            <EditNicknameDialog
                open={editNicknameFile !== null}
                onOpenChange={(o) => {
                    if (!o) closeEditNickname();
                }}
                file={editNicknameFile}
                value={editNicknameValue}
                onValueChange={setEditNicknameValue}
                onClose={closeEditNickname}
                onSave={confirmEditNickname}
            />
        </div>
    );
}
