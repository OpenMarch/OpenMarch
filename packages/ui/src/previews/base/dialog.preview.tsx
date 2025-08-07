import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogTrigger,
    DialogDescription,
    Button,
} from "@/components/index";

export const PreviewProps = {
    title: "Dialog",
};

export default function Preview({ ..._props }) {
    return (
        <Dialog>
            <DialogTrigger>
                <Button>Open Dialog</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>Dialog</DialogTitle>
                <DialogDescription>This is a dialog.</DialogDescription>
            </DialogContent>
        </Dialog>
    );
}
