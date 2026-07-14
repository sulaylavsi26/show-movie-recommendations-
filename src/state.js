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

// Last-writer-wins merge keyed by per-item metadata (sp_syncmeta): each item
// carries {t: timestamp, d: 0|1 deleted}, so adds, deletes and re-adds all
// converge correctly across devices instead of just unioning.
const MAP = /^sp_(liked_|disliked_|wl_|watched$)/, ARR = /^sp_pref_/, BOOL = /^sp_onboarded_/;
const DATA = /^sp_(liked_|disliked_|wl_|pref_|watched$|onboarded_|lock_)/;

function mergeMeta(a, b) {
  const m = {};
  [a || {}, b || {}].forEach((M) => { for (const k in M) { const cur = m[k], inc = M[k]; if (!cur || inc.t > cur.t || (inc.t === cur.t && inc.d === 0)) m[k] = inc; } });
  return m;
}
function mergeKey(k, loc, cloud, meta) {
  if (MAP.test(k)) {
    const out = {}, ids = {};
    Object.keys(loc || {}).forEach((id) => (ids[id] = 1));
    Object.keys(cloud || {}).forEach((id) => (ids[id] = 1));
    for (const id in ids) {
      const mm = meta[k + "|" + id];
      if (mm && mm.d === 1) continue;
      out[id] = cloud && cloud[id] !== undefined ? cloud[id] : (loc || {})[id];
    }
    return out;
  }
  if (ARR.test(k)) {
    const set = {};
    [].concat(loc || [], cloud || []).forEach((x) => (set[x] = 1));
    return Object.keys(set).filter((id) => { const mm = meta[k + "|" + id]; return !(mm && mm.d === 1); });
  }
  if (BOOL.test(k)) { const mm = meta[k + "|_"]; if (mm) return mm.d !== 1; return !!(loc || cloud); }
  return cloud !== undefined ? cloud : loc;
}
function mergeState(a, b) {
  const meta = mergeMeta(a["sp_syncmeta"], b["sp_syncmeta"]);
  const out = {}, keys = {};
  [a, b].forEach((s) => { for (const k in s) { if (DATA.test(k)) keys[k] = 1; } });
  for (const k in keys) out[k] = mergeKey(k, a[k], b[k], meta);
  out["sp_syncmeta"] = meta;
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

async function getJSON(url) {
  try { const r = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } }); return r.ok ? await r.json() : null; }
  catch (_) { return null; }
}

// India-available titles from TMDb's full catalogue, filtered by genre.
// The frontend uses these to top up recommendations so it never runs dry.
export async function discover(request, env) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "movie" ? "movie" : "tv";
  const genres = url.searchParams.get("genres") || "";
  const page = url.searchParams.get("page") || "1";
  if (!env.TMDB_API_KEY) return new Response(JSON.stringify({ results: [] }), { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
  const p = new URLSearchParams({
    api_key: env.TMDB_API_KEY,
    watch_region: "IN",
    with_watch_providers: "8|119|122|350|237",       // Netflix, Prime, JioHotstar, Apple TV+, SonyLIV
    with_watch_monetization_types: "flatrate",
    without_genres: "27",                             // no horror
    "vote_count.gte": "60",
    sort_by: "popularity.desc",
    include_adult: "false",
    page,
  });
  if (genres) p.set("with_genres", genres);
  const data = await getJSON(`https://api.themoviedb.org/3/discover/${type}?${p}`);
  const results = (((data && data.results) || []).map((x) => ({
    id: x.id,
    title: x.title || x.name,
    year: (x.release_date || x.first_air_date || "").slice(0, 4),
    type: type === "tv" ? "series" : "movie",
    poster: x.poster_path ? "https://image.tmdb.org/t/p/w342" + x.poster_path : null,
    vote: x.vote_average,
  })));
  return new Response(JSON.stringify({ results }), {
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" },
  });
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
