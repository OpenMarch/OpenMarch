import { useAlertModalStore } from "@/stores/AlertModalStore";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
} from "@openmarch/ui";
import { AlertDialogAction } from "@radix-ui/react-alert-dialog";
import { T } from "@tolgee/react";

export default function AlertModal() {
    const { isOpen, title, content, setOpen } = useAlertModalStore();

    return (
        <AlertDialog open={isOpen} onOpenChange={setOpen}>
            <AlertDialogContent className="flex w-[50%] max-w-[50%] flex-col justify-start">
                <AlertDialogTitle>
                    <T keyName={title} />
                </AlertDialogTitle>
                <AlertDialogDescription>
                    <div className="flex w-full flex-col gap-16">{content}</div>
                </AlertDialogDescription>
                <AlertDialogAction className="mt-auto ml-auto">
                    <Button
                        variant="secondary"
                        size="compact"
                        onClick={() => setOpen(false)}
                    >
                        <T keyName="fileAccessDialogError.closeButton" />
                    </Button>
                </AlertDialogAction>
            </AlertDialogContent>
        </AlertDialog>
    );
}
