import { Button } from "../ui/Button";
import { useTranslation } from "react-i18next";

export default function FieldIoButtons() {
    const { t } = useTranslation();
    return (
        <div className="grid grid-cols-2 gap-8">
            <Button
                className="w-full"
                tooltipText="Import a custom field"
                variant="primary"
                onClick={window.electron.importFieldPropertiesFile}
            >
                {t("field.fieldIoButtons.importField")}
            </Button>
            <Button
                className="w-full"
                tooltipText="Export this field to a file to use in other projects"
                variant="secondary"
                onClick={window.electron.exportFieldPropertiesFile}
            >
                {t("field.fieldIoButtons.exportField")}
            </Button>
        </div>
    );
}
