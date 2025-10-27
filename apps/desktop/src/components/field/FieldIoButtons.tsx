import { Button } from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import { useRef } from "react";
import {
    handleFileInputChange as handleFileInputChangeUtil,
    handleExport,
    handleImport,
} from "./FieldIoButtons.utils";

export default function FieldIoButtons() {
    const { t } = useTolgee();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImportClick = () => {
        handleImport(fileInputRef);
    };

    const handleFileInputChange = (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        void handleFileInputChangeUtil(event, fileInputRef);
    };

    const handleExportClick = () => {
        void handleExport();
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
                >
                    <T keyName="field.general.importField" />
                </Button>
                <Button
                    className="w-full"
                    tooltipText={t("field.general.exportField.tooltip")}
                    variant="secondary"
                    size="compact"
                    onClick={handleExportClick}
                >
                    <T keyName="field.general.exportField" />
                </Button>
            </div>
        </>
    );
}
