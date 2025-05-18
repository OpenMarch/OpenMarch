export default new Map([
    [
        "src/content/docs/developers/contributing.mdx",
        () =>
            import(
                "astro:content-layer-deferred-module?astro%3Acontent-layer-deferred-module=&fileName=src%2Fcontent%2Fdocs%2Fdevelopers%2Fcontributing.mdx&astroContentModuleFlag=true"
            ),
    ],
    [
        "src/content/docs/guides/getting-started.mdx",
        () =>
            import(
                "astro:content-layer-deferred-module?astro%3Acontent-layer-deferred-module=&fileName=src%2Fcontent%2Fdocs%2Fguides%2Fgetting-started.mdx&astroContentModuleFlag=true"
            ),
    ],
    [
        "src/content/docs/guides/importing-music.mdx",
        () =>
            import(
                "astro:content-layer-deferred-module?astro%3Acontent-layer-deferred-module=&fileName=src%2Fcontent%2Fdocs%2Fguides%2Fimporting-music.mdx&astroContentModuleFlag=true"
            ),
    ],
    [
        "src/content/docs/guides/index.mdx",
        () =>
            import(
                "astro:content-layer-deferred-module?astro%3Acontent-layer-deferred-module=&fileName=src%2Fcontent%2Fdocs%2Fguides%2Findex.mdx&astroContentModuleFlag=true"
            ),
    ],
    [
        "src/content/docs/guides/performance-issues.mdx",
        () =>
            import(
                "astro:content-layer-deferred-module?astro%3Acontent-layer-deferred-module=&fileName=src%2Fcontent%2Fdocs%2Fguides%2Fperformance-issues.mdx&astroContentModuleFlag=true"
            ),
    ],
]);
