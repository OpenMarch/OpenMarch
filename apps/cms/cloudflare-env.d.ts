interface CloudflareEnv {
    D1: D1Database;
    R2: R2Bucket;
}

interface D1Database {
    prepare(query: string): unknown;
    batch(statements: unknown[]): Promise<unknown>;
    exec(query: string): Promise<unknown>;
}

interface R2Bucket {
    put(
        key: string,
        value: ReadableStream | ArrayBuffer | string,
    ): Promise<unknown>;
    get(key: string): Promise<unknown>;
    delete(keys: string[]): Promise<unknown>;
    list(options?: unknown): Promise<unknown>;
}
