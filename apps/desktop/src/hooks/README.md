# React Query Hooks

This directory contains React Query hooks that replace the old database table files (`*.Table.ts`) for data management in OpenMarch.

## Why React Query Over Table Files?

### 🚀 **Performance Benefits**

**Old Method (Table Files):**

```typescript
// Manual loading states, no caching
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

const fetchData = async () => {
  setLoading(true);
  try {
    const result = await someTableFunction();
    setData(result);
  } catch (err) {
    setError(err);
  } finally {
    setLoading(false);
  }
};
```

**New Method (React Query):**

```typescript
// Automatic caching, loading states, and error handling
const { data, isLoading, error } = useSomeData();
```

### 🔄 **Automatic Caching & Background Updates**

- **Smart Caching**: Data is cached and shared across components
- **Background Refetching**: Data stays fresh automatically
- **Stale-While-Revalidate**: Show cached data while fetching updates
- **Deduplication**: Multiple components requesting same data? Only one network request

### 🎯 **Better Developer Experience**

- **No Manual State Management**: Loading, error, and success states handled automatically
- **DevTools**: Built-in debugging with React Query DevTools
- **TypeScript Support**: Full type safety throughout
- **Consistent Patterns**: Same API across all data fetching

### 🔧 **Simplified Mutations**

**Old Method:**

```typescript
const updateData = async (newData) => {
  await tableFunction.update(newData);
  // Manually refetch or update local state
  await fetchData(); // Another network request
};
```

**New Method:**

```typescript
const updateData = useUpdateData();
updateData.mutate(newData);
// Automatically invalidates and re-fetches related queries
```

### 🏗️ **Better Architecture**

- **Separation of Concerns**: Data fetching logic separated from UI
- **Reusability**: Hooks can be used across multiple components
- **Testing**: Easier to mock and test data fetching
- **Error Boundaries**: Better error handling and recovery

## File Structure

```
hooks/
├── queries/                    # React Query hooks
│   ├── usePages.ts            # Pages table queries & mutations
│   ├── useMarchers.ts         # Marchers table queries & mutations
│   └── index.ts               # Export all hooks
├── useAnimation.ts            # Existing custom hooks
└── README.md                  # This file
```

## Migration Benefits

### Before (Table Files)

- ❌ Manual loading states
- ❌ No automatic caching
- ❌ Manual error handling
- ❌ Duplicate network requests
- ❌ Complex state synchronization
- ❌ Hard to test

### After (React Query)

- ✅ Automatic loading states
- ✅ Smart caching
- ✅ Built-in error handling
- ✅ Request deduplication
- ✅ Automatic state sync
- ✅ Easy testing

## Usage Examples

### Basic Query

```typescript
import { useQuery } from "@tanstack/react-query";
import { allMarchersQueryOptions } from "@/hooks/queries";

function MarcherList() {
    const { data: marchers, isLoading, error } = useQuery(allMarchersQueryOptions());

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;

    return <div>{/* Render marchers */}</div>;
}
```

## Key Advantages

1. **Performance**: Automatic caching reduces network requests
2. **UX**: Background updates keep data fresh
3. **Developer Experience**: Less boilerplate, more features
4. **Maintainability**: Consistent patterns across the app
5. **Scalability**: Easy to add new data sources
6. **Testing**: Simplified mocking and testing

## Migration Strategy

1. **Start Small**: Migrate one table at a time
2. **Keep Existing**: Don't remove table files until migration is complete
3. **Gradual Rollout**: Update components one by one
4. **Test Thoroughly**: Ensure all functionality works as expected

React Query provides a modern, efficient, and maintainable approach to data management that significantly improves both user experience and developer productivity.
