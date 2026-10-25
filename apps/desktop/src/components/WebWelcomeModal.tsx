import { Description as DialogDescription } from "@radix-ui/react-dialog";
import { Button, Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { useWebWelcomeStore } from "@/stores/WebWelcomeStore";

/**
 * Explains the web build. Opens once per device when the app first starts,
 * and again from the "Web" badge in the title bar.
 */
export default function WebWelcomeModal() {
    const { open, setOpen } = useWebWelcomeStore();
    const save = window.electron.isMacOS ? "⌘S" : "Ctrl+S";

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="w-[40rem]">
                <DialogTitle>Welcome to OpenMarch</DialogTitle>
                <div className="text-text-subtitle flex flex-col gap-16 text-sm">
                    <DialogDescription asChild>
                        <p className="text-text">
                            OpenMarch runs right here on this device.
                            There&apos;s no account, and nothing is uploaded.
                        </p>
                    </DialogDescription>
                    <section className="flex flex-col gap-4">
                        <h3 className="text-text font-medium">
                            Your shows are saved on this device
                        </h3>
                        <p>
                            Every change is saved as you work, and the last 20
                            versions of each show are kept. Find your shows on
                            the start page.
                        </p>
                    </section>
                    <section className="flex flex-col gap-4">
                        <h3 className="text-text font-medium">
                            Back up regularly
                        </h3>
                        <p>
                            File → Back up (or {save}) saves a copy of the show
                            to Files, Google Drive or email. If this
                            device&apos;s data is cleared or the device is lost,
                            only your backups remain.
                        </p>
                    </section>
                    <section className="flex flex-col gap-4">
                        <h3 className="text-text font-medium">
                            A few desktop features aren&apos;t here yet
                        </h3>
                        <p>
                            PDF export and some file tools need the desktop app.
                            Video export works here.
                        </p>
                    </section>
                    <div className="flex justify-end pt-16">
                        <Button onClick={() => setOpen(false)}>Got it</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
