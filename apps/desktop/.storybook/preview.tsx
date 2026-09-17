import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren, useState } from "react";
import { electronMock, resetElectronMock } from "./mocks/electron";

// preview-head.html installs the minimal flag before modules load. Replace it with the resettable
// facade used by stories.
window.electron = electronMock as Window["electron"];

const latestReleaseUrl =
    "https://api.github.com/repos/OpenMarch/OpenMarch/releases/latest";
const nativeFetch = window.fetch.bind(window);

// TitleBar includes VersionChecker. Keep its preview offline and deterministic.
window.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url === latestReleaseUrl) {
        return new Response(JSON.stringify({ tag_name: "v0.1.7", body: "" }), {
            headers: { "content-type": "application/json" },
        });
    }
    return nativeFetch(input, init);
};

import type { Decorator, Preview } from "@storybook/react-vite";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import "../src/styles/index.css";

const withTolgee: Decorator = (Story) => (
    <TolgeeProvider tolgee={tolgee} fallback="Loading...">
        <Story />
    </TolgeeProvider>
);

const StorybookQueryClient = ({ children }: PropsWithChildren) => {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    mutations: { retry: false },
                    // Component stories should not query a real Electron database.
                    queries: { enabled: false, retry: false },
                },
            }),
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

const withQueryClient: Decorator = (Story) => (
    <StorybookQueryClient>
        <Story />
    </StorybookQueryClient>
);

const preview: Preview = {
    beforeEach: resetElectronMock,
    decorators: [withQueryClient, withTolgee],
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
    },
};

export default preview;
