import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { Button } from "@openmarch/ui";
import RegisteredActionButton from "./RegisteredActionButton";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import { InfoIcon } from "@phosphor-icons/react";

export default function FocusNotice() {
    const {
        uiSettings: { focussedComponent },
    } = useUiSettingsStore();

    if (focussedComponent !== "timeline") {
        return null;
    }

    return (
        <div className="rounded-6 border-stroke bg-modal text-text shadow-modal fixed left-1/2 z-[999] mt-32 flex max-w-[27.5rem] min-w-[18.75rem] -translate-x-1/2 flex-col gap-16 border p-20 font-sans backdrop-blur-lg">
            <div className="flex items-center gap-16">
                <InfoIcon size={24} />
                <span className="text-body text-text flex-1">
                    Timeline is currently focussed, all other interaction is
                    disabled. Press ESC or the button below to re-focus the main
                    editor.
                </span>
            </div>
            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.focusCanvas}
            >
                <Button size="compact" variant="secondary">
                    Exit Timeline Focus
                </Button>
            </RegisteredActionButton>
        </div>
    );
}
