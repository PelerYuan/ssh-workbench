## Summary

<!-- One paragraph: what this PR does and why. -->

## Changes

<!-- Bullet list of the significant changes. -->

## Testing

- [ ] `npm test` passes (16 tests)
- [ ] `npx tsc --noEmit` passes
- [ ] E2E acceptance suite passes (if applicable): `./scripts/run-acceptance.sh`
- [ ] Manually verified the affected feature in the browser (if UI change)

## Security checklist (if touching auth, crypto, or SSH paths)

- [ ] No credentials, tokens, or private keys are logged or returned in API responses
- [ ] User input is validated with Zod before use
- [ ] No new unauthenticated endpoints added
- [ ] Origin check and rate limiting still apply to the modified routes

## Notes for reviewer

<!-- Anything that needs extra attention, known limitations, or follow-up issues. -->
