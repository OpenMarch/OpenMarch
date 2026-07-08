import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@openmarch/ui";
import { DownloadSimpleIcon, XIcon } from "@phosphor-icons/react";
import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { useImportDrillPackage } from "./DrillImport";

export default function ImportModal({
    label = <DownloadSimpleIcon size={24} />,
    buttonClassName,
}: {
    label?: string | React.ReactNode;
    buttonClassName?: string;
}) {
    return (
        <SidebarModalLauncher
            contents={<ImportModalContents />}
            newContentId="import"
            buttonLabel={label}
            className={buttonClassName}
        />
    );
}

function ImportModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importDrill = useImportDrillPackage();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (!file) return;

        const result = await importDrill.mutateAsync(file);
        if (result.success) {
            toast.success(
                `${result.message} — ${result.marchers} marchers, ${result.sets} sets`,
            );
            toggleOpen();
        }
    };

    return (
        <div className="animate-scale-in text-text flex h-full w-[28rem] flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">Import</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex flex-col gap-12">
                <p className="text-body text-text/80">
                    Import a drill file to build the show. This replaces the
                    current marchers, sets, and coordinates, and imports the
                    bundled audio.
                </p>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".3dz"
                    className="hidden"
                    onChange={handleFileChange}
                />
                <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importDrill.isPending}
                    className="w-fit"
                >
                    {importDrill.isPending ? "Importing…" : "Choose drill file"}
                </Button>
            </div>
        </div>
    );
}
