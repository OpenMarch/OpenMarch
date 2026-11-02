import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { Button } from "@openmarch/ui";
import { T } from "@tolgee/react";
import ActionButton from "@/shortcuts/ActionButton";
import Shortcut from "@/components/ui/Shortcut";
import { InfoIcon } from "@phosphor-icons/react";

export default function FocusNotice() {
    const focussedComponent = useUiSettingsStore(
        (s) => s.uiSettings.focussedComponent,
    );

    if (focussedComponent !== "timeline") {
        return null;
    }

    return (
        <div className="rounded-6 border-stroke bg-modal text-text shadow-modal fixed left-1/2 z-[999] mt-32 flex max-w-[27.5rem] min-w-[18.75rem] -translate-x-1/2 flex-col gap-16 border p-20 font-sans backdrop-blur-lg">
            <div className="flex items-center gap-16">
                <InfoIcon size={24} />
                <span className="text-body text-text flex-1">
                    <T
                        keyName="timeline.focusNotice.body"
                        params={{
                            keys: () => <Shortcut binding="Escape" />,
                        }}
                    />
                </span>
            </div>
            <ActionButton action="focusCanvas">
                <Button size="compact" variant="secondary">
                    <T keyName="timeline.focusNotice.exit" />
                </Button>
            </ActionButton>
        </div>
    );
}
