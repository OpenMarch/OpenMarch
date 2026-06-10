import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    AlertDialogTrigger,
    Button,
    Input,
    TooltipClassName,
} from "@openmarch/ui";
import { TrashIcon, UsersIcon } from "@phosphor-icons/react";
import {
    Tooltip,
    TooltipContent,
    TooltipPortal,
    TooltipTrigger,
} from "@radix-ui/react-tooltip";
import { T, useTolgee } from "@tolgee/react";
import clsx from "clsx";
import {
    type ChangeEvent,
    type KeyboardEvent,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";

export interface GroupItemProps {
    groupId: number;
    groupNickname: string | null;
    numberOfMarchers: number;
    showEffectAssignmentControls: boolean;
    onNameChange: (name: string | null) => void;
    onDelete: () => void;
    onSelectMarchersInGroup: () => void;
}

const stopRowClickPropagation = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
};

export default function GroupItem({
    groupNickname,
    groupId,
    numberOfMarchers,
    showEffectAssignmentControls,
    onNameChange,
    onDelete,
    onSelectMarchersInGroup,
}: GroupItemProps) {
    const { t } = useTolgee();
    const nameId = useId();
    const nameInputRef = useRef<HTMLInputElement>(null);
    const name = groupNickname ?? "";

    const [editingName, setEditingName] = useState(false);
    const [draftName, setDraftName] = useState(name);

    useEffect(() => {
        setDraftName(name);
    }, [name]);

    useEffect(() => {
        if (editingName) nameInputRef.current?.focus();
    }, [editingName]);

    useEffect(() => {
        if (!showEffectAssignmentControls) return;
        setDraftName(name);
        setEditingName(false);
    }, [showEffectAssignmentControls, name]);

    const commitNameFromDraft = () => {
        const nextName = draftName.slice(0, 255);
        const normalizedName = nextName.trim() === "" ? null : nextName;
        onNameChange(normalizedName);
        setEditingName(false);
    };

    const openNameEdit = () => {
        setDraftName(name);
        setEditingName(true);
    };

    const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
        setDraftName(e.currentTarget.value.slice(0, 255));
    };

    const handleNameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            commitNameFromDraft();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            setDraftName(name);
            setEditingName(false);
        }
    };

    const displayName =
        name.trim() !== ""
            ? name
            : t("inspector.light.groups.groupItem.defaultName", {
                  id: groupId,
                  defaultValue: `Group ${groupId}`,
              });

    return (
        <div className="flex w-full min-w-0 items-start justify-between gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
                {editingName && !showEffectAssignmentControls ? (
                    <Input
                        id={nameId}
                        ref={nameInputRef}
                        compact
                        type="text"
                        className="w-full min-w-0"
                        value={draftName}
                        onChange={handleNameChange}
                        onClick={stopRowClickPropagation}
                        onBlur={commitNameFromDraft}
                        onKeyDown={handleNameKeyDown}
                        aria-label={t("inspector.light.groups.groupItem.name", {
                            defaultValue: "Name",
                        })}
                    />
                ) : showEffectAssignmentControls ? (
                    <p
                        className={
                            name.trim() === ""
                                ? "text-h5 text-text/50 w-full min-w-0 truncate text-left italic"
                                : "text-h5 text-text w-full min-w-0 truncate text-left"
                        }
                    >
                        {displayName}
                    </p>
                ) : (
                    <button
                        type="button"
                        className={
                            name.trim() === ""
                                ? "text-h5 text-text/50 hover:text-text/80 w-fit min-w-0 cursor-pointer truncate text-left italic transition-colors"
                                : "text-h5 text-text hover:text-accent w-fit min-w-0 cursor-pointer truncate text-left transition-colors"
                        }
                        onClick={(e) => {
                            stopRowClickPropagation(e);
                            openNameEdit();
                        }}
                    >
                        {displayName}
                    </button>
                )}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            className="hover:text-accent flex w-fit cursor-pointer items-baseline gap-4 transition-colors"
                            onClick={(e) => {
                                stopRowClickPropagation(e);
                                onSelectMarchersInGroup();
                            }}
                            aria-label={t(
                                "inspector.light.groups.groupItem.selectAllMarchersInGroup",
                                {
                                    defaultValue:
                                        "Select all marchers in group",
                                },
                            )}
                        >
                            <UsersIcon size={16} aria-hidden />
                            <span className="text-lg font-bold">
                                {numberOfMarchers}
                            </span>
                        </button>
                    </TooltipTrigger>
                    <TooltipPortal>
                        <TooltipContent
                            side="bottom"
                            align="center"
                            className={clsx(TooltipClassName, "p-16")}
                        >
                            <T
                                keyName="inspector.light.groups.groupItem.selectAllMarchersInGroup"
                                defaultValue="Select all marchers in group"
                            />
                        </TooltipContent>
                    </TooltipPortal>
                </Tooltip>
            </div>
            <div className="flex shrink-0 flex-wrap items-start gap-8">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            type="button"
                            variant="secondary"
                            content="icon"
                            size="compact"
                            className="rounded-6"
                            disabled={showEffectAssignmentControls}
                            onClick={stopRowClickPropagation}
                            aria-label={t("inspector.light.groups.deleteAria", {
                                defaultValue: "Delete group",
                            })}
                        >
                            <TrashIcon aria-hidden />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogTitle>
                            <T
                                keyName="inspector.light.groups.deleteTitle"
                                defaultValue="Delete this group?"
                            />
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <T
                                keyName="inspector.light.groups.deleteDescription"
                                defaultValue="This group may be referenced by lighting effects. Those links will be removed."
                            />
                        </AlertDialogDescription>
                        <div className="flex justify-end gap-8 pt-16">
                            <AlertDialogCancel asChild>
                                <Button variant="secondary" size="compact">
                                    <T
                                        keyName="inspector.light.groups.cancel"
                                        defaultValue="Cancel"
                                    />
                                </Button>
                            </AlertDialogCancel>
                            <AlertDialogAction>
                                <Button
                                    variant="red"
                                    size="compact"
                                    onClick={onDelete}
                                >
                                    <T
                                        keyName="inspector.light.groups.deleteConfirm"
                                        defaultValue="Delete"
                                    />
                                </Button>
                            </AlertDialogAction>
                        </div>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
}
