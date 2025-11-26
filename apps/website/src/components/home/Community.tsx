import { Button } from "@openmarch/ui";
import { useEffect, useState } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react";
import patreonMembers from "@/content/patreonMembers.json";
import { fetchFromGitHub, GitHubPendingError } from "@/utils/gitHubApi";

interface GitHubStats {
    contributors: Array<{ login: string; id: number }>;
    contributorsCount: number;
    pullRequestsCount: number;
    commitsCount: number;
}

const GITHUB_REPO = "OpenMarch/OpenMarch";
const CONTRIBUTORS_ENDPOINT = `/repos/${GITHUB_REPO}/contributors?per_page=100`;
const COMMIT_ACTIVITY_ENDPOINT = `/repos/${GITHUB_REPO}/stats/commit_activity`;
const MERGED_PR_ENDPOINT = `/search/issues?q=${encodeURIComponent(
    `repo:${GITHUB_REPO} is:pr is:merged`,
)}&per_page=1`;

function wait(ms: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function fetchMergedPullRequestCount(): Promise<number> {
    const response = await fetchFromGitHub<{ total_count: number }>(
        MERGED_PR_ENDPOINT,
        600,
    );

    return response?.total_count ?? 0;
}

async function fetchCommitCountWithRetry(
    retries = 5,
    delayMs = 1000,
): Promise<number> {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const activity = await fetchFromGitHub<Array<{ total: number }>>(
                COMMIT_ACTIVITY_ENDPOINT,
                900,
                {
                    shouldCache: (data) =>
                        Array.isArray(data) && data.length > 0,
                },
            );

            if (Array.isArray(activity) && activity.length > 0) {
                return activity.reduce((sum, week) => sum + week.total, 0);
            }
        } catch (error) {
            if (error instanceof GitHubPendingError && attempt < retries - 1) {
                await wait(delayMs * (attempt + 1));
                continue;
            }
            throw error;
        }

        await wait(delayMs * (attempt + 1));
    }

    throw new Error("Unable to fetch commit stats from GitHub.");
}

export default function Community() {
    const [stats, setStats] = useState<GitHubStats>({
        contributors: [],
        contributorsCount: 0,
        pullRequestsCount: 0,
        commitsCount: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        async function loadGitHubData() {
            try {
                const [
                    contributorsResult,
                    commitCountResult,
                    pullRequestCountResult,
                ] = await Promise.allSettled([
                    fetchFromGitHub<Array<{ login: string; id: number }>>(
                        CONTRIBUTORS_ENDPOINT,
                        600,
                    ),
                    fetchCommitCountWithRetry(),
                    fetchMergedPullRequestCount(),
                ]);

                const contributors =
                    contributorsResult.status === "fulfilled"
                        ? contributorsResult.value
                        : [];
                if (contributorsResult.status === "rejected") {
                    console.error(
                        "Error fetching contributors:",
                        contributorsResult.reason,
                    );
                }

                const commitsCount =
                    commitCountResult.status === "fulfilled"
                        ? commitCountResult.value
                        : 0;
                if (commitCountResult.status === "rejected") {
                    console.error(
                        "Error fetching commit stats:",
                        commitCountResult.reason,
                    );
                }

                const pullRequestCount =
                    pullRequestCountResult.status === "fulfilled"
                        ? pullRequestCountResult.value
                        : 0;
                if (pullRequestCountResult.status === "rejected") {
                    console.error(
                        "Error fetching merged PR count:",
                        pullRequestCountResult.reason,
                    );
                }

                if (isMounted) {
                    setStats({
                        contributors: contributors.map((contributor) => ({
                            login: contributor.login,
                            id: contributor.id,
                        })),
                        contributorsCount: contributors.length,
                        pullRequestsCount: pullRequestCount,
                        commitsCount,
                    });
                }
            } catch (error) {
                console.error("Error fetching GitHub data:", error);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }
        void loadGitHubData();

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <section
            id="community"
            className="grid grid-cols-3 gap-8 max-[1000px]:grid-cols-2 max-[1000px]:grid-rows-2 max-[645px]:grid-cols-1 max-[645px]:grid-rows-3"
        >
            <div className="border-stroke rounded-6 relative flex flex-col items-center justify-center gap-8 overflow-clip border p-12 py-32 max-[1000px]:col-span-2 max-[645px]:col-span-1">
                <h1 className="text-h3">Join our community</h1>
                <p className="text-body text-text-subtitle text-center">
                    Support OpenMarch via Patreon, buying merch, or contributing
                    code. Join in today!
                </p>
                <a
                    href="https://patreon.com/openmarch"
                    target="_blank"
                    rel="noreferrer"
                >
                    <Button variant="primary">Become a Patron</Button>
                </a>
                <a
                    href="https://github.com/OpenMarch/OpenMarch"
                    target="_blank"
                    rel="noreferrer"
                >
                    <Button variant="primary">Fork the repo</Button>
                </a>
            </div>

            <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-12 border p-12">
                <div className="flex h-full w-full items-center justify-center">
                    <div
                        id="pfp-grid"
                        className="flex h-fit w-full flex-wrap items-center justify-center gap-12 gap-y-16"
                    >
                        {patreonMembers.map((member) => (
                            <p
                                key={member.name}
                                className="text-body text-text w-fit whitespace-nowrap"
                            >
                                {member.name}
                            </p>
                        ))}
                    </div>
                </div>
                <div className="flex h-fit w-full items-end justify-center gap-16">
                    <p className="text-h5 font-mono">
                        <span className="text-accent">
                            {patreonMembers.length}
                        </span>{" "}
                        patreon supporters
                    </p>
                </div>
            </div>

            <div className="bg-fg-1 border-stroke rounded-6 flex flex-col justify-between gap-12 border p-12">
                <div
                    id="pfp-grid"
                    className="grid h-fit grid-cols-5 justify-between gap-y-16 max-[375px]:grid-cols-4"
                >
                    {stats.contributors.length > 0 ? (
                        stats.contributors.map((contributor) => (
                            <a
                                key={contributor.login}
                                href={`https://github.com/${contributor.login}`}
                            >
                                <img
                                    key={contributor.id}
                                    src={`https://avatars.githubusercontent.com/u/${contributor.id}?s=64`}
                                    alt={contributor.login}
                                    className="motion-preset-fade-lg border-stroke size-56 rounded-full border object-cover"
                                />
                            </a>
                        ))
                    ) : (
                        <CircleNotchIcon
                            size={24}
                            className="text-text m-16 animate-spin"
                        />
                    )}
                </div>
                <div className="flex h-fit w-full justify-center gap-16">
                    <p className="text-sub text-center font-mono">
                        <span className="text-accent">
                            {loading ? "0" : stats.contributorsCount}
                        </span>{" "}
                        contributors
                    </p>
                    <p className="text-sub text-center font-mono">
                        <span className="text-accent">
                            {loading ? "0" : stats.pullRequestsCount}
                        </span>{" "}
                        PRs merged
                    </p>
                    <p className="text-sub text-center font-mono">
                        <span className="text-accent">
                            {loading ? "0" : stats.commitsCount}
                        </span>{" "}
                        commits this year
                    </p>
                </div>
            </div>
        </section>
    );
}
