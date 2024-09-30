import { useCursorModeStore } from "@/stores/cursorMode/useCursorModeStore";

export default function StatusBar() {
    const { cursorMode } = useCursorModeStore();
    return (
        <div className="flex h-fit w-full items-center justify-between px-24 py-8 text-text">
            <div className="flex items-center gap-12">
                <p className="text-sub leading-none">
                    Cursor Mode: {cursorMode}
                </p>
            </div>
            <div className="flex items-center gap-12">
                <p className="text-sub leading-none">OpenMarch</p>
            </div>
        </div>
    );
}

// to do: add theme switcher in status bar
