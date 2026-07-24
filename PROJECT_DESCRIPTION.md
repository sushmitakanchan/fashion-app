# AURA — Your AI Fashion Twin

**AURA is your AI fashion twin.** Upload two photos and AURA generates a studio-quality portrait of you — then lets you *try on real clothes from the internet on your own body*. Paste any Pinterest or Myntra link: AURA scrapes the garment, composites it onto your portrait with AI image generation, and shows you wearing it in seconds — before you buy. A colour-science engine extracts your skin tone and recommends garment colours that actually suit you, and every look you love saves to your personal Style Book.

## Why it matters

Online fashion returns run 25–40%, mostly because "it looked different on me." AURA answers the one question every shopper has — *how will this look on ME?* — with no measurements, no 3D scans, just two photos.

## AI at the core, used with intent

- **OpenAI image generation** powers portrait creation and garment try-on compositing.
- A **provider-neutral AI boundary** (Vercel AI SDK) handles text generation.
- **Deterministic colour science** grounds recommendations in skin-tone analysis rather than generic prompts.
- **Built with OpenAI Codex** driving parallel agents in isolated git worktrees — 55 commits, 100+ issues/PRs, spec-driven from a domain-model doc, in 4 days.

## Stack

Next.js 16 · Clerk (Google sign-in) · Prisma + Neon · Cloudinary · Tailwind v4 · Vercel.

**Privacy-first:** explicit timestamped consent, no body/demographic data stored, ephemeral try-ons.

## Links

- **Live:** https://fashion-app-gray.vercel.app
- **Repo:** https://github.com/sushmitakanchan/fashion-app
