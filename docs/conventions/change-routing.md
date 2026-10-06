# Change Routing

Choose the narrowest owner that matches the behavior:

| Question                                                 | Destination                                  |
| -------------------------------------------------------- | -------------------------------------------- |
| Shared domain behavior?                                  | `packages/core` or the narrow owning package |
| Shared React primitive or tokens?                        | `packages/ui`                                |
| Desktop renderer behavior?                               | `apps/desktop/src`                           |
| Native, filesystem, window, or utility-process behavior? | `apps/desktop/electron`                      |
| Reusable low-level database operation?                   | `apps/desktop/src/db-functions`              |
| Feature-specific multi-table workflow?                   | Beside the owning feature                    |
| Public documentation or marketing?                       | `apps/website`                               |
| Managed content or Payload schema?                       | `apps/cms`                                   |

When a choice changes a persistent contract or crosses one of these boundaries,
read the [architecture decision policy](architecture-decisions.md) before
implementation.
