import Shortcut from "@/components/ui/Shortcut";
import { T } from "@tolgee/react";

/** Where each system keeps OpenMarch's cache; the system names are the same in every language. */
const CACHE_FOLDERS = [
    { system: "Windows", folder: "%APPDATA%\\OpenMarch" },
    { system: "macOS", folder: "~/Library/Application Support/OpenMarch" },
    { system: "Linux", folder: "~/.config/OpenMarch" },
] as const;

export default function TroubleshootingTips() {
    return (
        <div className="flex flex-col gap-8">
            <h4 className="text-h4">
                <T keyName="launchpage.learn.troubleshooting.title" />
            </h4>
            <p className="text-body leading-[180%]">
                <T keyName="launchpage.learn.troubleshooting.description" />
            </p>
            <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-12 border p-16">
                <h5 className="text-h5">
                    <T keyName="launchpage.learn.troubleshooting.refresh" />
                </h5>
                <p className="text-body leading-[180%]">
                    <T
                        keyName="launchpage.learn.troubleshooting.refreshHint"
                        params={{ keys: () => <Shortcut binding="$mod+R" /> }}
                    />
                </p>
                <h5 className="text-h5">
                    <T keyName="launchpage.learn.troubleshooting.clearCache" />
                </h5>
                <p className="text-body leading-[180%]">
                    <T keyName="launchpage.learn.troubleshooting.clearCache.description" />
                </p>
                <ul className="text-body ml-20 w-full list-disc leading-[180%]">
                    {CACHE_FOLDERS.map(({ system, folder }) => (
                        <li key={system}>
                            <T
                                keyName="launchpage.learn.troubleshooting.cacheFolder"
                                params={{
                                    system,
                                    folder: () => (
                                        <code className="bg-fg-2 rounded-6 ml-6 p-2 px-6 font-mono">
                                            {folder}
                                        </code>
                                    ),
                                }}
                            />
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
