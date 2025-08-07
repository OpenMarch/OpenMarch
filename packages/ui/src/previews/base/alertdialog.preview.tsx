import {
    AlertDialog,
    AlertDialogTitle,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogTrigger,
    AlertDialogDescription,
    Button,
} from "@/components/index";

export const PreviewProps = {
    title: "Alert Dialog",
};

export default function Preview({ ..._props }) {
    return (
        <AlertDialog>
            <AlertDialogTrigger>
                <Button>Open Alert Dialog</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogTitle>Alert Dialog</AlertDialogTitle>
                <AlertDialogDescription>
                    This is an alert dialog.
                </AlertDialogDescription>
                <div className="flex justify-end gap-8">
                    <AlertDialogCancel>
                        <Button size="compact" variant="secondary">
                            Cancel
                        </Button>
                    </AlertDialogCancel>
                    <AlertDialogAction>
                        <Button size="compact" variant="red">
                            Delete
                        </Button>
                    </AlertDialogAction>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}
