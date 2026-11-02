import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { Button } from "@openmarch/ui";
import { T } from "@tolgee/react";
import ActionButton from "@/shortcuts/ActionButton";
import Shortcut from "@/components/ui/Shortcut";
import { InfoIcon } from "@phosphor-icons/react";
import { getEffectiveBindings } from "@/shortcuts/keymap";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";

export default function FocusNotice() {
    const focussedComponent = useUiSettingsStore(
        (s) => s.uiSettings.focussedComponent,
    );
    const overrides = useShortcutOverridesStore((s) => s.overrides);

    if (focussedComponent !== "timeline") {
        return null;
    }

    // The key that leaves timeline focus: Exit timeline focus (Escape by default), or Focus
    // canvas (Alt+C) if that one is unbound. With neither bound, only the button does
    const exitAction = (["exitTimelineFocus", "focusCanvas"] as const).find(
        (id) => getEffectiveBindings(id, overrides).length > 0,
    );

    return (
        <div className="rounded-6 border-stroke bg-modal text-text shadow-modal fixed left-1/2 z-[999] mt-32 flex max-w-[27.5rem] min-w-[18.75rem] -translate-x-1/2 flex-col gap-16 border p-20 font-sans backdrop-blur-lg">
            <div className="flex items-center gap-16">
                <InfoIcon size={24} />
                <span className="text-body text-text flex-1">
                    {exitAction ? (
                        <T
                            keyName="focusNotice.message"
                            params={{
                                keys: () => <Shortcut action={exitAction} />,
                            }}
                        />
                    ) : (
                        <T keyName="focusNotice.messageNoKey" />
                    )}
                </span>
            </div>
            <ActionButton action="focusCanvas">
                <Button size="compact" variant="secondary">
                    <T keyName="focusNotice.exit" />
                </Button>
            </ActionButton>
        </div>
    );
}
