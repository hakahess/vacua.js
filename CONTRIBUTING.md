# Contributing to vacua.js

Contributions are welcome! Whether it's a bug fix, a new feature, or a refactor — feel free to open a PR.

## Getting started

```bash
git clone https://github.com/hakahess/vacua.js.git
cd vacua.js
npm install
```

## Build

```bash
npm run build
```

Compiles `src/index.ts` → `dist/`.

## Project structure

```
vacua.js/
├── src/
│   └── index.ts      # Full SDK source (Client, EmbedBuilder, SlashCommandBuilder, ...)
├── dist/             # Compiled output (gitignored)
├── tsconfig.json
└── package.json
```

## Guidelines

- Keep the public API consistent with the existing style
- No breaking changes without discussion (open an issue first)
- All commits should be signed as **VACUA Team** — do not include personal names in commit messages or co-author lines

## Publishing

Only maintainers publish to npm. Releases follow semver (`npm version patch|minor|major && npm publish --access public`).
