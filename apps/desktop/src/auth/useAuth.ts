/**
 * React Query hook for authentication state management.
 * Integrates with the Zustand store and main process IPC.
 */

import { useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/auth/AuthStore";
import type { AuthState } from "../../electron/main/auth/types";

const KEY_BASE = "auth";
export const NEEDS_AUTH_BASE_QUERY_KEY = "needs-auth" as const;

/**
 * Query key factory for auth queries.
 */
export const authKeys = {
    state: () => [KEY_BASE, "state"] as const,
};

/**
 * Query options for fetching auth state.
 */
const authStateQueryOptions = () => ({
    queryKey: authKeys.state(),
    queryFn: async (): Promise<AuthState> => {
        return await window.electron.auth.getState();
    },
    // Auth state is managed via IPC events, not polling
    staleTime: Infinity,
    refetchOnWindowFocus: false,
});

/**
 * Hook for managing authentication state.
 * Provides login/logout actions and reactive auth state.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *     const { isAuthenticated, user, login, logout, isLoading } = useAuth();
 *
 *     if (isLoading) return <div>Loading...</div>;
 *
 *     if (!isAuthenticated) {
 *         return <button onClick={login}>Sign In</button>;
 *     }
 *
 *     return (
 *         <div>
 *             <p>Welcome, {user?.firstName}!</p>
 *             <button onClick={logout}>Sign Out</button>
 *         </div>
 *     );
 * }
 * ```
 */
// eslint-disable-next-line max-lines-per-function
export function useAuth() {
    const queryClient = useQueryClient();
    const { setAuthState, setLoading, setError } = useAuthStore();

    // Get reactive state from Zustand
    const authState = useAuthStore((state) => ({
        isAuthenticated: state.isAuthenticated,
        isLoading: state.isLoading,
        user: state.user,
        error: state.error,
    }));

    // Initial fetch of auth state
    const { data, isLoading: queryLoading } = useQuery(authStateQueryOptions());

    // Sync query data to Zustand store
    useEffect(() => {
        if (data) {
            setAuthState(data);
        }
    }, [data, setAuthState]);

    // Listen for auth state changes from main process
    useEffect(() => {
        const unsubscribeStateChanged = window.electron.auth.onStateChanged(
            (state) => {
                setAuthState(state);
                // Also update React Query cache
                queryClient.setQueryData(authKeys.state(), state);

                // Invalidate all queries that require auth
                void queryClient.invalidateQueries({
                    queryKey: [NEEDS_AUTH_BASE_QUERY_KEY],
                });
            },
        );

        const unsubscribeError = window.electron.auth.onError((error) => {
            setError(error);
            setLoading(false);
            console.error("[Auth] Error:", error);
        });

        return () => {
            unsubscribeStateChanged();
            unsubscribeError();
        };
    }, [queryClient, setAuthState, setError, setLoading]);

    // Login mutation
    const loginMutation = useMutation({
        mutationFn: async () => {
            setLoading(true);
            const result = await window.electron.auth.login();

            if (!result.success && result.error) {
                throw new Error(result.error.message);
            }

            return result;
        },
        onError: (error) => {
            setLoading(false);
            setError({
                code: "LOGIN_FAILED",
                message:
                    error instanceof Error ? error.message : "Login failed",
            });
        },
    });

    // Logout mutation
    const logoutMutation = useMutation({
        mutationFn: async () => {
            const result = await window.electron.auth.logout();
            return result;
        },
        onSuccess: () => {
            const newState: AuthState = {
                isAuthenticated: false,
                isLoading: false,
                user: null,
                error: null,
            };
            setAuthState(newState);
            queryClient.setQueryData(authKeys.state(), newState);
        },
    });

    // Destructure stable mutate functions
    const { mutate: loginMutate } = loginMutation;
    const { mutate: logoutMutate } = logoutMutation;

    // Convenience methods
    const login = useCallback(() => {
        loginMutate();
    }, [loginMutate]);

    const logout = useCallback(() => {
        logoutMutate();
    }, [logoutMutate]);

    const getAccessToken = useCallback(async (): Promise<string | null> => {
        const result = await window.electron.auth.getAccessToken();
        return result.token;
    }, []);

    return {
        // State
        isAuthenticated: authState.isAuthenticated,
        isLoading: queryLoading,
        user: authState.user,
        error: authState.error,

        // Actions
        login,
        logout,
        getAccessToken,

        // Mutation states for UI feedback
        isLoggingIn: loginMutation.isPending,
        isLoggingOut: logoutMutation.isPending,
    };
}

/**
 * Hook to get just the access token for API calls.
 * Use this when you only need the token, not the full auth state.
 *
 * @example
 * ```tsx
 * function ApiComponent() {
 *     const { getAccessToken } = useAccessToken();
 *
 *     const fetchData = async () => {
 *         const token = await getAccessToken();
 *         if (!token) {
 *             // Handle not authenticated
 *             return;
 *         }
 *
 *         const response = await fetch('/api/data', {
 *             headers: { Authorization: `Bearer ${token}` }
 *         });
 *         // ...
 *     };
 * }
 * ```
 */
export function useAccessToken() {
    const getAccessToken = useCallback(async (): Promise<string | null> => {
        const result = await window.electron.auth.getAccessToken();
        return result.token;
    }, []);

    return { getAccessToken };
}
