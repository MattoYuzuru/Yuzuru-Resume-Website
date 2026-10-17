# Repository guide

This is the public source for keykomi.com. English lives at /, Russian at /ru/.

Use pnpm and Node >=26.9. Run pnpm verify and pnpm build for code changes. The PDFs and compiled atlas assets are checked in, so a normal build needs neither Python nor Typst. Rebuild those only when their source changes.

Keep UI strings bilingual. Text belongs in the DOM; canvas is decorative. Language changes preserve the art instance. Honour prefers-reduced-motion and the mobile text-only layout.

Production is static Caddy hosting. Deployment scripts upload an immutable release and switch a symlink; they must not manage other server services, Docker, networking or credentials. Production changes require the owner's authorization. Keep secrets and local research out of Git.
