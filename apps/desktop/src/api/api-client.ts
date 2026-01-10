/**
 * API client utilities for making authenticated requests to the OpenMarch API.
 */

import axios, { AxiosError, AxiosRequestConfig } from "axios";

/**
 * Gets the API endpoint from environment variable.
 * @throws {Error} If VITE_OPENMARCH_API_ENDPOINT is not defined
 */
function getApiEndpoint(): string {
    const endpoint = import.meta.env.VITE_OPENMARCH_API_ENDPOINT;
    if (!endpoint) {
        throw new Error(
            "VITE_OPENMARCH_API_ENDPOINT environment variable is not defined",
        );
    }
    return endpoint;
}

/**
 * Makes an authenticated API request.
 * @param path - The API path (e.g., 'v1/ensembles')
 * @param options - Fetch options (method, body, etc.)
 * @param token - The authentication token
 * @returns The response JSON
 * @throws {Error} If the request fails
 */
async function authenticatedFetch<T>(
    path: string,
    options: RequestInit = {},
    token: string | null,
): Promise<T> {
    if (!token) {
        throw new Error("Authentication token is required");
    }

    const endpoint = getApiEndpoint();
    const url = `${endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint}${path.startsWith("/") ? path : `/${path}`}`;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers as Record<string, string>),
    };

    const axiosConfig: AxiosRequestConfig = {
        method: (options.method as any) || "GET",
        url,
        headers,
        data: options.body,
        validateStatus: () => true, // Don't throw on non-2xx status codes
    };

    try {
        const response = await axios<T>(axiosConfig);

        if (response.status >= 200 && response.status < 300) {
            return response.data;
        }

        let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
        if (response.data) {
            const errorData = response.data as {
                error?: string;
                message?: string;
            };
            if (errorData.error || errorData.message) {
                errorMessage =
                    errorData.error || errorData.message || errorMessage;
            }
        }
        throw new Error(errorMessage);
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            console.error("API request failed:", {
                url,
                method: axiosConfig.method,
                status: axiosError.response?.status,
                statusText: axiosError.response?.statusText,
                data: axiosError.response?.data,
                message: axiosError.message,
            });

            let errorMessage = `API request failed: ${axiosError.message}`;
            if (axiosError.response?.data) {
                const errorData = axiosError.response.data as {
                    error?: string;
                    message?: string;
                };
                if (errorData.error || errorData.message) {
                    errorMessage =
                        errorData.error || errorData.message || errorMessage;
                } else if (typeof axiosError.response.data === "string") {
                    errorMessage = axiosError.response.data;
                }
            } else if (axiosError.response?.status) {
                errorMessage = `API request failed: ${axiosError.response.status} ${axiosError.response.statusText || ""}`;
            }
            throw new Error(errorMessage);
        } else {
            console.error("Unexpected error during API request:", {
                url,
                method: axiosConfig.method,
                error,
            });
            throw error;
        }
    }
}

/**
 * Makes a GET request to the API.
 */
export async function apiGet<T>(
    path: string,
    token: string | null,
): Promise<T> {
    return authenticatedFetch<T>(path, { method: "GET" }, token);
}

/**
 * Makes a POST request to the API.
 */
export async function apiPost<T>(
    path: string,
    body: unknown,
    token: string | null,
): Promise<T> {
    return authenticatedFetch<T>(
        path,
        {
            method: "POST",
            body: JSON.stringify(body),
        },
        token,
    );
}

/**
 * Makes a POST request with FormData (for file uploads).
 */
export async function apiPostFormData<T>(
    path: string,
    formData: FormData,
    token: string | null,
): Promise<T> {
    if (!token) {
        throw new Error("Authentication token is required");
    }

    const endpoint = getApiEndpoint();
    const url = `${endpoint}${path.startsWith("/") ? path : `/${path}`}`;

    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
    };

    const axiosConfig: AxiosRequestConfig = {
        method: "POST",
        url,
        headers,
        data: formData,
        validateStatus: () => true, // Don't throw on non-2xx status codes
    };

    try {
        const response = await axios<T>(axiosConfig);

        if (response.status >= 200 && response.status < 300) {
            return response.data;
        }

        let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
        if (response.data) {
            const errorData = response.data as {
                error?: string;
                message?: string;
            };
            if (errorData.error || errorData.message) {
                errorMessage =
                    errorData.error || errorData.message || errorMessage;
            }
        }
        throw new Error(errorMessage);
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            console.error("API request failed:", {
                url,
                method: "POST",
                status: axiosError.response?.status,
                statusText: axiosError.response?.statusText,
                data: axiosError.response?.data,
                message: axiosError.message,
            });

            let errorMessage = `API request failed: ${axiosError.message}`;
            if (axiosError.response?.data) {
                const errorData = axiosError.response.data as {
                    error?: string;
                    message?: string;
                };
                if (errorData.error || errorData.message) {
                    errorMessage =
                        errorData.error || errorData.message || errorMessage;
                } else if (typeof axiosError.response.data === "string") {
                    errorMessage = axiosError.response.data;
                }
            } else if (axiosError.response?.status) {
                errorMessage = `API request failed: ${axiosError.response.status} ${axiosError.response.statusText || ""}`;
            }
            throw new Error(errorMessage);
        } else {
            console.error("Unexpected error during API request:", {
                url,
                method: "POST",
                error,
            });
            throw error;
        }
    }
}
