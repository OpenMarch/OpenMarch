export default function Nav() {
    return (
        <nav className="sticky top-0 flex w-full items-center justify-between border-b border-stroke bg-modal px-64 py-16 shadow-modal backdrop-blur-md">
            <a href="/">
                <img
                    src="/textmark.svg"
                    alt="Logo"
                    className="fill-black dark:fill-white"
                />
            </a>
            <div className="flex gap-24">
                <a
                    href="/"
                    className="text-body text-text duration-150 ease-out hover:text-accent"
                >
                    Home
                </a>
                <a
                    href="/docs"
                    className="text-body text-text duration-150 ease-out hover:text-accent"
                >
                    Docs
                </a>
                <a
                    href="/blog"
                    className="text-body text-text duration-150 ease-out hover:text-accent"
                >
                    Blog
                </a>
            </div>
        </nav>
    );
}
