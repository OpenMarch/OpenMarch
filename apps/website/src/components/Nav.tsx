import { Button } from "./ui/Button.tsx";
import { LogoTextMark } from "./LogoTextMark.tsx";
import React, { useState } from "react";
import { LogoGitHub, LogoDiscord, LogoPatreon } from "./Logos.tsx";

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
            href="/guides"
            className="text-body text-text duration-150 ease-out hover:text-accent"
          >
            Guides
          </a>
          <a
            href="/blog"
            className="text-body text-text duration-150 ease-out hover:text-accent"
          >
            Blog
          </a>
          <a
            href="/about"
            className="text-body text-text duration-150 ease-out hover:text-accent"
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
        className={`${isOpen ? "flex" : "hidden"} z-[99] m-12 animate-scale-in flex-col items-center gap-32 rounded-6 border border-stroke bg-modal p-32 backdrop-blur-32`}
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
        <a
          href="https://www.patreon.com/openmarch"
          className="flex items-center gap-8 text-h4 text-text"
        >
          <LogoPatreon />
          Donate
        </a>
        <a href="https://store.openmarch.com" className="text-h4 text-text">
          Merch
        </a>
        <a href="/download" className="text-h4 text-text">
          Download
        </a>
      </div>
    </nav>
  );
}
