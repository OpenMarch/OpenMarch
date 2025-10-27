import { Button } from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import { useRef } from "react";
import {
    getFieldPropertiesJSON,
    updateFieldsPropertiesJSON,
} from "../../global/classes/FieldProperties";

export default function FieldIoButtons() {
    const { t } = useTolgee();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImport = () => {
        fileInputRef.current?.click();
    };

    const handleFileInputChange = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            await updateFieldsPropertiesJSON(text);
            // Trigger a reload of the field properties to show the import
            window.location.reload();
        } catch (error) {
            console.error("Error importing field properties:", error);
        } finally {
            // Reset the input so the same file can be selected again
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleExport = async () => {
        try {
            const jsonStr = await getFieldPropertiesJSON();
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = "field-properties.fieldots";
            document.body.appendChild(a);
            a.click();

            // Cleanup
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error exporting field properties:", error);
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
                    onClick={handleImport}
                >
                    <T keyName="field.general.importField" />
                </Button>
                <Button
                    className="w-full"
                    tooltipText={t("field.general.exportField.tooltip")}
                    variant="secondary"
                    size="compact"
                    onClick={handleExport}
                >
                    <T keyName="field.general.exportField" />
                </Button>
            </div>
        </>
    );
}
