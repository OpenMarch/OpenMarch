import React, { useState, useEffect } from "react";
import { fetchFromGitHub } from "@/utils/gitHubApi";
import {
    CircleNotchIcon,
    DownloadSimpleIcon,
    SealWarningIcon,
} from "@phosphor-icons/react";
import { Badge, Button, ListItem } from "@openmarch/ui";
import { ProseClass } from "../ProseClass";
import Markdown from "react-markdown";
import * as Tabs from "@radix-ui/react-tabs";

interface GitHubRelease {
    id: number;
    tag_name: string;
    name: string;
    body: string;
    published_at: string;
    html_url: string;
    prerelease: boolean;
    draft: boolean;
    assets: {
        name: string;
        browser_download_url: string;
        id: number;
    }[];
}

export default function GithubReleases() {
    const [releases, setReleases] = useState<GitHubRelease[]>([]);
    const [latestRelease, setLatestRelease] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedRelease, setSelectedRelease] = useState<string | null>(null);

    useEffect(() => {
        if (latestRelease && !selectedRelease) {
            setSelectedRelease(latestRelease);
        }
    }, [latestRelease, selectedRelease]);

    useEffect(() => {
        const fetchReleases = async () => {
            try {
                setLoading(true);
                setError(null);

                const data = await fetchFromGitHub<GitHubRelease[]>(
                    "repos/OpenMarch/OpenMarch/releases",
                    600, // Cache for 10 minutes
                );

                // Filter out drafts & prereleases and sort by published date
                const publishedReleases = data
                    .filter((release) => !release.draft && !release.prerelease)
                    .sort(
                        (a, b) =>
                            new Date(b.published_at).getTime() -
                            new Date(a.published_at).getTime(),
                    );

                setReleases(publishedReleases);

                // Set the latest release (first one after sorting by date)
                if (publishedReleases.length > 0) {
                    setLatestRelease(publishedReleases[0].tag_name);
                }
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to fetch releases",
                );
                console.error("Error fetching GitHub releases:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchReleases();
    }, []);

    return (
        <section
            id="all-releases"
            className="flex h-[64rem] w-full flex-col gap-12 max-[768px]:h-auto"
        >
            <h1 className="text-h2">All Releases & Changelogs</h1>
            {loading ? (
                <div className="text w-full text-left">
                    <CircleNotchIcon
                        className="text-text animate-spin"
                        size={32}
                    />
                </div>
            ) : error ? (
                <div className="flex w-full flex-col gap-8">
                    <SealWarningIcon size={32} className="text-red" />
                    <p className="text-body text-text">
                        Error loading releases: {error}
                    </p>
                    <Button
                        variant="red"
                        size="compact"
                        onClick={() => window.location.reload()}
                    >
                        Try Again
                    </Button>
                </div>
            ) : releases.length === 0 ? (
                <p>No releases available.</p>
            ) : (
                <Tabs.Root
                    value={selectedRelease}
                    onValueChange={setSelectedRelease}
                    className="flex h-full w-full gap-8 max-[768px]:flex-col"
                >
                    <div
                        id="sidebar"
                        className="bg-fg-1 border-stroke rounded-6 flex h-full w-[256px] flex-col gap-12 border p-12 max-[768px]:h-auto max-[768px]:w-full"
                    >
                        <h2 className="text-h4">Versions</h2>
                        <Tabs.List className="flex flex-col gap-0 max-[768px]:flex-row max-[768px]:gap-2 max-[768px]:overflow-x-auto">
                            {releases.map((release) => (
                                <Tabs.Trigger
                                    value={release.tag_name}
                                    key={release.id}
                                >
                                    <ListItem
                                        selected={
                                            release.tag_name === selectedRelease
                                        }
                                    >
                                        {release.tag_name}
                                        {release.tag_name === latestRelease && (
                                            <Badge>Latest</Badge>
                                        )}
                                    </ListItem>
                                </Tabs.Trigger>
                            ))}
                        </Tabs.List>
                        <a
                            href="https://github.com/OpenMarch/OpenMarch/releases"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Button
                                variant="secondary"
                                className="w-full items-center"
                            >
                                See all releases
                            </Button>
                        </a>
                    </div>
                    {releases.map((release) => (
                        <Tabs.Content
                            value={release.tag_name}
                            key={release.id}
                            className="flex h-full w-full flex-col gap-8 max-[768px]:min-h-[400px]"
                        >
                            <header className="border-stroke rounded-6 flex h-fit w-full flex-col gap-12 border p-12 max-[768px]:p-8">
                                <div className="flex items-end gap-12">
                                    <h1 className="text-h3 text-accent font-mono leading-none">
                                        {release.tag_name}
                                    </h1>
                                    <h3 className="text-h5 text-text-subtitle">
                                        {new Date(
                                            release.published_at,
                                        ).toLocaleDateString("en-US", {
                                            year: "numeric",
                                            month: "long",
                                            day: "numeric",
                                            timeZone: "UTC",
                                        })}
                                    </h3>
                                </div>
                                <div className="flex flex-wrap items-center gap-8 max-[768px]:gap-4">
                                    {release.assets.filter(
                                        (asset) =>
                                            asset.name.endsWith(".exe") ||
                                            asset.name.endsWith("arm64.dmg") ||
                                            asset.name.endsWith("x64.dmg") ||
                                            asset.name.endsWith(".AppImage"),
                                    ).length === 0 ? (
                                        <>
                                            <p className="text-sub text-text-subtitle">
                                                Couldn&apos;t filter assets
                                            </p>
                                            {release.assets.map((asset) => (
                                                <a
                                                    key={asset.id}
                                                    href={
                                                        asset.browser_download_url
                                                    }
                                                >
                                                    <Button
                                                        variant="secondary"
                                                        size="compact"
                                                        className="whitespace-nowrap"
                                                    >
                                                        <DownloadSimpleIcon
                                                            size={18}
                                                        />
                                                        {asset.name}
                                                    </Button>
                                                </a>
                                            ))}
                                        </>
                                    ) : (
                                        release.assets
                                            .filter(
                                                (asset) =>
                                                    asset.name.endsWith(
                                                        ".exe",
                                                    ) ||
                                                    asset.name.endsWith(
                                                        "arm64.dmg",
                                                    ) ||
                                                    asset.name.endsWith(
                                                        "x64.dmg",
                                                    ) ||
                                                    asset.name.endsWith(
                                                        ".AppImage",
                                                    ),
                                            )
                                            .map((asset) => (
                                                <a
                                                    key={asset.id}
                                                    href={
                                                        asset.browser_download_url
                                                    }
                                                >
                                                    <Button
                                                        variant="secondary"
                                                        size="compact"
                                                        className="whitespace-nowrap"
                                                    >
                                                        <DownloadSimpleIcon
                                                            size={18}
                                                        />
                                                        {asset.name.includes(
                                                            "darwin_arm64",
                                                        )
                                                            ? "Apple Silicon"
                                                            : asset.name.includes(
                                                                    "darwin_x64",
                                                                )
                                                              ? "Intel Mac"
                                                              : asset.name.includes(
                                                                      "linux",
                                                                  )
                                                                ? "Linux .AppImage"
                                                                : asset.name.includes(
                                                                        ".exe",
                                                                    )
                                                                  ? "Windows .exe"
                                                                  : asset.name}
                                                    </Button>
                                                </a>
                                            ))
                                    )}
                                </div>
                            </header>
                            <div className="text-text bg-fg-2 border-stroke rounded-6 flex h-full flex-col items-center overflow-y-auto border p-12 max-[768px]:p-8">
                                {release.body ? (
                                    <article className={ProseClass}>
                                        <h3>{release.name}</h3>
                                        <Markdown>{release.body}</Markdown>
                                    </article>
                                ) : (
                                    <p className="text-text">
                                        No description available.
                                    </p>
                                )}
                            </div>
                        </Tabs.Content>
                    ))}
                </Tabs.Root>
            )}
        </section>
    );
}
