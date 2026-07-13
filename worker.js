// Cloudflare Worker entry. Serves the static app from /public and answers the
// /api/verify data endpoint. Deployed with `npx wrangler deploy`.
import { verify, preflight } from "./src/verify.js";
import { getState, postState, search } from "./src/state.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/verify") {
      return request.method === "OPTIONS" ? preflight() : verify(request, env);
    }
    if (pathname === "/api/state") {
      if (request.method === "OPTIONS") return preflight();
      return request.method === "POST" ? postState(request, env) : getState(env);
    }
    if (pathname === "/api/search") {
      return search(request, env);
    }
    const res = await env.ASSETS.fetch(request);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html")) {
      const headers = new Headers(res.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  },
};
