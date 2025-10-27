import { Button } from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import { useRef, useState } from "react";
import {
    handleFileInputChange as handleFileInputChangeUtil,
    handleExport,
    handleImport,
} from "./FieldIoButtons.utils";

export default function FieldIoButtons() {
    const { t } = useTolgee();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const handleImportClick = () => {
        handleImport(fileInputRef);
    };

    const handleFileInputChange = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        setIsImporting(true);
        try {
            await handleFileInputChangeUtil(event, fileInputRef);
        } finally {
            setIsImporting(false);
        }
    };

    const handleExportClick = async () => {
        setIsExporting(true);
        try {
            await handleExport();
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept=".fieldots"
                style={{ display: "none" }}
                onChange={handleFileInputChange}
            />
            <div className="grid grid-cols-2 gap-8">
                <Button
                    className="w-full"
                    tooltipText={t("field.general.importField.tooltip")}
                    variant="primary"
                    size="compact"
                    onClick={handleImportClick}
                    disabled={isImporting || isExporting}
                >
                    <T keyName="field.general.importField" />
                </Button>
                <Button
                    className="w-full"
                    tooltipText={t("field.general.exportField.tooltip")}
                    variant="secondary"
                    size="compact"
                    onClick={handleExportClick}
                    disabled={isImporting || isExporting}
                >
                    <T keyName="field.general.exportField" />
                </Button>
            </div>
        </>
    );
}
