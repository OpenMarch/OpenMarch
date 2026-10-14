import { T, useTranslate } from "@tolgee/react";
import EditorModeCards from "@/components/editorMode/EditorModeCards";
import type { EditorMode } from "@/stores/EditorModeStore";

export default function ModeStep({
    value,
    onChange,
}: {
    value: EditorMode | null;
    onChange: (mode: EditorMode) => void;
}) {
    const { t } = useTranslate();
    return (
        <div className="flex flex-col gap-12">
            <EditorModeCards
                value={value}
                onChange={onChange}
                size="large"
                id="welcome"
                aria-label={t("welcomeFlow.mode.title")}
            />
            <p className="text-sub text-text-subtitle text-center">
                <T keyName="welcomeFlow.mode.note" />
            </p>
        </div>
    );
}
