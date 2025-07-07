import { Button } from "@openmarch/ui";

export default function FieldIoButtons() {
    return (
        <div className="grid grid-cols-2 gap-8">
            <Button
                className="w-full"
                tooltipText="Import a custom field"
                variant="primary"
                size="compact"
                onClick={window.electron.importFieldPropertiesFile}
            >
                Import Field
            </Button>
            <Button
                className="w-full"
                tooltipText="Export this field to a file to use in other projects"
                variant="secondary"
                size="compact"
                onClick={window.electron.exportFieldPropertiesFile}
            >
                Export Field
            </Button>
        </div>
    );
}
