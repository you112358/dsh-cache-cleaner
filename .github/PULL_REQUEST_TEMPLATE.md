## What changed

<!-- One paragraph: the behaviour before and after. -->

## Type

- [ ] New cache target
- [ ] New cleaning option / age policy
- [ ] UI change
- [ ] Host service / tool / route change
- [ ] Docs / CI only

## Safety checklist

- [ ] New paths live under the declared roots in `lib/targets.js` and hold no user data
- [ ] The change goes through `lib/cleaner.js` (no second cleanup implementation)
- [ ] Symlinks are not followed; locked files are reported, not forced
- [ ] `lib/` still imports Node built-ins only
- [ ] Both READMEs updated (English and 简体中文) when targets or options change

## Checks

- [ ] `node --check client/client.js`
- [ ] `node -e "import('./lib/index.js').then((m) => console.log(m.name))"`
- [ ] `node scripts/check-client.mjs`

## Verification notes

<!-- What you ran against a real DSH install, and what remains unverified. -->
