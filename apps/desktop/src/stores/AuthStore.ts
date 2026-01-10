/**
 * Zustand store for authentication UI state.
 * Manages the client-side auth state synchronized with the main process.
 */

import { create } from "zustand";
import type {
    AuthState,
    AuthUser,
    AuthError,
} from "../../electron/main/auth/types";

/**
 * Auth store state interface.
 */
interface AuthStoreState {
    /** Whether the user is currently authenticated */
    isAuthenticated: boolean;
    /** Whether an auth operation is in progress */
    isLoading: boolean;
    /** Current user info if authenticated */
    user: AuthUser | null;
    /** Current error if any */
    error: AuthError | null;
}

/**
 * Auth store actions interface.
 */
interface AuthStoreActions {
    /** Sets the full auth state from IPC */
    setAuthState: (state: AuthState) => void;
    /** Sets just the loading state */
    setLoading: (isLoading: boolean) => void;
    /** Sets an error */
    setError: (error: AuthError | null) => void;
    /** Resets the store to initial state */
    reset: () => void;
}

/**
 * Combined auth store interface.
 */
interface AuthStoreInterface extends AuthStoreState, AuthStoreActions {}

/**
 * Initial state for the auth store.
 * Starts as loading until we fetch the actual state from main process.
 */
const initialState: AuthStoreState = {
    isAuthenticated: false,
    isLoading: true, // Start as loading until we fetch initial state
    user: null,
    error: null,
};

/**
 * Auth store for managing authentication UI state.
 *
 * @example
 * ```tsx
 * const { isAuthenticated, user, isLoading } = useAuthStore();
 *
 * // Or with selector for better performance
 * const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
 * ```
 */
export const useAuthStore = create<AuthStoreInterface>((set) => ({
    ...initialState,

    setAuthState: (state) =>
        set({
            isAuthenticated: state.isAuthenticated,
            isLoading: state.isLoading,
            user: state.user,
            error: state.error,
        }),

    setLoading: (isLoading) => set({ isLoading }),

    setError: (error) => set({ error }),

    reset: () => set(initialState),
}));
