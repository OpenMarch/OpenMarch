import { Button } from "@openmarch/ui";
import { touchSafeAccept } from "@/utilities/fileAccept";
import { T, useTranslate } from "@tolgee/react";
import { useRef, useState } from "react";
import {
    handleFileInputChange as handleFileInputChangeUtil,
    handleExport,
    handleImport,
} from "./FieldIoButtons.utils";

export default function FieldIoButtons() {
    const { t } = useTranslate();
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
                accept={touchSafeAccept(".fieldots")}
                style={{ display: "none" }}
                onChange={handleFileInputChange}
            />
            <div className="flex gap-8">
                <Button
                    tooltipText={t("field.general.importField.tooltip")}
                    variant="secondary"
                    size="compact"
                    onClick={handleImportClick}
                    disabled={isImporting || isExporting}
                >
                    <T keyName="field.general.importField" />
                </Button>
                <Button
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
