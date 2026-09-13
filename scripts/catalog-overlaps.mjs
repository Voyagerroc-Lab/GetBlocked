// requestDomains includes descendants, but not hosts that only share a suffix.
export function findCatalogOverlaps(trackers) {
  const normalized = trackers.map((tracker) => ({
    ...tracker,
    domain: String(tracker.domain || "").trim().toLowerCase()
  }));
  const domains = new Set(normalized.map((tracker) => tracker.domain));

  return normalized.flatMap((tracker) => {
    const labels = tracker.domain.split(".");
    const parents = labels.slice(1).map((_, index) => labels.slice(index + 1).join("."))
      .filter((domain) => domains.has(domain));
    if (tracker.redundancyReason !== undefined &&
        (typeof tracker.redundancyReason !== "string" || !tracker.redundancyReason.trim() || !parents.length)) {
      throw new Error(`Invalid or stale redundancyReason for ${tracker.domain}`);
    }
    return parents.map((parent) => ({
      domain: tracker.domain,
      parent,
      reason: tracker.redundancyReason
    }));
  });
}
