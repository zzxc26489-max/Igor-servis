import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("development index does not globally allow inline scripts", () => {
  const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
  assert.doesNotMatch(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /script-src[^"]*unsafe-inline/);
});

test("production CSP forbids inline scripts", () => {
  const config = readFileSync(join(process.cwd(), "vite.config.ts"), "utf8");
  assert.match(config, /production-csp/);
  assert.match(config, /script-src 'self'/);
  assert.match(config, /injectTo: 'head-prepend'/);
  assert.doesNotMatch(config, /script-src 'self' 'unsafe-inline'/);
});

test("pages deployment safely force-syncs after squash merges and manual main dispatch is active", () => {
  const workflow = readFileSync(join(process.cwd(), ".github", "workflows", "deploy-pages.yml"), "utf8");
  assert.match(workflow, /git push --force-with-lease origin HEAD:refs\/heads\/claude\/igor-workshop-website-yrdani/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'.*workflow_dispatch/);
  assert.match(workflow, /Dependency audit \(non-blocking for Pages\)/);
  assert.match(workflow, /continue-on-error: true/);
});


test("cloud backup import cannot overwrite an initialized shared database", () => {
  const store = readFileSync(join(process.cwd(), "src", "store", "AppStore.tsx"), "utf8");
  const settings = readFileSync(join(process.cwd(), "src", "pages", "Settings.tsx"), "utf8");
  assert.match(store, /importDB: \(json\) => \{[\s\S]*cloudConfigured && cloud\.status !== "needs_upload"[\s\S]*return false/);
  assert.match(settings, /JSON-восстановление отключено для общей базы/);
  assert.match(settings, /!cloud\.configured \|\| cloud\.status === "needs_upload"/);
});

test("order media metadata is server-confirmed before storage deletion", () => {
  const store = readFileSync(join(process.cwd(), "src", "store", "AppStore.tsx"), "utf8");
  const panel = readFileSync(join(process.cwd(), "src", "components", "OrderMediaPanel.tsx"), "utf8");
  assert.match(store, /appendOrderMedia: async[\s\S]*await pushCloudState\(candidate\)[\s\S]*rawSetDB\(confirmed\)/);
  assert.match(store, /removeOrderMedia: async[\s\S]*await pushCloudState\(candidate\)[\s\S]*rawSetDB\(confirmed\)/);
  assert.match(panel, /await removeOrderMedia\(order\.id, item\.id\)[\s\S]*await deleteCloudOrderMedia/);
});

test("route pages are code-split for faster initial load", () => {
  const app = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
  assert.match(app, /lazy\(\(\) => import\("\.\/pages\/Dashboard"\)\)/);
  assert.match(app, /<Suspense /);
});


test("session tokens are not persisted in localStorage", () => {
  const auth = readFileSync(join(process.cwd(), "src", "auth", "AuthContext.tsx"), "utf8");
  assert.match(auth, /sessionStorage\.setItem\(SESSION_KEY/);
  assert.match(auth, /localStorage\.removeItem\(SESSION_KEY\)/);
  assert.doesNotMatch(auth, /localStorage\.setItem\(SESSION_KEY/);
});

test("production CSP restricts network access to configured Supabase origin", () => {
  const config = readFileSync(join(process.cwd(), "vite.config.ts"), "utf8");
  assert.match(config, /remoteOrigin/);
  assert.match(config, /connect-src 'self'/);
  assert.doesNotMatch(config, /connect-src 'self' https:/);
});

test("pages workflow uses least privilege per job", () => {
  const workflow = readFileSync(join(process.cwd(), ".github", "workflows", "deploy-pages.yml"), "utf8");
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /sync-pages-branch:[\s\S]*permissions:[\s\S]*contents: write[\s\S]*actions: write/);
  assert.match(workflow, /deploy:[\s\S]*permissions:[\s\S]*pages: write[\s\S]*id-token: write/);
});


test("official GitHub actions are pinned to immutable commit SHAs", () => {
  const ci = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");
  const deploy = readFileSync(join(process.cwd(), ".github", "workflows", "deploy-pages.yml"), "utf8");
  for (const workflow of [ci, deploy]) {
    assert.doesNotMatch(workflow, /uses:\s+actions\/(checkout|setup-node|upload-pages-artifact|deploy-pages)@v\d+/);
  }
  assert.match(ci, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(deploy, /actions\/deploy-pages@[0-9a-f]{40}/);
});

test("service worker only caches static same-origin assets", () => {
  const sw = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  assert.match(sw, /cacheableStaticRequest/);
  assert.match(sw, /request\.destination === "script"/);
  assert.match(sw, /response\.type === "basic"/);
  assert.doesNotMatch(sw, /event\.respondWith\([\s\S]*caches\.match\(request\)[\s\S]*\);\s*\}\);\s*$/m);
});
