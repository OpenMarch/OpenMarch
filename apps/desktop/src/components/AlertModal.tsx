import { useAlertModalStore } from "@/stores/AlertModalStore";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
} from "@openmarch/ui";
import { AlertDialogAction } from "@radix-ui/react-alert-dialog";

export default function AlertModal() {
    const { isOpen, title, content, setOpen } = useAlertModalStore();

    // TODO: Style this better
    return (
        <AlertDialog open={isOpen} onOpenChange={setOpen}>
            <AlertDialogContent>
                <AlertDialogTitle>{title}</AlertDialogTitle>
                <AlertDialogDescription>{content}</AlertDialogDescription>
                <AlertDialogAction>
                    <Button
                        variant="secondary"
                        size="compact"
                        onClick={() => setOpen(false)}
                    >
                        OK
                    </Button>
                </AlertDialogAction>
            </AlertDialogContent>
        </AlertDialog>
    );
}
