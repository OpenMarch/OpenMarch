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
            // console.log("raw Pull request count:", prs);

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

    useEffect(() => {
        async function loadGitHubData() {
            try {
                const contributors = await fetchFromGitHub(
                    "/repos/OpenMarch/OpenMarch/contributors?per_page=100",
                    600,
                );
                // console.log("Contributors:", contributors);
                const commitCount = await fetchFromGitHub(
                    "/repos/OpenMarch/OpenMarch/stats/commit_activity",
                    900,
                );
                console.log("Commit count:", commitCount);
                const totalCommits = commitCount.reduce(
                    (sum: number, week: { total: number }) => sum + week.total,
                    0,
                );
                const pullRequestCount = await getMergedPRCount();
                // console.log(" Pull request count:", pullRequestCount);

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
        void loadGitHubData();
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

                <div className="bg-accent intersect:motion-preset-fade-lg absolute -top-1/5 left-1/2 -z-50 size-[250px] -translate-x-1/2 rounded-full opacity-40 blur-[9vmin] max-[850px]:top-[70%] max-[850px]:size-[150px] max-[850px]:blur-[15vmin]"></div>
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
