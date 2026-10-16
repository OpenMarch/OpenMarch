import { Component, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CanvasErrorBoundary } from "../fieldRecovery";

function Throws({ error }: { error: Error }): ReactNode {
    throw error;
}

/** Stands in for the app's error boundary. */
class AppBoundary extends Component<
    { children: ReactNode },
    { error: Error | null }
> {
    state = { error: null as Error | null };
    static getDerivedStateFromError(error: Error) {
        return { error };
    }
    render() {
        return this.state.error ? (
            <p>app error: {this.state.error.message}</p>
        ) : (
            this.props.children
        );
    }
}

const renderField = (error: Error, onError = vi.fn()) => {
    render(
        <AppBoundary>
            <CanvasErrorBoundary
                fallback={<p>the field cannot be drawn</p>}
                onError={onError}
            >
                <Throws error={error} />
            </CanvasErrorBoundary>
        </AppBoundary>,
    );
    return onError;
};

describe("CanvasErrorBoundary", () => {
    it("explains in the field when there's no WebGL context", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const onError = renderField(
            new Error("THREE.WebGLRenderer: Error creating WebGL context."),
        );
        expect(screen.getByText("the field cannot be drawn")).toBeTruthy();
        expect(onError).toHaveBeenCalledOnce();
    });

    it("leaves other WebGL errors to the app's error boundary", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        renderField(new Error("WebGL context lost while uploading a buffer"));
        expect(screen.queryByText("the field cannot be drawn")).toBeNull();
    });

    it("leaves any other error to the app's error boundary", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const onError = renderField(new Error("a bug in a layer"));
        expect(screen.getByText("app error: a bug in a layer")).toBeTruthy();
        expect(screen.queryByText("the field cannot be drawn")).toBeNull();
        expect(onError).not.toHaveBeenCalled();
    });
});
