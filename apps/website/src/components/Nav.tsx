import { Button } from "@openmarch/ui";
import { useEffect, useState } from "react";
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
import * as Dropdown from "@radix-ui/react-dropdown-menu";
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
    const [interactionsReady, setInteractionsReady] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const enableInteractions = () => setInteractionsReady(true);
        let idleId: number | null = null;
        let timeoutId: number | null = null;

        if (typeof window.requestIdleCallback === "function") {
            idleId = window.requestIdleCallback(enableInteractions);
        } else {
            timeoutId = window.setTimeout(enableInteractions, 0);
        }

        return () => {
            if (
                idleId !== null &&
                typeof window.cancelIdleCallback === "function"
            ) {
                window.cancelIdleCallback(idleId);
            }
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
        };
    }, []);

    return (
        <nav className="sticky top-8 z-99 flex h-56 w-full flex-col gap-8">
            <nav className="border-stroke bg-modal shadow-modal relative flex w-full items-center justify-between rounded-full border px-32 py-12 pr-17 backdrop-blur-md max-[750px]:px-24">
                <a href="/">
                    <LogoOpenMarchText />
                </a>
                <div className="flex items-center gap-16 max-[850px]:hidden">
                    <a
                        href="/"
                        className={clsx(
                            "text-body text-text hover:text-accent duration-150 ease-out",
                            { "text-accent!": pathname === "/" },
                        )}
                    >
                        Home
                    </a>
                    <a
                        href="/desktop"
                        className={clsx(
                            "text-body text-text hover:text-accent duration-150 ease-out",
                            { "text-accent!": pathname === "/desktop" },
                        )}
                    >
                        Desktop
                    </a>
                    <a
                        href="/mobile"
                        className={clsx(
                            "text-body text-text hover:text-accent duration-150 ease-out",
                            { "text-accent!": pathname === "/mobile" },
                        )}
                    >
                        Mobile
                    </a>
                    <a
                        href="/guides"
                        className={clsx(
                            "text-body text-text hover:text-accent duration-150 ease-out",
                        )}
                    >
                        Docs
                    </a>
                    <Dropdown.Root modal={false}>
                        <Dropdown.Trigger asChild>
                            <button
                                className="text-body text-text hover:text-accent duration-150 ease-out"
                                aria-label="More about OpenMarch"
                            >
                                Us
                            </button>
                        </Dropdown.Trigger>
                        <Dropdown.Portal>
                            <Dropdown.Content className="bg-modal rounded-6 border-stroke shadow-modal backdrop-blur-32 z-100 flex flex-col gap-12 border px-16 py-12">
                                <a
                                    href="/about"
                                    className="text-body text-text hover:text-accent duration-150 ease-out"
                                >
                                    About
                                </a>
                                <a
                                    href="/blog"
                                    className="text-body text-text hover:text-accent duration-150 ease-out"
                                >
                                    Blog
                                </a>
                                <div className="flex items-center gap-16">
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
                            </Dropdown.Content>
                        </Dropdown.Portal>
                    </Dropdown.Root>
                    <a href="/download">
                        <Button variant="primary" size="compact">
                            Download
                        </Button>
                    </a>
                </div>
            </nav>
        </nav>
    );
}
