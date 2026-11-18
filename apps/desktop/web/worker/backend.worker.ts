/**
 * The web build's main-process worker (`./index.ts`), under a name of its own so its built file
 * (`assets/backend.worker-<hash>.js`) gets its CSP (`src/security/appCsp.ts`).
 */
import "./index";
