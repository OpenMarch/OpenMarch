import { Button } from "./ui/Button.tsx";
import { LogoTextMark } from "./LogoTextMark.tsx";
import React, { useState } from "react";

export default function Nav() {
    const [isOpen, setIsOpen] = useState<boolean>(false);

    return (
        <nav className="sticky top-0 z-[99] flex h-[4rem] w-full flex-col">
            <nav className="flex w-full items-center justify-between border-b border-stroke bg-modal px-64 py-16 shadow-modal backdrop-blur-md max-[750px]:px-24">
                <a href="/">
                    <LogoTextMark />
                </a>
                <div className="flex items-center gap-16 max-[675px]:hidden">
                    <a
                        href="/"
                        className="text-body text-text duration-150 ease-out hover:text-accent"
                    >
                        Home
                    </a>
                    <a
                        href="/blog"
                        className="text-body text-text duration-150 ease-out hover:text-accent"
                    >
                        Blog
                    </a>
                    <a href="/download">
                        <Button variant="primary" size="compact">
                            Download
                        </Button>
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
                className={`${isOpen ? "flex" : "hidden"} z-[99] m-12 animate-scale-in flex-col items-center gap-32 rounded-6 border border-stroke bg-modal p-32 backdrop-blur-32`}
            >
                <a href="/" className="text-h4 text-text">
                    Home
                </a>
                <a href="/blog" className="text-h4 text-text">
                    Blog
                </a>
                <a href="/download" className="text-h4 text-text">
                    Download
                </a>
                <a
                    href="https://github.com/OpenMarch/OpenMarch"
                    className="flex items-center gap-8 text-h4 text-text"
                >
                    <LogoGitHub />
                    Star
                </a>
                <a
                    href="https://discord.gg/eTsQ98uZzq"
                    className="flex items-center gap-8 text-h4 text-text"
                >
                    <LogoDiscord />
                    Discord
                </a>
            </div>
        </nav>
    );
}

function LogoGitHub() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="fill-black dark:fill-white"
        >
            <g clipPath="url(#clip0_285_2792)">
                <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M9 0C4.0275 0 0 4.0275 0 9C0 12.9825 2.57625 16.3463 6.15375 17.5388C6.60375 17.6175 6.7725 17.3475 6.7725 17.1113C6.7725 16.8975 6.76125 16.1888 6.76125 15.435C4.5 15.8513 3.915 14.8837 3.735 14.3775C3.63375 14.1187 3.195 13.32 2.8125 13.1062C2.4975 12.9375 2.0475 12.5212 2.80125 12.51C3.51 12.4987 4.01625 13.1625 4.185 13.4325C4.995 14.7937 6.28875 14.4113 6.80625 14.175C6.885 13.59 7.12125 13.1962 7.38 12.9712C5.3775 12.7462 3.285 11.97 3.285 8.5275C3.285 7.54875 3.63375 6.73875 4.2075 6.10875C4.1175 5.88375 3.8025 4.96125 4.2975 3.72375C4.2975 3.72375 5.05125 3.4875 6.7725 4.64625C7.4925 4.44375 8.2575 4.3425 9.0225 4.3425C9.7875 4.3425 10.5525 4.44375 11.2725 4.64625C12.9938 3.47625 13.7475 3.72375 13.7475 3.72375C14.2425 4.96125 13.9275 5.88375 13.8375 6.10875C14.4113 6.73875 14.76 7.5375 14.76 8.5275C14.76 11.9812 12.6563 12.7462 10.6538 12.9712C10.98 13.2525 11.2613 13.7925 11.2613 14.6363C11.2613 15.84 11.25 16.8075 11.25 17.1113C11.25 17.3475 11.4188 17.6288 11.8688 17.5388C15.4238 16.3463 18 12.9712 18 9C18 4.0275 13.9725 0 9 0Z"
                    fill="currentColor"
                />
            </g>
            <defs>
                <clipPath id="clip0_285_2792">
                    <rect width="18" height="18" fill="white" />
                </clipPath>
            </defs>
        </svg>
    );
}

function LogoDiscord() {
    return (
        <svg
            width="18"
            height="14"
            viewBox="0 0 18 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="fill-black dark:fill-white"
        >
            <path
                d="M15.2477 1.32141C14.0651 0.77998 12.8166 0.39587 11.5342 0.178894C11.3587 0.49261 11.1999 0.815381 11.0585 1.14586C9.69243 0.940009 8.30325 0.940009 6.93721 1.14586C6.79571 0.815415 6.63693 0.492648 6.46151 0.178894C5.17825 0.397703 3.92895 0.782724 2.74514 1.32424C0.394983 4.80135 -0.242108 8.19209 0.0764374 11.5347C1.45275 12.5516 2.99324 13.3249 4.63094 13.8212C4.9997 13.3252 5.326 12.799 5.60639 12.2482C5.07383 12.0493 4.55982 11.8039 4.07029 11.5149C4.19913 11.4214 4.32513 11.3252 4.44689 11.2317C5.87128 11.9016 7.42593 12.2489 8.99997 12.2489C10.574 12.2489 12.1287 11.9016 13.5531 11.2317C13.6762 11.3322 13.8022 11.4285 13.9296 11.5149C13.4392 11.8044 12.9242 12.0503 12.3907 12.2497C12.6708 12.8002 12.9971 13.3259 13.3662 13.8212C15.0053 13.3269 16.5469 12.5539 17.9235 11.5361C18.2973 7.65977 17.285 4.30017 15.2477 1.32141ZM6.00988 9.47902C5.1222 9.47902 4.38884 8.67345 4.38884 7.68242C4.38884 6.69139 5.09672 5.87874 6.00705 5.87874C6.91739 5.87874 7.64509 6.69139 7.62951 7.68242C7.61394 8.67345 6.91456 9.47902 6.00988 9.47902ZM11.9901 9.47902C11.101 9.47902 10.3704 8.67345 10.3704 7.68242C10.3704 6.69139 11.0783 5.87874 11.9901 5.87874C12.9018 5.87874 13.6238 6.69139 13.6083 7.68242C13.5927 8.67345 12.8947 9.47902 11.9901 9.47902Z"
                fill="currentColor"
            />
        </svg>
    );
}
