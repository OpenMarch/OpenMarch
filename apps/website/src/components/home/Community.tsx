import { Button } from "@openmarch/ui";
import { useEffect, useState } from "react";
import { fetchFromGitHub } from "@/utils/gitHubApi.js";
import { CircleNotchIcon } from "@phosphor-icons/react";
import patreonMembers from "@/content/patreonMembers.json";

interface GitHubStats {
    contributors: Array<{ login: string; id: number }>;
    contributorsCount: number;
    pullRequestsCount: number;
    commitsCount: number;
}

export default function Community() {
    const [stats, setStats] = useState<GitHubStats>({
        contributors: [],
        contributorsCount: 0,
        pullRequestsCount: 0,
        commitsCount: 0,
    });
    const [loading, setLoading] = useState(true);

    async function getMergedPRCount() {
        let mergedCount = 0;
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const prs = await fetchFromGitHub(
                `/repos/OpenMarch/OpenMarch/pulls?state=closed&per_page=100&page=${page}`,
                600,
            );

            if (!prs.length) break;

            mergedCount += prs.filter((pr: any) => pr.merged_at).length;

            if (prs.length < 100) {
                hasMore = false;
            } else {
                page++;
            }
        }

        return mergedCount;
    }

    async function loadGitHubData() {
        try {
            const contributors = await fetchFromGitHub(
                "/repos/OpenMarch/OpenMarch/contributors?per_page=100",
                600,
            );
            const commitCount = await fetchFromGitHub(
                "/repos/OpenMarch/OpenMarch/stats/commit_activity",
                600,
            );
            const totalCommits = commitCount.reduce(
                (sum: number, week: { total: number }) => sum + week.total,
                0,
            );
            const pullRequestCount = await getMergedPRCount();

            console.log("Commit count:", totalCommits);
            console.log("Pull request count:", pullRequestCount);

            setStats({
                contributors: contributors.map((contributor: any) => ({
                    login: contributor.login,
                    id: contributor.id,
                })),
                contributorsCount: contributors.length,
                pullRequestsCount: pullRequestCount,
                commitsCount: totalCommits,
            });
        } catch (error) {
            console.error("Error fetching GitHub data:", error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadGitHubData();
    }, []);

    return (
        <section id="community" className="grid grid-cols-3 gap-8">
            <div className="border-stroke rounded-6 relative flex flex-col items-center justify-center gap-8 overflow-clip border p-12 py-32">
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

                <div className="bg-accent intersect:motion-preset-fade-lg absolute -top-1/5 left-1/2 -z-50 size-[200px] -translate-x-1/2 rounded-full opacity-40 blur-[7vmin]"></div>
            </div>

            <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-12 border p-12">
                <div
                    id="pfp-grid"
                    className="flex h-full w-full flex-wrap items-center justify-center gap-12"
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
                    className="grid h-fit grid-cols-5 justify-between gap-y-16"
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
                    <p className="text-sub font-mono">
                        <span className="text-accent">
                            {loading ? "0" : stats.contributorsCount}
                        </span>{" "}
                        contributors
                    </p>
                    <p className="text-sub font-mono">
                        <span className="text-accent">
                            {loading ? "0" : stats.pullRequestsCount}
                        </span>{" "}
                        PRs merged
                    </p>
                    <p className="text-sub font-mono">
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
