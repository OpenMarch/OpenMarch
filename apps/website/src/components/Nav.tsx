import { Button } from "@openmarch/ui";
import { LogoTextMark } from "./LogoTextMark.tsx";
import React, { useState } from "react";
import { LogoGitHub, LogoDiscord, LogoPatreon } from "./Logos.tsx";

export default function Nav() {
    const [isOpen, setIsOpen] = useState<boolean>(false);

    return (
        <nav className="sticky top-0 z-[99] flex h-[4rem] w-full flex-col">
            <nav className="border-stroke bg-modal flex w-full items-center justify-between border-b px-64 py-16 backdrop-blur-md max-[750px]:px-24">
                <a href="/">
                    <LogoTextMark />
                </a>
                <div className="flex items-center gap-16 max-[675px]:hidden">
                    <a
                        href="/"
                        className="text-body text-text hover:text-accent duration-150 ease-out"
                    >
                        Home
                    </a>
                    <a
                        href="/guides"
                        className="text-body text-text hover:text-accent duration-150 ease-out"
                    >
                        Guides
                    </a>
                    <a
                        href="/blog"
                        className="text-body text-text hover:text-accent duration-150 ease-out"
                    >
                        Blog
                    </a>
                    <a
                        href="/about"
                        className="text-body text-text hover:text-accent duration-150 ease-out"
                    >
                        About
                    </a>
                    <a href="https://github.com/OpenMarch/OpenMarch">
                        <Button
                            variant="secondary"
                            size="compact"
                            className="items-center gap-6"
                        >
                            <LogoGitHub />
                            Star
                        </Button>
                    </a>
                    <a href="https://discord.gg/eTsQ98uZzq">
                        <Button
                            variant="secondary"
                            size="compact"
                            className="items-center gap-6"
                        >
                            <LogoDiscord />
                            Discord
                        </Button>
                    </a>
                    <a href="https://www.patreon.com/openmarch">
                        <Button
                            variant="secondary"
                            size="compact"
                            className="items-center gap-6"
                        >
                            <LogoPatreon />
                            Donate
                        </Button>
                    </a>
                    <a href="https://store.openmarch.com">
                        <Button variant="secondary" size="compact">
                            Merch
                        </Button>
                    </a>
                    <a href="/download">
                        <Button variant="primary" size="compact">
                            Download
                        </Button>
                    </a>
                </div>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="h-fit min-[675px]:hidden"
                >
                    {isOpen ? (
                        <i className="ph ph-x text-[1.5rem]"></i>
                    ) : (
                        <i className="ph ph-list text-[1.5rem]"></i>
                    )}
                </button>
            </nav>
            <div
                id="mobile"
                className={`${isOpen ? "flex" : "hidden"} animate-scale-in rounded-6 border-stroke bg-modal backdrop-blur-32 z-[99] m-12 flex-col items-center gap-32 border p-32`}
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
                <a
                    href="https://github.com/OpenMarch/OpenMarch"
                    className="text-h4 text-text flex items-center gap-8"
                >
                    <LogoGitHub />
                    Star
                </a>
                <a
                    href="https://discord.gg/eTsQ98uZzq"
                    className="text-h4 text-text flex items-center gap-8"
                >
                    <LogoDiscord />
                    Discord
                </a>
                <a
                    href="https://www.patreon.com/openmarch"
                    className="text-h4 text-text flex items-center gap-8"
                >
                    <LogoPatreon />
                    Donate
                </a>
                <a
                    href="https://store.openmarch.com"
                    className="text-h4 text-text"
                >
                    Merch
                </a>
                <a href="/download" className="text-h4 text-text">
                    Download
                </a>
            </div>
        </nav>
    );
}
