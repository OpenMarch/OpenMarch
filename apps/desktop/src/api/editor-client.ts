/**
 * Orval mutator: custom Axios instance for the editor API with baseURL and Bearer auth.
 * Used by generated API code in api/generated/. Returns unwrapped response body (not AxiosResponse).
 */

import Axios, { AxiosError, AxiosRequestConfig } from "axios";
import { OPENMARCH_API_ENDPOINT } from "@/global/Constants";

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

export const AXIOS_INSTANCE = Axios.create({
    baseURL: getBaseURL(),
    validateStatus: () => true,
});

AXIOS_INSTANCE.interceptors.request.use(
    async (config) => {
        const { token } = await window.electron.auth.getAccessToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
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
            `API request failed: ${response.status} ${response.statusText}`;
        return Promise.reject(new Error(message));
    },
    (error: AxiosError) => {
        if (error.response?.data) {
            const data = error.response.data as {
                error?: string;
                message?: string;
            };
            const message = data?.error || data?.message || error.message;
            return Promise.reject(new Error(message));
        }
        return Promise.reject(error);
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
