import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://keykomi.com',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
});
