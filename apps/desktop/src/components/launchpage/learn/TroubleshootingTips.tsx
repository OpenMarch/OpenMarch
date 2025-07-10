import { T } from "@tolgee/react";

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
                    <T keyName="launchpage.learn.troubleshooting.refresh.description" />
                </p>
                <h5 className="text-h5">
                    <T keyName="launchpage.learn.troubleshooting.clearCache" />
                </h5>
                <p className="text-body leading-[180%]">
                    <T keyName="launchpage.learn.troubleshooting.clearCache.description" />
                </p>
                <ul className="text-body ml-20 w-full list-disc leading-[180%]">
                    <li>
                        Windows:
                        <code className="bg-fg-2 rounded-6 ml-6 p-2 px-6 font-mono">
                            %APPDATA%\OpenMarch
                        </code>
                    </li>
                    <li>
                        macOS:
                        <code className="bg-fg-2 rounded-6 ml-6 p-2 px-6 font-mono">
                            ~/Library/Application Support/OpenMarch
                        </code>
                    </li>
                    <li>
                        Linux:
                        <code className="bg-fg-2 rounded-6 ml-6 p-2 px-6 font-mono">
                            ~/.config/OpenMarch
                        </code>
                    </li>
                </ul>
            </div>
        </div>
    );
}
