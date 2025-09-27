# Class and Interface Standards

This document outlines the standards for creating and managing data structures within the `global/classes` directory. The goal is to promote a consistent, maintainable, and functional approach to our codebase.

## The New Standard: Interfaces with Pure Functions

When creating new data structures, we will now use TypeScript `interfaces` combined with pure, standalone `functions` instead of `classes`. This approach offers several advantages:

- **Immutability:** Interfaces encourage treating data as plain, immutable objects, which helps prevent unintended side effects.
- **Simplicity:** Separating data (interfaces) from behavior (functions) leads to simpler, more focused code that is easier to understand and test.
- **Testability:** Pure functions are inherently easier to test in isolation, as they have no internal state and their output depends solely on their input.
- **Consistency:** This pattern aligns with modern functional programming paradigms and promotes a consistent coding style across the application.

### Example

The refactoring of `MarcherPage.ts` serves as a template for this new standard.

- **[`MarcherPage.ts`](./MarcherPage.ts):** Defines the `MarcherPage` interface and exports pure functions for creating, updating, and querying `MarcherPage` objects.
- **[`Page.ts`](./Page.ts):** Another example of this pattern, which was used as a model for the `MarcherPage` refactor.

## Refactoring Existing Classes

When you encounter an existing `class` that should be refactored to the new standard, follow these steps:

1. **Convert the Class to an Interface:**
   - Change the `class` declaration to an `interface`.
   - Remove the `constructor` and any other methods that are not simple getters.
   - Ensure all properties are `readonly` to encourage immutability.

1. **Convert Static Methods to Pure Functions:**
   - Move all `static` methods out of the class and declare them as standalone, `exported` functions.
   - If a function modifies data (e.g., by making a database call), it should accept a callback function to trigger a data refetch (e.g., `invalidateQuery()`). This decouples the function from the state management store.

1. **Replace Instantiations with Object Literals:**
   - Find all instances of `new ClassName()` and replace them with plain object literals that conform to the new interface.

1. **Update Call Sites:**
   - Update all call sites of the former static methods to import and use the new standalone functions.
   - Pass the refetch callback function to any data modification functions as needed.

1. **Update Test Files:**
   - Refactor the corresponding test files to test the new standalone functions instead of the old class methods.
   - Remove any tests related to the `constructor` or other class-specific features.

By following these guidelines, we can ensure that our codebase remains clean, consistent, and easy to maintain.
