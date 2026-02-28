// Global transaction lock to prevent concurrent transactions
// Attached to window to survive hot reloads
declare global {
    interface Window {
        __dbTransactionLock?: Promise<void>;
    }
}
const getTransactionLock = () =>
    (window.__dbTransactionLock ??= Promise.resolve());
const setTransactionLock = (lock: Promise<void>) =>
    (window.__dbTransactionLock = lock);

/**
 * Wraps any async function with the global transaction lock.
 * Use this when you need to run db.transaction() directly instead of transactionWithHistory.
 */
export const withTransactionLock = async <T>(
    fn: () => Promise<T>,
): Promise<T> => {
    const previousLock = getTransactionLock();
    let resolveLock: () => void;
    void setTransactionLock(
        new Promise((resolve) => {
            resolveLock = resolve;
        }),
    );
    await previousLock;

    try {
        return await fn();
    } finally {
        resolveLock!();
    }
};
