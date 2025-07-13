export default function Guides() {
    const guides = [
        {
            title: "Getting Started",
            description: "Beginner guide on how to get started with a show.",
            link: "https://openmarch.com/guides/getting-started/",
        },
        {
            title: "Music",
            description: "Implement your music manually or via tap tempo.",
            link: "https://openmarch.com/guides/music/",
        },
        {
            title: "Customize the Field",
            description:
                "Customize the field to your dimensions, and edit theming.",
            link: "https://openmarch.com/guides/editing-the-grid/",
        },
    ];

    return (
        <div className="flex flex-col gap-8">
            <h4 className="text-h4">Guides</h4>
            <div className="grid grid-cols-2 gap-8">
                {guides.map((guide) => (
                    <a
                        key={guide.link}
                        href={guide.link}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-fg-1 border-stroke rounded-6 hover:border-accent flex flex-col overflow-clip border duration-150"
                    >
                        <div className="relative h-64">
                            <div className="bg-accent absolute top-[-15%] right-[5%] -z-10 h-[3rem] w-[7rem] rounded-full text-transparent opacity-75 blur-2xl">
                                image placeholder
                            </div>
                        </div>
                        <div className="flex flex-col gap-6 p-8">
                            <h5 className="text-h5">{guide.title}</h5>
                            <p className="text-body text-text-subtitle">
                                {guide.description}
                            </p>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}
