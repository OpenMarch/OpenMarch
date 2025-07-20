import React, { useState } from "react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogClose,
} from "@openmarch/ui";
import { LogoWindows, LogoMacOS, LogoLinux } from "@/components/Logos";
import { CURRENT_VERSION } from "@/constants";
import { HeartIcon } from "@phosphor-icons/react";

export default function DownloadCards() {
    const [donationDialogOpen, setDonationDialogOpen] = useState(false);

    const handleDownloadClick = () => {
        // Show donation dialog after a short delay to let download start
        setTimeout(() => {
            setDonationDialogOpen(true);
        }, 500);
    };

    return (
        <>
            <div className="grid h-fit w-full min-w-0 grid-cols-3 gap-8 max-[1024px]:grid-cols-2 max-[768px]:grid-cols-1">
                {/* Windows Card */}
                <div className="rounded-6 border-stroke bg-fg-1 flex flex-col items-center justify-center gap-24 border p-48 max-[600px]:p-24">
                    <LogoWindows />
                    <h1 className="text-h1">Windows</h1>
                    <div className="flex flex-wrap gap-12">
                        <a
                            href={`https://github.com/OpenMarch/OpenMarch/releases/download/${CURRENT_VERSION}/OpenMarch_${CURRENT_VERSION.substring(1)}.exe`}
                            onClick={handleDownloadClick}
                            download
                        >
                            <Button variant="secondary">Download .exe</Button>
                        </a>
                    </div>
                </div>

                {/* macOS Card */}
                <div className="rounded-6 border-stroke bg-fg-1 flex flex-col items-center justify-center gap-24 border p-48 max-[600px]:p-24">
                    <LogoMacOS />
                    <h1 className="text-h1">macOS</h1>
                    <div className="flex flex-col items-center justify-center gap-12">
                        <a
                            href={`https://github.com/OpenMarch/OpenMarch/releases/download/${CURRENT_VERSION}/OpenMarch_${CURRENT_VERSION.substring(1)}-darwin_arm64.dmg`}
                            onClick={handleDownloadClick}
                            download
                        >
                            <Button variant="secondary">
                                Download for Apple Silicon
                            </Button>
                        </a>
                        <a
                            href={`https://github.com/OpenMarch/OpenMarch/releases/download/${CURRENT_VERSION}/OpenMarch_${CURRENT_VERSION.substring(1)}-darwin_x64.dmg`}
                            onClick={handleDownloadClick}
                            download
                        >
                            <Button variant="secondary">
                                Download for Intel
                            </Button>
                        </a>
                    </div>
                </div>

                {/* Linux Card */}
                <div className="rounded-6 border-stroke bg-fg-1 flex flex-col items-center justify-center gap-24 border p-48 max-[600px]:p-24">
                    <LogoLinux />
                    <h1 className="text-h1">Linux</h1>
                    <div className="flex flex-col items-center justify-center gap-12">
                        <a
                            href={`https://github.com/OpenMarch/OpenMarch/releases/download/${CURRENT_VERSION}/OpenMarch_${CURRENT_VERSION.substring(1)}-linux_x86_64.AppImage`}
                            onClick={handleDownloadClick}
                            download
                        >
                            <Button variant="secondary">
                                Download AppImage
                            </Button>
                        </a>
                        <a href="https://snapcraft.io/openmarch">
                            <Button variant="secondary">Go to Snapcraft</Button>
                        </a>
                    </div>
                </div>
            </div>

            {/* Donation Dialog */}
            <Dialog
                open={donationDialogOpen}
                onOpenChange={setDonationDialogOpen}
            >
                <DialogContent className="max-w-md">
                    <DialogTitle>
                        <div className="flex items-center gap-8">
                            <HeartIcon size={24} className="text-red" />
                            Support OpenMarch
                        </div>
                    </DialogTitle>
                    <DialogDescription>
                        <div className="flex flex-col gap-16">
                            <p>
                                Thanks for downloading OpenMarch! Your download
                                should start shortly.
                            </p>
                            <div className="bg-fg-2 rounded-6 border-stroke border p-16">
                                <p className="text-text text-sm">
                                    OpenMarch is a free, open-source project
                                    built by passionate developers. If you find
                                    it useful, consider supporting our work to
                                    help us continue improving the app and
                                    adding new features.
                                </p>
                            </div>
                            <div className="flex gap-6">
                                <a
                                    href="https://donate.stripe.com/eVq28jcq13RXgAlbOPfbq00"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full"
                                >
                                    <Button
                                        variant="primary"
                                        className="flex w-full items-center gap-8"
                                    >
                                        <HeartIcon size={16} />
                                        Leave a Tip
                                    </Button>
                                </a>
                                <DialogClose>
                                    <Button
                                        variant="secondary"
                                        className="whitespace-nowrap"
                                    >
                                        Maybe later
                                    </Button>
                                </DialogClose>
                            </div>
                        </div>
                    </DialogDescription>
                </DialogContent>
            </Dialog>
        </>
    );
}
