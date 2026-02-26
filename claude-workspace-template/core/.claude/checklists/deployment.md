# Deployment Checklist

## Pre-deployment Verification
- [ ] Type checking passes (`tsc --noEmit` / `mypy`)
- [ ] Linting passes (no errors)
- [ ] All tests pass
- [ ] Test coverage threshold met

## Environment Configuration
- [ ] Environment variables set for target environment
- [ ] API keys use production/staging values (not dev)
- [ ] Database connection strings verified
- [ ] Third-party service configs confirmed

## Build Configuration
- [ ] Version number updated if applicable
- [ ] Build config reviewed for target environment
- [ ] Environment-specific variables confirmed

## Build & Deploy
- [ ] Production build completes without errors
- [ ] Build output size is reasonable
- [ ] No unexpected files in build output

## Post-deployment Verification
- [ ] Application accessible and running
- [ ] Authentication flow works
- [ ] Core features functional
- [ ] Error monitoring active
- [ ] Logs flowing correctly

## Rollback Plan
- [ ] Previous version backed up / tagged
- [ ] Rollback procedure documented
- [ ] Emergency contacts available
- [ ] Rollback tested or verified

## Common Commands
```bash
# Adjust these for your project's build system

# Run all checks
npm run type-check && npm run lint && npm test

# Build for production
npm run build

# Preview production build locally
npm run preview
```
