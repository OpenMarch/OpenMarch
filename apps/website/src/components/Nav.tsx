import { Button } from "@openmarch/ui";
import { useState } from "react";
import {
    ArrowLineDownIcon,
    DiscordLogoIcon,
    GithubLogoIcon,
    HeartIcon,
    ListIcon,
    PatreonLogoIcon,
    TShirtIcon,
    XIcon,
} from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogTitle,
} from "@openmarch/ui";
import { LogoOpenMarchText } from "./Logos";
import clsx from "clsx";

export default function Nav({ pathname }: { pathname: string }) {
    const [isOpen, setIsOpen] = useState<boolean>(false);

    return (
        <nav className="sticky top-8 z-[99] flex h-[3.5rem] w-full flex-col gap-8">
            <nav className="border-stroke bg-modal shadow-modal relative flex w-full items-center justify-between rounded-full border px-32 py-12 backdrop-blur-md max-[750px]:px-24">
                <a href="/">
                    <LogoOpenMarchText />
                </a>
                <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-16 max-[850px]:hidden">
                    <a
                        href="/"
                        className={clsx(
                            "text-body text-text hover:text-accent duration-150 ease-out",
                            { "!text-accent": pathname === "/" },
                        )}
                    >
                        Home
                    </a>
                    <a
                        href="/guides"
                        className={clsx(
                            "text-body text-text hover:text-accent duration-150 ease-out",
                        )}
                    >
                        Guides
                    </a>
                    <a
                        href="/blog"
                        className={clsx(
                            "text-body text-text hover:text-accent duration-150 ease-out",
                            { "!text-accent": pathname.includes("blog") },
                        )}
                    >
                        Blog
                    </a>
                    <a
                        href="/about"
                        className={clsx(
                            "text-body text-text hover:text-accent duration-150 ease-out",
                            { "!text-accent": pathname.includes("about") },
                        )}
                    >
                        About
                    </a>
                    <a href="/download">
                        <Button variant="primary" size="compact">
                            Download
                        </Button>
                    </a>
                    <Popover.Root>
                        <Popover.Trigger asChild>
                            <Button variant="secondary" size="compact">
                                Donate
                            </Button>
                        </Popover.Trigger>
                        <Popover.Portal>
                            <Popover.Content
                                className="rounded-6 border-stroke bg-modal text-text shadow-modal backdrop-blur-32 z-[99] w-80 border p-16"
                                sideOffset={8}
                            >
                                <div className="flex flex-col gap-12">
                                    <div className="flex items-center gap-8">
                                        <HeartIcon
                                            size={20}
                                            className="text-red"
                                        />
                                        <h3 className="text-h5">
                                            Support OpenMarch
                                        </h3>
                                    </div>
                                    <p className="text-body text-text-subtitle">
                                        Help us continue building the best drill
                                        writing software.
                                    </p>
                                    <div className="flex flex-col gap-8">
                                        <a
                                            href="https://pay.openmarch.com/b/eVq28jcq13RXgAlbOPfbq00"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full"
                                        >
                                            <Button
                                                variant="primary"
                                                size="compact"
                                                className="w-full"
                                            >
                                                Leave a Donation
                                            </Button>
                                        </a>
                                    </div>
                                </div>
                                <Popover.Arrow className="fill-modal" />
                            </Popover.Content>
                        </Popover.Portal>
                    </Popover.Root>
                </div>
                <div className="flex items-center gap-16 max-[850px]:hidden">
                    <a
                        href="https://store.openmarch.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text hover:text-accent duration-150"
                    >
                        <TShirtIcon size={24} />
                    </a>
                    <a
                        href="https://www.patreon.com/openmarch"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text hover:text-accent duration-150"
                    >
                        <PatreonLogoIcon size={24} />
                    </a>
                    <a
                        href="https://discord.gg/eTsQ98uZzq"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text hover:text-accent duration-150"
                    >
                        <DiscordLogoIcon size={24} />
                    </a>
                    <a
                        href="https://github.com/OpenMarch/OpenMarch"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text hover:text-accent duration-150"
                    >
                        <GithubLogoIcon size={24} />
                    </a>
                </div>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="h-fit min-[850px]:hidden"
                >
                    {isOpen ? <XIcon size={24} /> : <ListIcon size={24} />}
                </button>
            </nav>
            <div
                id="mobile"
                className={`${isOpen ? "flex" : "hidden"} animate-scale-in border-stroke bg-modal backdrop-blur-32 z-50 flex-col items-center gap-32 rounded-[28px] border p-32`}
            >
                <a href="/" className="text-h4 text-text">
                    Home
                </a>
                <a href="/guides" className="text-h4 text-text">
                    Guides
                </a>
                <a href="/blog" className="text-h4 text-text">
                    Blog
                </a>
                <a href="/about" className="text-h4 text-text">
                    About
                </a>
                <Dialog>
                    <DialogTrigger className="text-h4 text-text flex items-center gap-8">
                        Donate
                        <HeartIcon size={24} />
                    </DialogTrigger>
                    <DialogContent>
                        <DialogTitle>
                            <HeartIcon size={24} className="text-red" />
                            Support OpenMarch
                        </DialogTitle>
                        <div className="text-body text-text">
                            <div className="flex flex-col gap-16">
                                <p>
                                    OpenMarch is a free, open-source project
                                    built by passionate developers. Your support
                                    helps us continue improving the app and
                                    adding new features.
                                </p>
                                <div className="flex flex-col gap-12">
                                    <a
                                        href="https://pay.openmarch.com/b/eVq28jcq13RXgAlbOPfbq00"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full"
                                    >
                                        <Button
                                            variant="primary"
                                            className="flex w-full items-center gap-8"
                                        >
                                            <HeartIcon size={16} />
                                            Leave a Donation
                                        </Button>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
                <a
                    href="/download"
                    className="text-h4 text-text flex items-center gap-8"
                >
                    Download
                    <ArrowLineDownIcon size={24} />
                </a>
                <a
                    href="https://store.openmarch.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-h4 text-text flex items-center gap-8"
                >
                    Merch
                    <TShirtIcon size={24} />
                </a>
                <a
                    href="https://www.patreon.com/openmarch"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-h4 text-text flex items-center gap-8"
                >
                    Patreon
                    <PatreonLogoIcon size={24} />
                </a>
                <a
                    href="https://discord.gg/eTsQ98uZzq"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-h4 text-text flex items-center gap-8"
                >
                    Discord
                    <DiscordLogoIcon size={24} />
                </a>
                <a
                    href="https://github.com/OpenMarch/OpenMarch"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-h4 text-text flex items-center gap-8"
                >
                    GitHub
                    <GithubLogoIcon size={24} />
                </a>
            </div>
        </nav>
    );
}
