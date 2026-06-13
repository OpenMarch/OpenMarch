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
} from "@phosphor-icons/react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogTitle,
} from "@openmarch/ui";
import { LogoOpenMarchText } from "./Logos";
import clsx from "clsx";

const primaryLinks = [
    { href: "/", label: "Home" },
    { href: "/#desktop", label: "Desktop" },
    { href: "/mobile", label: "Mobile" },
    { href: "/guides", label: "Guides" },
];

const companyLinks = [
    { href: "/about", label: "About" },
    { href: "/blog", label: "Blog" },
];

const socialLinks = [
    {
        href: "https://store.openmarch.com",
        label: "Merch",
        Icon: TShirtIcon,
    },
    {
        href: "https://www.patreon.com/openmarch",
        label: "Patreon",
        Icon: PatreonLogoIcon,
    },
    {
        href: "https://discord.gg/eTsQ98uZzq",
        label: "Discord",
        Icon: DiscordLogoIcon,
    },
    {
        href: "https://github.com/OpenMarch/OpenMarch",
        label: "GitHub",
        Icon: GithubLogoIcon,
    },
];

export default function Nav({ pathname }: { pathname: string }) {
    const [isOpen, setIsOpen] = useState<boolean>(false);

    const linkClassName = (href: string) =>
        clsx("text-body text-text hover:text-accent duration-150 ease-out", {
            "text-accent!": pathname === href,
        });

    return (
        <nav className="sticky top-8 z-99 flex h-56 w-full min-w-full flex-col gap-8">
            <nav className="border-stroke bg-modal shadow-modal relative flex w-full min-w-full items-center justify-between rounded-full border px-32 py-12 pr-17 backdrop-blur-md max-[750px]:px-24 max-[520px]:px-16 max-[520px]:pr-12">
                <a href="/">
                    <LogoOpenMarchText />
                </a>
                <div className="flex items-center gap-16 max-[850px]:hidden">
                    {primaryLinks.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className={linkClassName(link.href)}
                        >
                            {link.label}
                        </a>
                    ))}
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
                                {companyLinks.map((link) => (
                                    <a
                                        key={link.href}
                                        href={link.href}
                                        className={linkClassName(link.href)}
                                    >
                                        {link.label}
                                    </a>
                                ))}
                                <div className="flex items-center gap-16">
                                    {socialLinks.map(
                                        ({ href, label, Icon }) => (
                                            <a
                                                key={href}
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-text hover:text-accent duration-150"
                                                aria-label={label}
                                            >
                                                <Icon size={24} />
                                            </a>
                                        ),
                                    )}
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
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <ListIcon
                            className="text-text active:text-accent mr-6 hidden duration-150 max-[850px]:flex"
                            size={20}
                        />
                    </DialogTrigger>
                    <DialogContent
                        className="h-[calc(100dvh-1rem)]! max-h-[calc(100dvh-1rem)]! w-[calc(100vw-1rem)]! max-w-none gap-20 overflow-y-auto p-20"
                        overlayClassName="max-[850px]:block"
                    >
                        <DialogTitle>Menu</DialogTitle>
                        <div className="flex min-h-0 flex-1 flex-col justify-between gap-20">
                            <div className="flex flex-col gap-20">
                                <div className="grid grid-cols-1 gap-32">
                                    {primaryLinks.map((link) => (
                                        <a
                                            key={link.href}
                                            href={link.href}
                                            onClick={() => setIsOpen(false)}
                                            className={clsx(
                                                "text-h3 text-text hover:text-accent leading-none duration-150 ease-out",
                                                {
                                                    "border-accent text-accent!":
                                                        pathname === link.href,
                                                },
                                            )}
                                        >
                                            {link.label}
                                        </a>
                                    ))}
                                </div>
                                <div className="border-stroke flex flex-col gap-24 border-t pt-16">
                                    <p className="text-h4">Us</p>
                                    <div className="grid grid-rows-2 gap-32">
                                        {companyLinks.map((link) => (
                                            <a
                                                key={link.href}
                                                href={link.href}
                                                onClick={() => setIsOpen(false)}
                                                className={clsx(
                                                    "text-h3 text-text hover:text-accent leading-none duration-150 ease-out",
                                                    {
                                                        "text-accent!":
                                                            pathname ===
                                                            link.href,
                                                    },
                                                )}
                                            >
                                                {link.label}
                                            </a>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-4 gap-8">
                                        {socialLinks.map(
                                            ({ href, label, Icon }) => (
                                                <a
                                                    key={href}
                                                    href={href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    aria-label={label}
                                                    className="text-text hover:border-accent rounded-6 border-stroke bg-fg-1 flex h-48 items-center justify-center border duration-150"
                                                >
                                                    <Icon size={24} />
                                                </a>
                                            ),
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-8 max-[420px]:grid-cols-1">
                                <a
                                    href="https://pay.openmarch.com/b/eVq28jcq13RXgAlbOPfbq00"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full"
                                >
                                    <Button
                                        variant="secondary"
                                        className="w-full"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        <HeartIcon size={18} />
                                        Donate
                                    </Button>
                                </a>
                                <a
                                    href="/download"
                                    onClick={() => setIsOpen(false)}
                                    className="w-full"
                                >
                                    <Button
                                        variant="primary"
                                        className="w-full"
                                    >
                                        <ArrowLineDownIcon size={18} />
                                        Download
                                    </Button>
                                </a>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </nav>
        </nav>
    );
}
