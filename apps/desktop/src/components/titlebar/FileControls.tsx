import { ArrowUUpLeftIcon, ArrowUUpRightIcon } from "@phosphor-icons/react";
import * as api from "@/api/api";
import { useFullscreenStore } from "@/stores/FullscreenStore";

export default function FileControls() {
    const { isFullscreen } = useFullscreenStore();

    return (
        <div className="titlebar-button flex w-fit gap-8">
            {!isFullscreen && (
                <>
                    <button
                        onClick={api.performUndo}
                        className="hover:text-accent focus-visible:text-accent outline-hidden duration-150 ease-out disabled:opacity-50"
                    >
                        <ArrowUUpLeftIcon size={18} />
                    </button>
                    <button
                        onClick={api.performRedo}
                        className="hover:text-accent focus-visible:text-accent outline-hidden duration-150 ease-out disabled:opacity-50"
                    >
                        <ArrowUUpRightIcon size={18} />
                    </button>
                </>
            )}
        </div>
    );
}
