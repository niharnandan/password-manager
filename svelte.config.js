import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "index.html",
    }),
    // Emitted as a <meta> tag (with hashes for SvelteKit's inline bootstrap
    // script), so it also works on static hosts that can't set headers.
    csp: {
      mode: "hash",
      directives: {
        "default-src": ["self"],
        "script-src": ["self"],
        "style-src": ["self", "unsafe-inline", "https://fonts.googleapis.com"],
        "font-src": ["self", "https://fonts.gstatic.com"],
        // Google's favicon service redirects to *.gstatic.com.
        "img-src": [
          "self",
          "data:",
          "https://www.google.com",
          "https://*.gstatic.com",
        ],
        "connect-src": ["self", "https://api.github.com"],
        "object-src": ["none"],
        "base-uri": ["self"],
        "form-action": ["self"],
        "frame-src": ["none"],
        "worker-src": ["self"],
        "manifest-src": ["self"],
      },
    },
  },
};

export default config;
