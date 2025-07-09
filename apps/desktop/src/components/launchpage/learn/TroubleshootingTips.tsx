export default function TroubleshootingTips() {
    return (
        <div className="flex flex-col gap-8">
            <h4 className="text-h4">Troubleshooting Tips</h4>
            <p className="text-body leading-[180%]">
                OpenMarch is still under development, so here are some tips when
                something goes wrong.
            </p>
            <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-12 border p-16">
                <h5 className="text-h5">Refresh the page</h5>
                <p className="text-body leading-[180%]">
                    When in doubt, refresh the page (Ctrl/Cmd + R). If OpenMarch
                    ever seems broken, refreshing will often fix it.
                </p>
                <h5 className="text-h5">Clear the cache</h5>
                <p className="text-body leading-[180%]">
                    Deleting the cache and metadata folder can often fix
                    performance issues. (this will also delete your recent files
                    list and theme!)
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
