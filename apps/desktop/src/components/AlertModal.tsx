import { useAlertModalStore } from "@/stores/AlertModalStore";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
} from "@openmarch/ui";
import { T } from "@tolgee/react";

export default function AlertModal() {
    const { isOpen, title, content, actions, setOpen } = useAlertModalStore();

    return (
        <AlertDialog open={isOpen} onOpenChange={setOpen}>
            <AlertDialogContent className="flex w-[50%] max-w-[50%] flex-col justify-start">
                <AlertDialogTitle>
                    <T keyName={title} />
                </AlertDialogTitle>
                <AlertDialogDescription>
                    <div className="flex w-full flex-col gap-16">{content}</div>
                </AlertDialogDescription>
                {actions ? (
                    actions
                ) : (
                    <AlertDialogAction>
                        <Button
                            variant="secondary"
                            size="compact"
                            onClick={() => setOpen(false)}
                            className="mt-auto ml-auto"
                        >
                            <T keyName="fileAccessDialogError.closeButton" />
                        </Button>
                    </AlertDialogAction>
                )}
            </AlertDialogContent>
        </AlertDialog>
    );
}
