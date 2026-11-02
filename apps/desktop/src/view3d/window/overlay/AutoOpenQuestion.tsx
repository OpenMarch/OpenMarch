/**
 * Asks, in the 3D View itself, whether it should keep opening with every show. The editor opens
 * it with the show while the "open with the show" setting was never answered
 * (`view3dAutoOpenOnShow`), so this card shows each time the window opens until it is: either
 * answer saves the setting (Settings › General changes it later). It has no close button, since
 * closing it without answering would only bring it back next time.
 *
 * `window.view3d.autoOpen.get` is undefined while unanswered, and null where the window shouldn't
 * ask (the web editor, Playwright sessions).
 */
import { useEffect, useState } from "react";
import { useTranslate } from "@tolgee/react";
import { Button } from "@openmarch/ui";

export function AutoOpenQuestion() {
    const { t } = useTranslate();
    const [asking, setAsking] = useState(false);
    useEffect(() => {
        let cancelled = false;
        const autoOpen = window.view3d.autoOpen;
        if (!autoOpen) return;
        autoOpen
            .get()
            .then((setting) => {
                if (!cancelled && setting === undefined) setAsking(true);
            })
            .catch((error: unknown) =>
                console.warn("3D View: couldn't read auto-open", error),
            );
        return () => {
            cancelled = true;
        };
    }, []);
    if (!asking) return null;
    const answer = (keepOpening: boolean) => {
        setAsking(false);
        // A failed save leaves the setting unanswered, so the question comes back next time
        window.view3d.autoOpen
            .set(keepOpening)
            .catch((error: unknown) =>
                console.warn("3D View: couldn't save auto-open", error),
            );
    };
    return (
        <div
            role="dialog"
            aria-labelledby="view3d-auto-open-title"
            data-testid="view3d-auto-open-question"
            className="border-stroke bg-modal backdrop-blur-32 rounded-6 shadow-modal text-text pointer-events-auto flex w-[22rem] max-w-full flex-col gap-8 border p-12"
        >
            <p id="view3d-auto-open-title" className="text-body font-medium">
                {t("view3d.autoOpenPrompt.title")}
            </p>
            <p className="text-sub text-text/60">
                {t("view3d.autoOpenPrompt.description")}
            </p>
            <div className="flex justify-end gap-8">
                <Button
                    size="compact"
                    variant="secondary"
                    data-testid="view3d-auto-open-no"
                    onClick={() => answer(false)}
                >
                    {t("view3d.autoOpenPrompt.no")}
                </Button>
                <Button
                    size="compact"
                    data-testid="view3d-auto-open-yes"
                    onClick={() => answer(true)}
                >
                    {t("view3d.autoOpenPrompt.yes")}
                </Button>
            </div>
        </div>
    );
}
