import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { findCatalogOverlaps } from "./catalog-overlaps.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const entry = (domain, extra = {}) => ({ domain, category: "Analytics", label: domain, ...extra });

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "getblocked-tooling-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  assert.ifError(result.error);
  return { ...result, output: result.stdout + result.stderr };
}

test("evidence CLI rejects missed trackers and false positives, reporting every failure", (t) => {
  const dir = tempDir(t);
  const fixturePath = path.join(dir, "evidence.json");
  const trackerDomain = readJson("rules/rules.json").find(r => r.action.type === "block").condition.requestDomains[0];
  for (const kinds of [[true], [false], [true, false]]) {
    const requests = kinds.map(tracker => ({
      url: tracker ? "https://unlisted.example.test/collect" : `https://${trackerDomain}/collect`,
      type: "xmlhttprequest", tracker
    }));
    fs.writeFileSync(fixturePath, JSON.stringify({ name: "Mutation", landingUrls: [], pages: [
      { name: "Regression fixture", topUrl: "https://site.example.test/", requests }
    ] }));
    const result = run(path.join(root, "scripts/evaluate-test-set.mjs"), [fixturePath]);
    assert.equal(result.status, 1, result.output);
    for (const request of requests) {
      assert.ok(result.output.includes(request.url), result.output);
      assert.ok(result.output.includes(`expected ${request.tracker ? "blocked" : "unblocked"}`), result.output);
    }
    assert.equal((result.output.match(/FAIL: Regression fixture/g) || []).length, requests.length);
  }
});

test("evidence CLI keeps successful coverage output", () => {
  const result = run(path.join(root, "scripts/evaluate-test-set.mjs"));
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Category coverage:/);
  assert.match(result.output, /Reduction: 100.0%/);
  assert.match(result.output, /PASS:/);
});

test("overlap detection handles normalization, ancestors, siblings and suffix boundaries", () => {
  assert.deepEqual(findCatalogOverlaps([
    entry(" Example.com "), entry("A.EXAMPLE.COM"), entry("b.a.example.com"),
    entry("otherexample.com"), entry("example.com.test"), entry("sibling.test")
  ]).map(({ domain, parent }) => [domain, parent]), [
    ["a.example.com", "example.com"],
    ["b.a.example.com", "a.example.com"],
    ["b.a.example.com", "example.com"]
  ]);
  assert.deepEqual(findCatalogOverlaps([entry("a.example.com"), entry("b.example.com")]), []);
});

test("intentional overlaps require a nonempty reason tied to an existing parent", () => {
  const reason = "Preserves a distinct category";
  assert.equal(findCatalogOverlaps([entry("example.com"), entry("a.example.com", { redundancyReason: reason })])[0].reason, reason);
  for (const redundancyReason of ["", "  ", true, null]) {
    assert.throws(() => findCatalogOverlaps([entry("example.com"), entry("a.example.com", { redundancyReason })]), /Invalid or stale/);
  }
  assert.throws(() => findCatalogOverlaps([entry("a.example.com", { redundancyReason: reason })]), /stale/);
});

test("generator rejects unexplained overlaps before writing and retains documented entries deterministically", (t) => {
  const dir = tempDir(t);
  for (const folder of ["scripts", "shared", "rules"]) fs.mkdirSync(path.join(dir, folder));
  for (const file of ["generate-rules.mjs", "catalog-overlaps.mjs"]) {
    fs.copyFileSync(path.join(root, "scripts", file), path.join(dir, "scripts", file));
  }
  fs.writeFileSync(path.join(dir, "shared/tracking-params.json"), '["utm_source"]');
  const catalogPath = path.join(dir, "shared/tracker-catalog.json");
  const trackers = [entry("example.com"), entry("a.example.com")];
  fs.writeFileSync(catalogPath, JSON.stringify({ trackers }));
  const script = path.join(dir, "scripts/generate-rules.mjs");
  const failed = run(script);
  assert.equal(failed.status, 1, failed.output);
  assert.match(failed.output, /a.example.com: already covered by example.com/);
  assert.equal(fs.existsSync(path.join(dir, "rules/rules.json")), false);
  trackers[1].redundancyReason = "Keep endpoint category";
  trackers[1].category = "Social pixel";
  fs.writeFileSync(catalogPath, JSON.stringify({ trackers }));
  const passed = run(script);
  assert.equal(passed.status, 0, passed.output);
  assert.match(passed.output, /Retained a.example.com/);
  const outputs = ["rules/rules.json", "shared/config.js"];
  const first = outputs.map(file => fs.readFileSync(path.join(dir, file), "utf8"));
  assert.match(first[1], /"Social pixel": \[\s*"a.example.com"/);
  assert.equal(run(script).status, 0);
  assert.deepEqual(outputs.map(file => fs.readFileSync(path.join(dir, file), "utf8")), first);
});

test("catalog audit retains only explained overlaps and their category mappings", () => {
  const catalog = readJson("shared/tracker-catalog.json");
  const overlaps = findCatalogOverlaps(catalog.trackers);
  for (const overlap of overlaps) assert.ok(overlap.reason);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, "shared/config.js"), "utf8"), context);
  const categories = context.GetBlockedConfig.TRACKER_CATEGORIES;
  for (const [host, expected] of [
    ["stats.g.doubleclick.net", ["Ad tracking", "Analytics"]],
    ["static.ads-twitter.com", ["Ad tracking", "Social pixel"]]
  ]) {
    const actual = Object.entries(categories).filter(([, domains]) =>
      domains.some(domain => host === domain || host.endsWith(`.${domain}`))
    ).map(([category]) => category).sort();
    assert.deepEqual(actual, expected);
  }
});
