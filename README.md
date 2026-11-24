# The Ladder and Safe Exit: two agentic websites

Two small websites built on the open agentic website spec. Each site ships its own
assistant that runs in the visitor's browser, and the two sites talk to each other
through `links.json`.

- **The Ladder**: a private self-check by the Ladder method. Name a goal, and the
  assistant draws what stands between you and it as a ladder. Answers stay in the tab.
  Live: https://liaizhan.github.io/ladder-agent/
- **Safe Exit**: verified crisis helplines by country. The visitor shares only a
  country, nothing else. Live: https://safe-exit-helplines.liaizhan77.workers.dev/
- **Default model proxy** (`proxy/`): a small Cloudflare Worker that lets visitors
  try the assistant without their own key. It accepts calls only from the two sites
  above and has per-visitor limits. Visitors can always bring their own key instead.

The Ladder is a self-check tool, not therapy or medical care, and it promises no
health result. Its author is the author of the Ladder method.

## How the two sites work together

1. The Ladder publishes `links.json`, which maps the symbolic network `safe_exit` to
   the Safe Exit site on a different domain.
2. When a conversation needs a helpline, The Ladder's assistant shows a consent card
   first. Nothing leaves the page until the visitor agrees.
3. Only the country is passed to Safe Exit. Safe Exit's network runs locally on the
   caller's side and returns phone numbers.
4. No keys, no accounts and no server logs of what the visitor typed.

Open https://liaizhan.github.io/ladder-agent/checks/ to run the seven checks from the
spec (manifest, links, consent, peer call, cycle guard and others) against the live sites.

## Run locally

```bash
npx http-server ladder -p 8080      # The Ladder
npx http-server safe-exit -p 8081   # Safe Exit
node proxy/dev-server.mjs           # default model proxy on 127.0.0.1:8787
```

Tests:

```bash
node --test ladder/tests/*.mjs proxy/proxy.test.mjs
```

## Deploy

- The Ladder: GitHub Pages from the `gh-pages` branch, made with `git subtree push --prefix ladder origin gh-pages`.
- Safe Exit: `npx wrangler deploy -c safe-exit.wrangler.jsonc` (static assets).
- Proxy: `cd proxy && npx wrangler deploy`. The model key is a Worker secret,
  set with `npx wrangler secret put OTARI_KEY`. It is never stored in git.

## License

Apache-2.0. See `LICENSE`.
