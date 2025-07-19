import { Button } from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";

export default function FieldIoButtons() {
    const { t } = useTolgee();

    return (
        <div className="grid grid-cols-2 gap-8">
            <Button
                className="w-full"
                tooltipText={t("field.general.importField.tooltip")}
                variant="primary"
                size="compact"
                onClick={window.electron.importFieldPropertiesFile}
            >
                <T keyName="field.general.importField" />
            </Button>
            <Button
                className="w-full"
                tooltipText={t("field.general.exportField.tooltip")}
                variant="secondary"
                size="compact"
                onClick={window.electron.exportFieldPropertiesFile}
            >
                <T keyName="field.general.exportField" />
            </Button>
        </div>
    );
}
