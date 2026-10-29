// Deployment configuration only. Players never need to see or edit this file.
// Keep /api when the page and API share a domain (recommended).
// For a separate API on the same site, set e.g. https://api.example.com/api
// and allow the page's exact origin on that server. See API.md.
window.MOYU_CONFIG = Object.freeze({
  apiBaseUrl: "/api",
  pollIntervalMs: 1300,
  requestTimeoutMs: 6500,
});
