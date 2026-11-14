# CLAUDE.md

## Communication
- Blunt, short replies.
- If I say "talk", don't touch any code — just answer.

## Editing rules
- Only change what I explicitly ask.
- Never commit API keys. Before every push, scan the diff for 32-hex strings and abort if found.
- Commit messages must end with: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

## Branches
- Active branch: `dev-devices`
- Release = push `dev-devices` to `main`. GitHub Actions builds and tags `v1.0.N`.

## Source layout
- `web-src/` — theme source (CSS + JS features)
- `src/.../Assets/` — **generated** by `build-assets.mjs`, never edit directly
- `sleekfin/` — SleekFin plugin source, edited directly (not overridden from the theme)

## Dev workflow
- `npm run dev` — local dev server (see below); no need to build the full plugin for CSS/JS changes
- No GitHub visual-test runs unless I ask. I test on my own server.

## Dev server
- Runs on `localhost:3131`
- Watches `web-src/` and rebuilds `theme.css` / `theme.js` on every save
- Toggle in browser console:
  - ON:  `localStorage.setItem('ue-dev','1'); location.reload()`
  - OFF: `localStorage.removeItem('ue-dev'); location.reload()`
- Only affects the browser where the flag is set — nobody else on the server is affected

## Deployment — NEVER build or deploy a DLL
- NEVER build, copy, upload, or scp a plugin DLL to the homelab. Ever. Not even once.
- The server ONLY runs GitHub releases installed from the Jellyfin catalog.
- C# changes ship via: commit to dev-devices → push to main → GitHub Actions builds + tags a release → user updates in Jellyfin.
- "release" = user's word to push dev-devices to main. Wait for it before pushing.
