import { T } from "@tolgee/react";

/** The guides on the website, with the keys of their titles and descriptions. */
const GUIDES = [
    {
        titleKey: "launchpage.learn.guides.gettingStarted.title",
        descriptionKey: "launchpage.learn.guides.gettingStarted.description",
        link: "https://openmarch.com/guides/getting-started/",
    },
    {
        titleKey: "launchpage.learn.guides.music.title",
        descriptionKey: "launchpage.learn.guides.music.description",
        link: "https://openmarch.com/guides/music/",
    },
    {
        titleKey: "launchpage.learn.guides.customizeField.title",
        descriptionKey: "launchpage.learn.guides.customizeField.description",
        link: "https://openmarch.com/guides/editing-the-grid/",
    },
] as const;

export default function Guides() {
    return (
        <div className="flex flex-col gap-8">
            <h4 className="text-h4">
                <T keyName="launchpage.learn.guides.title" />
            </h4>
            <div className="grid grid-cols-2 gap-8">
                {GUIDES.map((guide) => (
                    <a
                        key={guide.link}
                        href={guide.link}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-fg-1 border-stroke rounded-6 hover:border-accent flex flex-col overflow-clip border duration-150"
                    >
                        <div className="relative h-64">
                            <div
                                aria-hidden="true"
                                className="bg-accent absolute top-[-15%] right-[5%] -z-10 h-[3rem] w-[7rem] rounded-full text-transparent opacity-75 blur-2xl"
                            />
                        </div>
                        <div className="flex flex-col gap-6 p-8">
                            <h5 className="text-h5">
                                <T keyName={guide.titleKey} />
                            </h5>
                            <p className="text-body text-text-subtitle">
                                <T keyName={guide.descriptionKey} />
                            </p>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}
