import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
} from "@openmarch/ui";
import { T } from "@tolgee/react";

export type GroupDropConflictState = {
    targetGroupId: number;
    allToMove: number[];
    unassignedToMove: number[];
};

type GroupDropConflictDialogProps = {
    conflict: GroupDropConflictState | null;
    onClose: () => void;
    onMoveAll: () => void;
    onMoveUnassignedOnly: () => void;
};

export default function GroupDropConflictDialog({
    conflict,
    onClose,
    onMoveAll,
    onMoveUnassignedOnly,
}: GroupDropConflictDialogProps) {
    return (
        <AlertDialog
            open={conflict != null}
            onOpenChange={(isOpen: boolean) => {
                if (!isOpen) onClose();
            }}
        >
            <AlertDialogContent>
                <AlertDialogTitle>
                    <T
                        keyName="inspector.light.groups.moveConflictTitle"
                        defaultValue="Some marchers are already in another group"
                    />
                </AlertDialogTitle>
                <AlertDialogDescription>
                    <T
                        keyName="inspector.light.groups.moveConflictDescription"
                        defaultValue="Choose how to assign the dragged marchers."
                    />
                </AlertDialogDescription>
                <div className="flex flex-wrap justify-end gap-8 pt-16">
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
                            variant="secondary"
                            size="compact"
                            className="whitespace-nowrap"
                            onClick={onMoveUnassignedOnly}
                        >
                            <T
                                keyName="inspector.light.groups.moveUnassignedOnly"
                                defaultValue="Move only unassigned marchers"
                            />
                        </Button>
                    </AlertDialogAction>
                    <AlertDialogAction>
                        <Button
                            variant="red"
                            size="compact"
                            className="whitespace-nowrap"
                            onClick={onMoveAll}
                        >
                            <T
                                keyName="inspector.light.groups.moveAllToThisGroup"
                                defaultValue="Move all marchers to this group"
                            />
                        </Button>
                    </AlertDialogAction>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}
