// Live verification logic shared by the Worker entry (worker.js).
// GET /api/verify?title=...&type=movie|series&year=YYYY
// Returns live IMDb rating, Rotten Tomatoes critics score, and current India
// streaming availability. Keys are read from the Worker environment (never the
// client): TMDB_API_KEY (availability + IMDb id) and OMDB_API_KEY (scores).

const PLATFORM_ORDER = [
  ["Netflix", /netflix/i],
  ["Amazon Prime Video", /prime video|amazon prime/i],
  ["JioHotstar", /hotstar|jio/i],
  ["Apple TV+", /apple ?tv/i],
  ["SonyLIV", /sony ?liv/i],
];

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers });
}
async function getJSON(url) {
  try {
    const r = await fetch(url, { cf: { cacheTtl: 21600, cacheEverything: true } });
    return r.ok ? await r.json() : null;
  } catch (_) {
    return null;
  }
}

function pickProvider(area) {
  const flat = [].concat(area.flatrate || [], area.free || [], area.ads || []);
  const paid = [].concat(area.rent || [], area.buy || []);
  const list = flat.map((p) => ({ name: p.provider_name, type: "stream" }))
    .concat(paid.map((p) => ({ name: p.provider_name, type: "rent/buy" })));

  for (const [label, rx] of PLATFORM_ORDER) {
    if (flat.some((p) => rx.test(p.provider_name)))
      return { access: "Included", platform: label, list };
  }
  if (flat.length) return { access: "Included", platform: flat[0].provider_name, list };
  for (const [label, rx] of PLATFORM_ORDER) {
    if (paid.some((p) => rx.test(p.provider_name)))
      return { access: "Rent or buy", platform: label, list };
  }
  if (paid.length) return { access: "Rent or buy", platform: paid[0].provider_name, list };
  return { access: null, platform: null, list };
}

export async function verify(request, env) {
  const url = new URL(request.url);
  const title = (url.searchParams.get("title") || "").trim();
  const type = url.searchParams.get("type") === "series" ? "tv" : "movie";
  const year = (url.searchParams.get("year") || "").trim();

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=21600",
  };
  if (!title) return json({ error: "missing title" }, 400, headers);

  const TMDB = env.TMDB_API_KEY;
  const OMDB = env.OMDB_API_KEY;
  const out = {
    title, imdb: null, rtCritics: null, access: null, platform: null,
    providers: [], imdbId: null, justwatch: null, poster: null, backdrop: null,
    updated: new Date().toISOString().slice(0, 10), source: {},
  };

  // TMDb: match the title, pull the IMDb id and India watch providers.
  if (TMDB) {
    const sp = new URLSearchParams({ api_key: TMDB, query: title });
    if (year) sp.set(type === "tv" ? "first_air_date_year" : "year", year);
    const search = await getJSON(`https://api.themoviedb.org/3/search/${type}?${sp}`);
    const hit = search && search.results && search.results[0];
    if (hit) {
      out.source.tmdbId = hit.id;
      if (hit.poster_path) out.poster = "https://image.tmdb.org/t/p/w342" + hit.poster_path;
      if (hit.backdrop_path) out.backdrop = "https://image.tmdb.org/t/p/w780" + hit.backdrop_path;
      const detail = await getJSON(
        `https://api.themoviedb.org/3/${type}/${hit.id}?api_key=${TMDB}&append_to_response=external_ids,watch/providers`
      );
      if (detail) {
        out.imdbId = (detail.external_ids && detail.external_ids.imdb_id) || null;
        const wp = detail["watch/providers"];
        const area = wp && wp.results && wp.results.IN;
        if (area) {
          const pick = pickProvider(area);
          out.access = pick.access;
          out.platform = pick.platform;
          out.providers = pick.list;
          out.justwatch = area.link || null;
        }
      }
    }
  }

  // OMDb: real IMDb rating + Rotten Tomatoes critics score.
  if (OMDB) {
    let omdb;
    if (out.imdbId) {
      omdb = `https://www.omdbapi.com/?apikey=${OMDB}&i=${out.imdbId}`;
    } else {
      const p = new URLSearchParams({ apikey: OMDB, t: title });
      if (year) p.set("y", year);
      omdb = `https://www.omdbapi.com/?${p}`;
    }
    const o = await getJSON(omdb);
    if (o && o.Response !== "False") {
      if (o.imdbRating && o.imdbRating !== "N/A") out.imdb = parseFloat(o.imdbRating);
      if (Array.isArray(o.Ratings)) {
        const rt = o.Ratings.find((r) => r.Source === "Rotten Tomatoes");
        if (rt) out.rtCritics = parseInt(rt.Value, 10);
      }
      if (!out.imdbId && o.imdbID) out.imdbId = o.imdbID;
    }
  }

  return json(out, 200, headers);
}

export function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "*",
    },
  });
}
