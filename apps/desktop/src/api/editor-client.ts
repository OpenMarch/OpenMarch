/**
 * Orval mutator: custom Axios instance for the editor API with baseURL and Bearer auth.
 * Used by generated API code in api/generated/. Returns unwrapped response body (not AxiosResponse).
 */

import Axios, { AxiosError, AxiosRequestConfig } from "axios";
import { OPENMARCH_API_ENDPOINT } from "@/global/Constants";
import tolgee from "@/global/singletons/Tolgee";

function getBaseURL(): string {
    const base = OPENMARCH_API_ENDPOINT.endsWith("/")
        ? OPENMARCH_API_ENDPOINT.slice(0, -1)
        : OPENMARCH_API_ENDPOINT;
    try {
        return new URL(base).origin;
    } catch {
        return base;
    }
}

/**
 * An editor API request that failed. `status` is the server's HTTP status;
 * undefined when the server never answered (offline) or no request went out
 * because there was no sign-in token.
 */
export class EditorApiError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = "EditorApiError";
    }
}

/** The HTTP status of an editor API failure, if the server answered. */
export function editorApiStatus(error: unknown): number | undefined {
    return error instanceof EditorApiError ? error.status : undefined;
}

export const AXIOS_INSTANCE = Axios.create({
    baseURL: getBaseURL(),
    validateStatus: () => true,
});

AXIOS_INSTANCE.interceptors.request.use(
    async (config) => {
        const { token } = await window.electron.auth.getAccessToken();
        // Signed in but no token right now (offline, or the refresh failed):
        // don't send a request the server can only turn down as if the
        // account had no access.
        if (!token)
            throw new EditorApiError(tolgee.t("auth.api.tokenRequired"));
        config.headers.Authorization = `Bearer ${token}`;
        return config;
    },
    (error) => Promise.reject(error),
);

AXIOS_INSTANCE.interceptors.response.use(
    (response) => {
        if (response.status >= 200 && response.status < 300) {
            return response;
        }
        const errorData = response.data as { error?: string; message?: string };
        const message =
            errorData?.error ||
            errorData?.message ||
            tolgee
                .t("auth.api.requestFailedStatus", {
                    status: response.status,
                    statusText: response.statusText ?? "",
                })
                .trim();
        return Promise.reject(new EditorApiError(message, response.status));
    },
    (error: AxiosError) => {
        if (error instanceof EditorApiError) return Promise.reject(error);
        const data = error.response?.data as
            | { error?: string; message?: string }
            | undefined;
        const message = data?.error || data?.message || error.message;
        return Promise.reject(
            new EditorApiError(message, error.response?.status),
        );
    },
);

/**
 * Mutator used by Orval-generated hooks. Returns unwrapped response body.
 */
export const customInstance = <T>(
    config: AxiosRequestConfig,
    options?: AxiosRequestConfig,
): Promise<T> => {
    return AXIOS_INSTANCE({
        ...config,
        ...options,
    }).then(({ data }) => data as T);
};

export type ErrorType<Error> = AxiosError<Error>;
export type BodyType<BodyData> = BodyData;
