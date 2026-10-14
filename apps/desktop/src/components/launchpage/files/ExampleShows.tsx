import { FileDottedIcon } from "@phosphor-icons/react";
import { T, useTolgee } from "@tolgee/react";
import { toast } from "sonner";
import { webExampleShows } from "@/utilities/webBuild";
import { OPEN_STOPPED_STATUS } from "@om-electron/database/convertOnOpenGate";

/**
 * The example shows a preview web build offers on the start page, so a
 * tester can open one without a `.dots` file of their own. Renders nothing
 * in other builds.
 */
export default function ExampleShows() {
    const { t } = useTolgee();
    if (webExampleShows.length === 0) return null;

    const open = async (file: string) => {
        const status = await window.electron.openRecentFile(file);
        // 0: the person cancelled; 200: the page reloads into the show.
        if (![0, 200, OPEN_STOPPED_STATUS].includes(status))
            toast.error(t("launchpage.files.failedToOpen"));
    };

    return (
        <div className="flex w-full flex-col items-center gap-12">
            <h4 className="text-h5 text-text-subtitle">
                <T keyName="welcome.examples" />
            </h4>
            <div className="flex flex-wrap justify-center gap-12">
                {webExampleShows.map((show) => (
                    <button
                        key={show.id}
                        type="button"
                        onClick={() => void open(show.file)}
                        className="bg-fg-1 border-stroke rounded-16 hover:border-accent text-body flex cursor-pointer items-center gap-8 border px-16 py-12 transition-colors"
                    >
                        <FileDottedIcon size={20} className="text-accent" />
                        {show.name}
                    </button>
                ))}
            </div>
        </div>
    );
}
