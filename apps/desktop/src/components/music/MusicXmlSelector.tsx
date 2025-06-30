import { useRef, useState } from "react";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { Button } from "@openmarch/ui";

export default function MusicXmlSelector() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importedFileName, setImportedFileName] = useState<string | null>(
        null,
    );
    const [importing, setImporting] = useState(false);
    //const { setMeasures } = useTimingObjectsStore(); // make sure your store exposes setMeasures

    const handleFileChange = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {};

    return (
        <div className="mt-8 flex items-center gap-8 px-12">
            <label className="text-body text-text/80 w-full">
                MusicXML Import
            </label>
            <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.musicxml"
                className="hidden"
                onChange={handleFileChange}
            />
            <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
            >
                {importing ? "Importing..." : "Import MusicXML File"}
            </Button>
            {importedFileName && (
                <span className="text-text-subtitle text-sub ml-4">
                    Imported: {importedFileName}
                </span>
            )}
        </div>
    );
}
