import Plugin, { PluginMetadata } from "@/global/classes/Plugin";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import * as Tabs from "@radix-ui/react-tabs";
import { Badge, Button, TabItem } from "@openmarch/ui";
import { PuzzlePieceIcon } from "@phosphor-icons/react";

export default function PluginsContents() {
    const [plugins, setPlugins] = useState<Plugin[]>([]);
    const [officialPlugins, setOfficialPlugins] = useState<PluginMetadata[]>(
        [],
    );
    const [communityPlugins, setCommunityPlugins] = useState<PluginMetadata[]>(
        [],
    );
    const [showRefreshNotice, setShowRefreshNotice] = useState(false);

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
        <div className="text-text flex flex-col gap-16">
            {showRefreshNotice && (
                <div className="bg-fg-1 rounded-6 text-body border-yellow flex w-full items-center gap-8 border px-12 py-8">
                    <PuzzlePieceIcon size={20} />
                    <p>
                        Please{" "}
                        <strong
                            className="cursor-pointer"
                            onClick={() => {
                                window.location.reload();
                            }}
                        >
                            reload the app
                        </strong>{" "}
                        to update plugins.
                    </p>
                </div>
            )}
            <Tabs.Root defaultValue="installed">
                <Tabs.List className="flex flex-row gap-4">
                    <TabItem value="installed">Installed</TabItem>
                    <TabItem value="official">Official</TabItem>
                    <TabItem value="community">Community</TabItem>
                </Tabs.List>
                <Tabs.Content
                    value="installed"
                    className="border-stroke flex flex-col gap-8 rounded-[14px] border p-8"
                >
                    {plugins.length > 0 ? (
                        plugins.map((plugin, index) => (
                            <div
                                className="bg-fg-1 rounded-6 border-stroke flex flex-col gap-6 border p-12"
                                key={index}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex gap-8">
                                        <h5 className="text-h5">
                                            {plugin.name}
                                        </h5>
                                        <Badge variant="secondary">
                                            v{plugin.version}
                                        </Badge>
                                    </div>
                                    <div className="text-text">
                                        <Button
                                            data-plugin={plugin.name}
                                            size="compact"
                                            variant="secondary"
                                            onClick={async () => {
                                                const button =
                                                    document.querySelector(
                                                        `button[data-plugin="${plugin.name}"]`,
                                                    );
                                                if (button) {
                                                    button.textContent =
                                                        "Removing...";
                                                }

                                                let status =
                                                    await window.plugins.uninstall(
                                                        plugin.file,
                                                    );
                                                if (button) {
                                                    button.textContent = status
                                                        ? "Removed"
                                                        : "Removal Failed";
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
                                            Uninstall
                                        </Button>
                                    </div>
                                </div>
                                <p className="text-text-subtitle text-sub">
                                    {plugin.author}
                                </p>
                                <p className="text-text text-body w-full">
                                    {plugin.description}
                                </p>
                            </div>
                        ))
                    ) : (
                        <p className="text-body p-8">No plugins installed.</p>
                    )}
                </Tabs.Content>
                <Tabs.Content
                    value="official"
                    className="border-stroke flex flex-col gap-8 rounded-[14px] border p-8"
                >
                    {officialPlugins.length > 0 ? (
                        officialPlugins.map((plugin, index) => (
                            <div
                                className="bg-fg-1 rounded-6 border-stroke flex flex-col gap-6 border p-12"
                                key={index}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex gap-8">
                                        <h5 className="text-h5">
                                            {plugin.name}
                                        </h5>
                                        <Badge variant="secondary">
                                            v{plugin.version}
                                        </Badge>
                                    </div>
                                    <div className="text-text">
                                        {plugins.some((p) =>
                                            p.equals(plugin),
                                        ) ? (
                                            "Installed"
                                        ) : (
                                            <Button
                                                data-plugin={plugin.name}
                                                variant="primary"
                                                size="compact"
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
                                                            plugin.download_url ||
                                                                "",
                                                        );
                                                    if (button) {
                                                        button.textContent =
                                                            status
                                                                ? "Installed"
                                                                : "Install Failed";
                                                    }
                                                    if (status) {
                                                        toast.success(
                                                            `Plugin ${plugin.name} installed successfully!`,
                                                        );
                                                        let path =
                                                            plugin.download_url
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
                                                        setShowRefreshNotice(
                                                            true,
                                                        );
                                                    } else {
                                                        toast.error(
                                                            `Failed to install plugin ${plugin.name}.`,
                                                        );
                                                    }
                                                }}
                                            >
                                                Install
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <p className="text-text-subtitle text-sub">
                                    {plugin.author}
                                </p>
                                <p className="text-text text-body w-full">
                                    {plugin.description}
                                </p>
                            </div>
                        ))
                    ) : (
                        <p className="text-body p-8">
                            No official plugins available.
                        </p>
                    )}
                </Tabs.Content>
                <Tabs.Content
                    value="community"
                    className="border-stroke flex flex-col gap-8 rounded-[14px] border p-8"
                >
                    {communityPlugins.length > 0 ? (
                        communityPlugins.map((plugin, index) => (
                            <div
                                className="bg-fg-1 rounded-6 border-stroke flex flex-col gap-6 border p-12"
                                key={index}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex gap-8">
                                        <h5 className="text-h5">
                                            {plugin.name}
                                        </h5>
                                        <Badge variant="secondary">
                                            v{plugin.version}
                                        </Badge>
                                    </div>
                                    <div className="text-text">
                                        {plugins.some((p) =>
                                            p.equals(plugin),
                                        ) ? (
                                            "Installed"
                                        ) : (
                                            <Button
                                                data-plugin={plugin.name}
                                                variant="primary"
                                                size="compact"
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
                                                            plugin.download_url ||
                                                                "",
                                                        );
                                                    if (button) {
                                                        button.textContent =
                                                            status
                                                                ? "Installed"
                                                                : "Install Failed";
                                                    }
                                                    if (status) {
                                                        toast.success(
                                                            `Plugin ${plugin.name} installed successfully!`,
                                                        );
                                                        let path =
                                                            plugin.download_url
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
                                                        setShowRefreshNotice(
                                                            true,
                                                        );
                                                    } else {
                                                        toast.error(
                                                            `Failed to install plugin ${plugin.name}.`,
                                                        );
                                                    }
                                                }}
                                            >
                                                Install
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <p className="text-text-subtitle text-sub">
                                    {plugin.author}
                                </p>
                                <p className="text-text text-body w-full">
                                    {plugin.description}
                                </p>
                            </div>
                        ))
                    ) : (
                        <p className="text-body p-8">
                            No community plugins available.
                        </p>
                    )}
                </Tabs.Content>
            </Tabs.Root>
        </div>
    );
}
