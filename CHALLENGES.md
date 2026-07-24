# Challenges Faced

1. **Try-on realism without 3D scans** — compositing a scraped garment onto a generated portrait convincingly meant careful prompt engineering and a provenance-aware composer state, so the model knows *where* each garment came from.

2. **Ingesting the open web safely** — scraping Pinterest/Myntra product images opened SSRF risk; we hardened the scrape route by pinning image fetches to per-source CDN hosts.

3. **Concurrent AI agents on one repo** — multiple Codex agents editing simultaneously corrupted each other's context; we solved it with isolated git worktrees per task, an issue-driven workflow, and adversarial code-review passes.

4. **Failing loudly, not silently** — AI + Cloudinary + DB orchestration hid persistence failures; we rebuilt submission to be recoverable, added delivery-readiness verification and a credential-aware healthcheck for every integration.

5. **Scope discipline under a 4-day clock** — we cut a planned 3D avatar to ship a polished portrait + try-on loop judges can actually click, type, and break.
