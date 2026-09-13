# Catalog overlap audit

The September 2026 audit found 12 child entries already covered by existing parents. Chrome DNR [`requestDomains`](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest#property-RuleCondition-requestDomains) matches the listed domain and its subdomains. All entries use the same blocking rule, resource types, and third-party condition, so removing these children does not change blocking scope.

The following entries were removed. Their labels and endpoint notes were folded into the parent's notes to preserve the catalog's maintenance context. Each child had the same category as its parent.

| Removed child | Existing parent | Category |
| --- | --- | --- |
| `cdn.segment.com` | `segment.com` | Analytics |
| `ssl.google-analytics.com` | `google-analytics.com` | Analytics |
| `www.google-analytics.com` | `google-analytics.com` | Analytics |
| `googleads.g.doubleclick.net` | `doubleclick.net` | Ad tracking |
| `securepubads.g.doubleclick.net` | `doubleclick.net` | Ad tracking |
| `pagead2.googlesyndication.com` | `googlesyndication.com` | Ad tracking |
| `connect.facebook.net` | `facebook.net` | Social pixel |
| `px.ads.linkedin.com` | `ads.linkedin.com` | Social pixel |
| `script.hotjar.com` | `hotjar.com` | Session replay |
| `static.hotjar.com` | `hotjar.com` | Session replay |

Two children remain with explicit `redundancyReason` fields:

- `stats.g.doubleclick.net` contributes Analytics alongside its parent's Ad tracking category.
- `static.ads-twitter.com` contributes Social pixel alongside its parent's Ad tracking category.

Removing either would lose an existing category signal in the content script. Their labels and notes remain unchanged. Other narrow entries such as `api.segment.io` have no listed parent and remain necessary.

The generated config and Decoy Mode use the same domain-suffix matching, so the removed children remain in scope there too. Evidence fixtures cover each removed child, a nested subdomain, and an unrelated host with the child name as a prefix. `npm run test:tooling` checks generator rejection, documented exceptions, deterministic output, and evidence failure exit codes.
