interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

// Simple in-memory cache
const cache = new Map<string, CacheEntry<any>>();

/**
 * Fetch data from GitHub API with caching
 * @param endpoint - The GitHub API endpoint (e.g., '/repos/owner/repo')
 * @param cacheTimeSeconds - Cache time in seconds (default: 300 = 5 minutes)
 * @returns Promise with the API response data
 */
export async function fetchFromGitHub<T = any>(
    endpoint: string,
    cacheTimeSeconds: number = 300,
): Promise<T> {
    const cacheTime = cacheTimeSeconds * 1000; // Convert to milliseconds
    const cacheKey = endpoint;

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheTime) {
        return cached.data;
    }

    try {
        // Clean up endpoint (remove leading slash if present)
        const cleanEndpoint = endpoint.startsWith("/")
            ? endpoint.slice(1)
            : endpoint;
        const url = `https://api.github.com/${cleanEndpoint}`;

        const response = await fetch(url, {
            headers: {
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "OpenMarch-Website",
            },
        });

        if (!response.ok) {
            throw new Error(
                `GitHub API request failed: ${response.status} ${response.statusText}`,
            );
        }

        const data = await response.json();

        // Cache the result
        cache.set(cacheKey, {
            data,
            timestamp: Date.now(),
        });

        return data as T;
    } catch (error) {
        // If we have cached data and request fails, return cached data
        if (cached) {
            console.warn(
                "GitHub API request failed, returning cached data:",
                error,
            );
            return cached.data;
        }
        throw error;
    }
}

/**
 * Clear all cached data
 */
export function clearCache(): void {
    cache.clear();
}
