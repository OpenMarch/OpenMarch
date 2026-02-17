import { BugBeetleIcon } from "@phosphor-icons/react/dist/ssr";
import { T } from "@tolgee/react";

export default function BugReport() {
    const handleClick = () => {
        const url = "https://openmarch.com/guides/submitting-feedback/";
        if (window.electron?.openExternal) {
            // recommended way to open external links in the default browser in electron
            void window.electron.openExternal(url);
        } else {
            // This is a fallback for when the electron.openExternal function is not available
            window.open(url, "_blank");
        }
    };

    return (
        <div
            className="hover:text-accent text-sub flex cursor-pointer items-center gap-4 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-5"
            onClick={handleClick}
        >
            <BugBeetleIcon size={16} />
            <T keyName="titlebar.bugReport" />
        </div>
    );
}
