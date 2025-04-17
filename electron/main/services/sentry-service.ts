import { captureException, init } from "@sentry/electron/main";

let instance: SentryService;

class SentryService {
    static getService() {
        if (!instance) {
            instance = new SentryService();
        }

        return instance;
    }

    private constructor() {
        const enableSentry = process.env.NODE_ENV !== "development";
        init({
            dsn: "https://72e6204c8e527c4cb7a680db2f9a1e0b@o4509010215239680.ingest.us.sentry.io/4509010222579712",
            enabled: enableSentry,
        });
    }

    capture(exception: unknown) {
        captureException(exception);
    }
}

export const sentryService = SentryService.getService();
