// Cloudflare Worker entry. Serves the static app from /public and answers the
// /api/verify data endpoint. Deployed with `npx wrangler deploy`.
import { verify, preflight } from "./src/verify.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/verify") {
      return request.method === "OPTIONS" ? preflight() : verify(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
