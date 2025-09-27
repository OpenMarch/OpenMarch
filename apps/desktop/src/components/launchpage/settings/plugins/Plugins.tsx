import Plugin, { PluginMetadata } from "@/global/classes/Plugin";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    Badge,
    Button,
    Tabs,
    TabsList,
    TabContent,
    TabItem,
} from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import { PuzzlePieceIcon } from "@phosphor-icons/react";

// eslint-disable-next-line max-lines-per-function
export default function PluginsContents() {
    const { t } = useTranslate();

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
        void fetchOfficialPlugins();
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
        void fetchCommunityPlugins();
    }, []);

    return (
        <div className="text-text flex flex-col gap-16">
            {showRefreshNotice && (
                <div className="bg-fg-1 rounded-6 text-body border-yellow flex w-full items-center gap-8 border px-12 py-8">
                    <PuzzlePieceIcon size={20} />
                    <p>
                        <T
                            keyName="settings.plugins.refreshNotice"
                            params={{
                                a: (content) => (
                                    <strong
                                        className="cursor-pointer"
                                        onClick={() => {
                                            window.location.reload();
                                        }}
                                    >
                                        {content}
                                    </strong>
                                ),
                            }}
                        />
                    </p>
                </div>
            )}
            <Tabs defaultValue="installed">
                <TabsList className="flex flex-row gap-4">
                    <TabItem value="installed">
                        <T keyName="settings.plugins.installed" />
                    </TabItem>
                    <TabItem value="official">
                        <T keyName="settings.plugins.official" />
                    </TabItem>
                    <TabItem value="community">
                        <T keyName="settings.plugins.community" />
                    </TabItem>
                </TabsList>
                <TabContent
                    value="installed"
                    className="border-stroke flex flex-col gap-8 rounded-[14px] border p-8"
                >
                    {plugins.length > 0 ? (
                        // eslint-disable-next-line max-lines-per-function
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
                                                    button.textContent = t(
                                                        "settings.plugins.uninstalling",
                                                    );
                                                }

                                                let status =
                                                    await window.plugins.uninstall(
                                                        plugin.file,
                                                    );
                                                if (button) {
                                                    button.textContent = status
                                                        ? t(
                                                              "settings.plugins.uninstalled",
                                                          )
                                                        : t(
                                                              "settings.plugins.uninstallFailed",
                                                          );
                                                }
                                                if (status) {
                                                    toast.success(
                                                        t(
                                                            "settings.plugins.toast.uninstallSuccess",
                                                            {
                                                                pluginName:
                                                                    plugin.name,
                                                            },
                                                        ),
                                                    );
                                                    Plugin.remove(plugin);
                                                    setPlugins([
                                                        ...Plugin.getPlugins(),
                                                    ]);
                                                    setShowRefreshNotice(true);
                                                } else {
                                                    toast.error(
                                                        t(
                                                            "settings.plugins.toast.uninstallFailed",
                                                            {
                                                                pluginName:
                                                                    plugin.name,
                                                            },
                                                        ),
                                                    );
                                                }
                                            }}
                                        >
                                            <T keyName="settings.plugins.uninstall" />
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
                        <p className="text-body p-8">
                            <T keyName="settings.plugins.noPlugins" />
                        </p>
                    )}
                </TabContent>
                <TabContent
                    value="official"
                    className="border-stroke flex flex-col gap-8 rounded-[14px] border p-8"
                >
                    {officialPlugins.length > 0 ? (
                        // eslint-disable-next-line max-lines-per-function
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
                                            t("settings.plugins.installed")
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
                                                        button.textContent = t(
                                                            "settings.plugins.installing",
                                                        );
                                                    }

                                                    let status =
                                                        await window.plugins.install(
                                                            plugin.download_url ||
                                                                "",
                                                        );
                                                    if (button) {
                                                        button.textContent =
                                                            status
                                                                ? t(
                                                                      "settings.plugins.installed",
                                                                  )
                                                                : t(
                                                                      "settings.plugins.installFailed",
                                                                  );
                                                    }
                                                    if (status) {
                                                        toast.success(
                                                            t(
                                                                "settings.plugins.toast.installSuccess",
                                                                {
                                                                    pluginName:
                                                                        plugin.name,
                                                                },
                                                            ),
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
                                                            t(
                                                                "settings.plugins.toast.installFailed",
                                                                {
                                                                    pluginName:
                                                                        plugin.name,
                                                                },
                                                            ),
                                                        );
                                                    }
                                                }}
                                            >
                                                <T keyName="settings.plugins.install" />
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
                            <T keyName="settings.plugins.noOfficialPlugins" />
                        </p>
                    )}
                </TabContent>
                <TabContent
                    value="community"
                    className="border-stroke flex flex-col gap-8 rounded-[14px] border p-8"
                >
                    {communityPlugins.length > 0 ? (
                        // eslint-disable-next-line max-lines-per-function
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
                                            t("settings.plugins.installed")
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
                                                        button.textContent = t(
                                                            "settings.plugins.installing",
                                                        );
                                                    }

                                                    let status =
                                                        await window.plugins.install(
                                                            plugin.download_url ||
                                                                "",
                                                        );
                                                    if (button) {
                                                        button.textContent =
                                                            status
                                                                ? t(
                                                                      "settings.plugins.installed",
                                                                  )
                                                                : t(
                                                                      "settings.plugins.installFailed",
                                                                  );
                                                    }
                                                    if (status) {
                                                        toast.success(
                                                            t(
                                                                "settings.plugins.toast.installSuccess",
                                                                {
                                                                    pluginName:
                                                                        plugin.name,
                                                                },
                                                            ),
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
                                                            t(
                                                                "settings.plugins.toast.installFailed",
                                                                {
                                                                    pluginName:
                                                                        plugin.name,
                                                                },
                                                            ),
                                                        );
                                                    }
                                                }}
                                            >
                                                <T keyName="settings.plugins.install" />
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
                            <T keyName="settings.plugins.noCommunityPlugins" />
                        </p>
                    )}
                </TabContent>
            </Tabs>
        </div>
    );
}
