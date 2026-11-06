import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Button } from "@openmarch/ui";
import { T } from "@tolgee/react";

/** Where OpenMarch can sign in, to upload to the mobile app. */
const SIGN_IN_EDITOR_URL = "https://editor.openmarch.com";

/**
 * Mobile upload in a web build that can't sign in: a test or development
 * build off openmarch.com, where OpenMarch's sign-in doesn't run. Shown in
 * the export dialog's Mobile tab and the Export to Mobile sidebar.
 */
export default function WebMobileUnavailable() {
    return (
        <div className="border-stroke bg-fg-1 rounded-6 text-body flex flex-col items-start gap-12 border p-24">
            <h4 className="text-h4 leading-none">
                <T keyName="exportCoordinates.webMobileUnavailable.title" />
            </h4>
            <p className="text-text-subtitle">
                <T keyName="exportCoordinates.webMobileUnavailable.description" />
            </p>
            <Button
                variant="secondary"
                onClick={() =>
                    window.open(SIGN_IN_EDITOR_URL, "_blank", "noopener")
                }
            >
                <ArrowSquareOutIcon size={16} />{" "}
                <T keyName="exportCoordinates.webMobileUnavailable.openEditor" />
            </Button>
        </div>
    );
}
