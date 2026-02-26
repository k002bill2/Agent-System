# Code Review Checklist

## Type Safety
- [ ] No `any` types used (TypeScript) / proper type hints (Python)
- [ ] Explicit return types defined
- [ ] Interface/type definitions for data structures
- [ ] Proper type guards used where needed

## Resource Management
- [ ] useEffect cleanup functions present (React)
- [ ] Subscriptions/timers properly cleaned up
- [ ] Memory leak prevention (mounted flags, abort controllers)
- [ ] Database connections properly closed

## Error Handling
- [ ] try-catch blocks used appropriately
- [ ] Graceful fallbacks on error (empty arrays/null)
- [ ] User-friendly error messages
- [ ] Errors logged for debugging

## Code Quality
- [ ] No console.log/print statements left
- [ ] Dead/commented-out code removed
- [ ] Functions under 50 lines
- [ ] No duplicated code
- [ ] Clear variable/function naming

## Routing & Navigation
- [ ] Type-safe parameter passing
- [ ] Back navigation handled
- [ ] Deep link support verified

## Performance
- [ ] No unnecessary re-renders (React) / redundant queries (Backend)
- [ ] Large lists virtualized where appropriate
- [ ] Assets optimized (images, bundles)
- [ ] N+1 query problems avoided

## Accessibility
- [ ] aria-labels set on interactive elements
- [ ] Keyboard navigation works
- [ ] Sufficient color contrast

## Security
- [ ] No secrets/credentials in code
- [ ] Input validation on user data
- [ ] SQL injection / XSS prevention
- [ ] Authentication checks on protected routes
