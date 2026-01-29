/**
 * Authentication button component.
 * Shows sign in button when not authenticated, or user avatar with dropdown when authenticated.
 */

import {
    SignInIcon,
    SignOutIcon,
    UserIcon,
    SpinnerIcon,
} from "@phosphor-icons/react";
import { Button, type ButtonProps } from "@openmarch/ui";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@radix-ui/react-dropdown-menu";
import { twMerge } from "tailwind-merge";
import { useAuth } from "@/auth/useAuth";

export const SignInButton = ({
    className,
    ...buttonProps
}: Omit<ButtonProps, "children" | "disabled" | "onClick">) => {
    const { login, isLoggingIn } = useAuth();

    return (
        <Button
            aria-label="Sign in"
            className={twMerge("gap-8", className)}
            onClick={login}
            disabled={isLoggingIn}
            {...buttonProps}
        >
            {isLoggingIn ? (
                <SpinnerIcon className="animate-spin" size={16} />
            ) : (
                <SignInIcon size={16} />
            )}
            <span>Sign In</span>
        </Button>
    );
};

/**
 * AuthButton component that displays authentication state and actions.
 *
 * - When not authenticated: Shows "Sign In" button
 * - When loading: Shows loading spinner
 * - When authenticated: Shows user avatar with dropdown menu containing user info and sign out
 *
 * @example
 * ```tsx
 * <AuthButton />
 * ```
 */
export function AuthButton() {
    const { isAuthenticated, isLoading, user, logout } = useAuth();

    // Loading state
    if (isLoading) {
        return (
            <div className="flex h-32 w-32 items-center justify-center">
                <SpinnerIcon
                    className="text-text-subtitle animate-spin"
                    size={20}
                />
            </div>
        );
    }

    // Not authenticated - show sign in button
    if (!isAuthenticated) {
        return <SignInButton variant="secondary" size="compact" />;
    }

    // Authenticated - show user avatar with dropdown
    const displayName =
        user?.firstName && user?.lastName
            ? `${user.firstName} ${user.lastName}`
            : user?.email || "User";

    const initials = user?.firstName
        ? user.firstName.charAt(0).toUpperCase()
        : user?.email?.charAt(0).toUpperCase() || "U";

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="bg-accent/20 text-accent hover:bg-accent/30 focus-visible:ring-accent flex h-32 w-32 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2"
                    title={displayName}
                >
                    {user?.imageUrl ? (
                        <img
                            src={user.imageUrl}
                            alt={displayName}
                            className="h-32 w-32 rounded-full object-cover"
                        />
                    ) : (
                        <span className="text-sm font-medium">{initials}</span>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="rounded-8 border-stroke bg-bg-1 z-50 min-w-[200px] border p-4 shadow-lg"
            >
                {/* User info section */}
                <div className="px-12 py-8">
                    <div className="flex items-center gap-12">
                        {user?.imageUrl ? (
                            <img
                                src={user.imageUrl}
                                alt={displayName}
                                className="h-40 w-40 rounded-full object-cover"
                            />
                        ) : (
                            <div className="bg-accent/20 text-accent flex h-40 w-40 items-center justify-center rounded-full">
                                <UserIcon size={24} />
                            </div>
                        )}
                        <div className="flex flex-col">
                            <span className="text-text text-sm font-medium">
                                {displayName}
                            </span>
                            {user?.email && (
                                <span className="text-text-subtitle text-xs">
                                    {user.email}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <DropdownMenuSeparator className="bg-stroke my-4 h-px" />

                {/* Sign out option */}
                <DropdownMenuItem
                    onClick={logout}
                    className="rounded-4 text-text hover:bg-fg-1 focus:bg-fg-1 flex cursor-pointer items-center gap-8 px-12 py-8 text-sm transition-colors outline-none"
                >
                    <SignOutIcon size={16} />
                    <span>Sign Out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default AuthButton;
