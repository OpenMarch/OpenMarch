import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { X } from "@phosphor-icons/react";
import Plugin, { PluginMetadata } from "@/global/classes/Plugin";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Plugins() {
    return (
        <SidebarModalLauncher
            contents={<PluginsContents />}
            buttonLabel="Plugins"
        />
    );
}

function PluginsContents() {
    const { toggleOpen } = useSidebarModalStore();

    const [plugins, setPlugins] = useState<Plugin[]>([]);
    const [officialPlugins, setOfficialPlugins] = useState<PluginMetadata[]>(
        [],
    );
    const [communityPlugins, setCommunityPlugins] = useState<PluginMetadata[]>(
        [],
    );
    const [showRefreshNotice, setShowRefreshNotice] = useState(false);
    const [hoveredPlugin, setHoveredPlugin] = useState<string | null>(null);

    useEffect(() => {
        setPlugins(Plugin.getPlugins());
    }, []);

    useEffect(() => {
        async function fetchOfficialPlugins() {
            const response = await fetch(
                "https://api.github.com/repos/OpenMarch/plugins/contents/official",
            );
            if (!response.ok) {
                console.error(
                    "Failed to fetch official plugins:",
                    response.statusText,
                );
                return;
            }

            let official: PluginMetadata[] = [];

            const data = await response.json();
            for (const plugin of data) {
                try {
                    const response = await fetch(plugin.download_url);
                    const code = await response.text();
                    const metadata = Plugin.getMetadata(code);
                    if (metadata) {
                        metadata.download_url = plugin.download_url;
                        official.push(metadata);
                    }
                } catch (error) {
                    console.error("Error fetching or parsing plugin:", error);
                }
            }
            setOfficialPlugins(official);
        }
        fetchOfficialPlugins();
    }, []);

    useEffect(() => {
        async function fetchCommunityPlugins() {
            const response = await fetch(
                "https://api.github.com/repos/OpenMarch/plugins/contents/community",
            );
            if (!response.ok) {
                console.error(
                    "Failed to fetch community plugins:",
                    response.statusText,
                );
                return;
            }

            let community: PluginMetadata[] = [];

            const data = await response.json();
            for (const plugin of data) {
                try {
                    const response = await fetch(plugin.download_url);
                    const code = await response.text();
                    const metadata = Plugin.getMetadata(code);
                    if (metadata) {
                        metadata.download_url = plugin.download_url;
                        community.push(metadata);
                    }
                } catch (error) {
                    console.error("Error fetching or parsing plugin:", error);
                }
            }
            setCommunityPlugins(community);
        }
        fetchCommunityPlugins();
    }, []);

    return (
        <div className="animate-scale-in text-text w-5rem flex flex-col gap-16">
            {showRefreshNotice && (
                <div className="mb-4 rounded border-l-4 border-yellow-500 bg-yellow-100 p-4 text-yellow-700">
                    Please <strong>refresh the app</strong> to update plugins.
                </div>
            )}
            <div className="flex items-center justify-between">
                <h4 className="text-h4 leading-none">Plugins</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <X size={24} />
                </button>
            </div>
            <h5 className="text-text-subtitle leading-none">
                Installed plugins
            </h5>
            {plugins.length > 0 ? (
                plugins.map((plugin, index) => (
                    <div
                        className="bg-fg-1 rounded-6 border-stroke flex flex-col gap-2 border px-16 py-12"
                        key={index}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex-row">
                                <h3 className="flex gap-8 text-xl">
                                    {plugin.name}{" "}
                                    <span className="bg-bg-1 rounded-6 border-stroke w-fit border p-4 font-mono text-sm">
                                        v{plugin.version}
                                    </span>
                                </h3>
                            </div>
                            <div className="text-text text-lg">
                                <button
                                    data-plugin={plugin.name}
                                    className="text-blue hover:text-accent duration-150 ease-out"
                                    onMouseEnter={() =>
                                        setHoveredPlugin(plugin.name)
                                    }
                                    onMouseLeave={() => setHoveredPlugin(null)}
                                    onClick={async () => {
                                        const button = document.querySelector(
                                            `button[data-plugin="${plugin.name}"]`,
                                        );
                                        if (button) {
                                            button.textContent = "Removing...";
                                        }

                                        let status =
                                            await window.plugins.uninstall(
                                                plugin.file,
                                            );
                                        if (button) {
                                            button.textContent = status
                                                ? "REMOVED"
                                                : "REMOVAL FAILED";
                                        }
                                        if (status) {
                                            toast.success(
                                                `Plugin ${plugin.name} removed successfully!`,
                                            );
                                            Plugin.remove(plugin);
                                            setPlugins([
                                                ...Plugin.getPlugins(),
                                            ]);
                                            setShowRefreshNotice(true);
                                        } else {
                                            toast.error(
                                                `Failed to remove plugin ${plugin.name}.`,
                                            );
                                        }
                                    }}
                                >
                                    {hoveredPlugin === plugin.name
                                        ? "UNINSTALL"
                                        : "INSTALLED"}
                                </button>
                            </div>
                        </div>
                        <p className="text-text-subtitle text-sm">
                            {plugin.author}
                        </p>{" "}
                        {plugin.description}
                    </div>
                ))
            ) : (
                <p className="bg-fg-1 border-stroke rounded-6 border p-8 font-mono">
                    No plugins installed
                </p>
            )}
            <h5 className="text-text-subtitle">Official plugins</h5>
            {officialPlugins.length > 0 ? (
                officialPlugins.map((plugin, index) => (
                    <div
                        className="bg-fg-1 rounded-6 border-stroke flex flex-col gap-2 border px-16 py-12"
                        key={index}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex-row">
                                <h3 className="flex gap-8 text-xl">
                                    {plugin.name}{" "}
                                    <span className="bg-bg-1 rounded-6 border-stroke w-fit border p-4 font-mono text-sm">
                                        v{plugin.version}
                                    </span>
                                </h3>
                            </div>
                            <div className="text-text text-lg">
                                {plugins.some((p) => p.equals(plugin)) ? (
                                    "INSTALLED"
                                ) : (
                                    <button
                                        data-plugin={plugin.name}
                                        className="text-blue hover:text-accent duration-150 ease-out"
                                        onClick={async () => {
                                            const button =
                                                document.querySelector(
                                                    `button[data-plugin="${plugin.name}"]`,
                                                );
                                            if (button) {
                                                button.textContent =
                                                    "Installing...";
                                            }

                                            let status =
                                                await window.plugins.install(
                                                    plugin.download_url || "",
                                                );
                                            if (button) {
                                                button.textContent = status
                                                    ? "INSTALLED"
                                                    : "INSTALL FAILED";
                                            }
                                            if (status) {
                                                toast.success(
                                                    `Plugin ${plugin.name} installed successfully!`,
                                                );
                                                let path = plugin.download_url
                                                    ?.split("/")
                                                    .pop();
                                                new Plugin(
                                                    plugin.name,
                                                    plugin.version,
                                                    plugin.description,
                                                    plugin.author,
                                                    path || "",
                                                );
                                                setPlugins([
                                                    ...Plugin.getPlugins(),
                                                ]);
                                                setShowRefreshNotice(true);
                                            } else {
                                                toast.error(
                                                    `Failed to install plugin ${plugin.name}.`,
                                                );
                                            }
                                        }}
                                    >
                                        INSTALL
                                    </button>
                                )}
                            </div>
                        </div>
                        <p className="text-text-subtitle text-sm">
                            {plugin.author}
                        </p>{" "}
                        {plugin.description}
                    </div>
                ))
            ) : (
                <p className="text-text">No official plugins available.</p>
            )}
            <h5 className="text-text-subtitle">Community plugins</h5>
            {communityPlugins.length > 0 ? (
                communityPlugins.map((plugin, index) => (
                    <div
                        className="bg-fg-1 rounded-6 border-stroke flex flex-col gap-2 border px-16 py-12"
                        key={index}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex-row">
                                <h3 className="flex gap-8 text-xl">
                                    {plugin.name}{" "}
                                    <span className="bg-bg-1 rounded-6 border-stroke w-fit border p-4 font-mono text-sm">
                                        v{plugin.version}
                                    </span>
                                </h3>
                            </div>
                            <div className="text-text text-lg">
                                {plugins.some((p) => p.equals(plugin)) ? (
                                    "INSTALLED"
                                ) : (
                                    <button
                                        data-plugin={plugin.name}
                                        className="text-blue hover:text-accent duration-150 ease-out"
                                        onClick={async () => {
                                            const button =
                                                document.querySelector(
                                                    `button[data-plugin="${plugin.name}"]`,
                                                );
                                            if (button) {
                                                button.textContent =
                                                    "Installing...";
                                            }

                                            let status =
                                                await window.plugins.install(
                                                    plugin.download_url || "",
                                                );
                                            if (button) {
                                                button.textContent = status
                                                    ? "INSTALLED"
                                                    : "INSTALL FAILED";
                                            }
                                            if (status) {
                                                toast.success(
                                                    `Plugin ${plugin.name} installed successfully!`,
                                                );
                                                let path = plugin.download_url
                                                    ?.split("/")
                                                    .pop();
                                                new Plugin(
                                                    plugin.name,
                                                    plugin.version,
                                                    plugin.description,
                                                    plugin.author,
                                                    path || "",
                                                );
                                                setPlugins([
                                                    ...Plugin.getPlugins(),
                                                ]);
                                                setShowRefreshNotice(true);
                                            } else {
                                                toast.error(
                                                    `Failed to install plugin ${plugin.name}.`,
                                                );
                                            }
                                        }}
                                    >
                                        INSTALL
                                    </button>
                                )}
                            </div>
                        </div>
                        <p className="text-text-subtitle text-sm">
                            {plugin.author}
                        </p>{" "}
                        {plugin.description}
                    </div>
                ))
            ) : (
                <p className="bg-fg-1 border-stroke rounded-6 border p-8 font-mono">
                    No community plugins available.
                </p>
            )}
        </div>
    );
}
