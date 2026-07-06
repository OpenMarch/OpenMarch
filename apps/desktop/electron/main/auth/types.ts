/**
 * Type definitions for Clerk OAuth authentication in the Electron main process.
 */

/**
 * PKCE flow data stored during authentication.
 * Used to validate OAuth callbacks and complete token exchange.
 */
export interface PendingAuthFlow {
    /** Base64url-encoded random string used for PKCE */
    codeVerifier: string;
    /** Random state parameter for CSRF protection */
    state: string;
    /** Timestamp when the flow was initiated (ms) */
    initiatedAt: number;
    /** Timestamp when the flow expires (ms) */
    expiresAt: number;
}

/**
 * Tokens received from Clerk after successful authentication.
 */
export interface AuthTokens {
    /** JWT access token for API calls */
    accessToken: string;
    /** Refresh token for obtaining new access tokens */
    refreshToken: string;
    /** JWT ID token containing user claims */
    idToken: string;
    /** Unix timestamp (ms) when the access token expires */
    expiresAt: number;
    /** Token type (typically "bearer") */
    tokenType: string;
}

/**
 * User information extracted from the ID token.
 */
export interface AuthUser {
    /** Clerk user ID */
    id: string;
    /** User's email address */
    email: string | null;
    /** User's first name */
    firstName: string | null;
    /** User's last name */
    lastName: string | null;
    /** URL to user's profile picture */
    imageUrl: string | null;
}

/**
 * Authentication state sent to the renderer process.
 */
export interface AuthState {
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
 * Authentication error structure.
 */
export interface AuthError {
    /** Error code for programmatic handling */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Additional error details */
    details?: unknown;
}

/**
 * Clerk OAuth endpoint configuration.
 */
export interface ClerkOAuthConfig {
    /** OAuth client ID for the desktop app */
    clientId: string;
    /** Clerk authorization endpoint URL */
    authorizationEndpoint: string;
    /** Clerk token endpoint URL */
    tokenEndpoint: string;
    /** OAuth redirect URI (openmarch://auth/callback) */
    redirectUri: string;
    /** OAuth scopes to request */
    scopes: string[];
}

/**
 * Request body for token exchange (authorization_code grant).
 */
export interface TokenExchangeRequest {
    client_id: string;
    code: string;
    code_verifier: string;
    grant_type: "authorization_code";
    redirect_uri: string;
}

/**
 * Request body for token refresh (refresh_token grant).
 */
export interface TokenRefreshRequest {
    client_id: string;
    grant_type: "refresh_token";
    refresh_token: string;
}

/**
 * Response from Clerk token endpoint.
 */
export interface ClerkTokenResponse {
    access_token: string;
    refresh_token: string;
    id_token: string;
    /** Token lifetime in seconds */
    expires_in: number;
    token_type: string;
}

/**
 * Result of IPC login operation.
 */
export interface LoginResult {
    success: boolean;
    error?: AuthError;
}

/**
 * Result of IPC logout operation.
 */
export interface LogoutResult {
    success: boolean;
}

/**
 * Result of IPC get access token operation.
 */
export interface AccessTokenResult {
    token: string | null;
}
