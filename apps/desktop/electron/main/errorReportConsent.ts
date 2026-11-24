/**
 * Error reports (Sentry) follow the same yes/no as analytics: they leave the app only after the
 * person said yes (`optOutAnalytics` false). Unanswered counts as no, as it does for PostHog.
 * Development runs never send.
 */
export function errorReportsAllowedFor(
    nodeEnv: string | undefined,
    optOutAnalytics: unknown,
): boolean {
    return nodeEnv !== "development" && optOutAnalytics === false;
}

/** The part of a Sentry transport the gate needs. */
interface SendingTransport<Envelope, Response> {
    send(envelope: Envelope): PromiseLike<Response | Record<string, never>>;
    flush(timeout?: number): PromiseLike<boolean>;
}

/**
 * `makeTransport` with every send dropped while `allowed()` is false. Wrap the network transport
 * that the offline queue sends through (not the queue itself), so reports saved on disk earlier
 * and re-sent at launch are checked too: without consent they are dropped, not sent. `allowed`
 * is read at each send, so an answer given after launch applies at once.
 */
export function consentGatedTransport<
    Options,
    Envelope,
    Response,
    T extends SendingTransport<Envelope, Response>,
>(makeTransport: (options: Options) => T, allowed: () => boolean) {
    return (options: Options): T => {
        const transport = makeTransport(options);
        return {
            ...transport,
            send: (envelope: Envelope) =>
                allowed() ? transport.send(envelope) : Promise.resolve({}),
            flush: (timeout?: number) => transport.flush(timeout),
        };
    };
}
