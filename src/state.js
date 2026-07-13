// Shared household state (cloud sync) + title search, backed by Cloudflare KV.
// Bind a KV namespace as STATE in wrangler.jsonc to enable cross-device sync.
// Without the binding these endpoints degrade gracefully (no persistence).

const KEY = "household:main";

function j(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

// Union-merge two state blobs: arrays become sets, objects shallow-merge,
// scalars take the incoming value. Additive so concurrent edits don't clobber.
function mergeState(a, b) {
  const out = Object.assign({}, a);
  for (const k in b) {
    const bv = b[k], av = out[k];
    if (Array.isArray(bv)) {
      out[k] = Array.from(new Set([].concat(av || [], bv)));
    } else if (bv && typeof bv === "object") {
      out[k] = Object.assign({}, av || {}, bv);
    } else {
      out[k] = bv;
    }
  }
  return out;
}

export async function getState(env) {
  if (!env.STATE) return j({});
  const v = await env.STATE.get(KEY);
  return j(v ? JSON.parse(v) : {});
}

export async function postState(request, env) {
  if (!env.STATE) return j({ ok: false });
  let body;
  try { body = await request.json(); } catch (_) { return j({ ok: false }, 400); }
  const curRaw = await env.STATE.get(KEY);
  const cur = curRaw ? JSON.parse(curRaw) : {};
  const merged = mergeState(cur, body || {});
  await env.STATE.put(KEY, JSON.stringify(merged));
  return j(merged);
}

export async function search(request, env) {
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (!q || !env.TMDB_API_KEY) return j({ results: [] });
  const url = `https://api.themoviedb.org/3/search/multi?api_key=${env.TMDB_API_KEY}&query=${encodeURIComponent(q)}`;
  let data = null;
  try { const r = await fetch(url); data = r.ok ? await r.json() : null; } catch (_) {}
  const results = (((data && data.results) || [])
    .filter((x) => x.media_type === "movie" || x.media_type === "tv")
    .slice(0, 8)
    .map((x) => ({
      title: x.title || x.name,
      year: (x.release_date || x.first_air_date || "").slice(0, 4),
      type: x.media_type === "tv" ? "series" : "movie",
      poster: x.poster_path ? "https://image.tmdb.org/t/p/w154" + x.poster_path : null,
    })));
  return j({ results });
}
