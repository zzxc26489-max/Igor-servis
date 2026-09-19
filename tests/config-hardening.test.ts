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
  assert.doesNotMatch(config, /script-src 'self' 'unsafe-inline'/);
});

test("pages deployment safely force-syncs after squash merges and manual main dispatch is active", () => {
  const workflow = readFileSync(join(process.cwd(), ".github", "workflows", "deploy-pages.yml"), "utf8");
  assert.match(workflow, /git push --force-with-lease origin HEAD:refs\/heads\/claude\/igor-workshop-website-yrdani/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'.*workflow_dispatch/);
});
