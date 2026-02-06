import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const repoRoot = process.cwd();
loadEnvFile(path.join(repoRoot, ".env"));

const REQUIRED = [
  "OPENAI_API_KEY",
  "TMDB_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`Missing required env: ${key}`);
    process.exit(1);
  }
}

const includeDb =
  process.argv.includes("--include-db") ||
  process.env.BACKFILL_INCLUDE_DB === "1";

if (includeDb && !process.env.DATABASE_URL) {
  console.error("Missing required env: DATABASE_URL (needed for --include-db)");
  process.exit(1);
}

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = Number(
  (limitArg ? limitArg.split("=")[1] : null) ??
    process.env.BACKFILL_LIMIT ??
    2000
);

const dbLimitArg = process.argv.find((arg) => arg.startsWith("--db-limit="));
const dbLimit = Number(
  (dbLimitArg ? dbLimitArg.split("=")[1] : null) ??
    process.env.BACKFILL_DB_LIMIT ??
    500
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const prisma = includeDb ? new PrismaClient() : null;

const TMDB_BASE = "https://api.themoviedb.org/3";

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`TMDB error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

async function getGenreMap() {
  const url = new URL(`${TMDB_BASE}/genre/movie/list`);
  url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("language", "en-US");
  const data = await fetchJson(url.toString());
  const map = new Map();
  for (const g of data.genres ?? []) {
    map.set(g.id, g.name);
  }
  return map;
}

async function fetchMoviesFromEndpoint(endpoint, pages, genreMap, seen) {
  const movies = [];
  for (let page = 1; page <= pages; page++) {
    const url = new URL(`${TMDB_BASE}${endpoint}`);
    url.searchParams.set("api_key", process.env.TMDB_API_KEY);
    url.searchParams.set("language", "en-US");
    url.searchParams.set("page", String(page));
    const data = await fetchJson(url.toString());
    for (const movie of data.results ?? []) {
      if (seen.has(movie.id)) continue;
      seen.add(movie.id);
      movies.push({
        tmdb_id: movie.id,
        title: movie.title,
        overview: movie.overview ?? null,
        genres: (movie.genre_ids ?? []).map((id) => genreMap.get(id)).filter(Boolean),
        year: movie.release_date ? Number(movie.release_date.split("-")[0]) : null,
        poster_url: movie.poster_path
          ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
          : null
      });
    }
  }
  return movies;
}

async function fetchMovieDetailsById(movieId) {
  const url = new URL(`${TMDB_BASE}/movie/${movieId}`);
  url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("language", "en-US");
  const data = await fetchJson(url.toString());
  return {
    tmdb_id: data.id,
    title: data.title,
    overview: data.overview ?? null,
    genres: Array.isArray(data.genres) ? data.genres.map((g) => g.name) : [],
    year: data.release_date ? Number(data.release_date.split("-")[0]) : null,
    poster_url: data.poster_path
      ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
      : null
  };
}

function buildEmbeddingInput(movie) {
  const parts = [
    `${movie.title}${movie.year ? ` (${movie.year})` : ""}`,
    movie.genres && movie.genres.length ? `Genres: ${movie.genres.join(", ")}` : "",
    movie.overview ?? ""
  ].filter(Boolean);
  return parts.join("\n");
}

async function getExistingTmdbIds() {
  const { data, error } = await supabase
    .from("movie_embeddings")
    .select("tmdb_id");
  if (error) throw new Error(`Supabase read error: ${error.message}`);
  return new Set((data ?? []).map((row) => row.tmdb_id));
}

async function main() {
  console.log(
    `Backfill starting (tmdbLimit=${limit}, includeDb=${includeDb}, dbLimit=${dbLimit})...`
  );

  const genreMap = await getGenreMap();
  const seen = new Set();
  let dbMovies = [];
  if (includeDb && prisma) {
    const watched = await prisma.watchedMovie.findMany({
      distinct: ["movieId"],
      select: { movieId: true, movieTitle: true },
      orderBy: { addedAt: "desc" },
      take: dbLimit
    });
    for (const item of watched) {
      if (seen.has(item.movieId)) continue;
      try {
        const details = await fetchMovieDetailsById(item.movieId);
        seen.add(item.movieId);
        dbMovies.push(details);
      } catch (err) {
        console.warn(
          `Failed to fetch TMDB details for watched movie ${item.movieId} (${item.movieTitle}): ${err.message}`
        );
      }
    }
    console.log(`Loaded ${dbMovies.length} movies from DB history.`);
  }

  const sources = [
    { endpoint: "/movie/popular", pages: 50 },
    { endpoint: "/movie/top_rated", pages: 50 },
    { endpoint: "/movie/now_playing", pages: 20 }
  ];

  let movies = [];
  for (const src of sources) {
    if (movies.length >= limit) break;
    const next = await fetchMoviesFromEndpoint(
      src.endpoint,
      src.pages,
      genreMap,
      seen
    );
    movies = movies.concat(next);
  }

  movies = movies.slice(0, limit);
  console.log(`Fetched ${movies.length} movies from TMDB.`);

  movies = dbMovies.concat(movies);
  console.log(`Total candidate movies: ${movies.length}.`);

  const existing = await getExistingTmdbIds();
  const toInsert = movies.filter((m) => !existing.has(m.tmdb_id));
  console.log(`Skipping ${movies.length - toInsert.length} already present.`);

  const batchSize = 100;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize);
    const inputs = batch.map(buildEmbeddingInput);
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: inputs
    });

    const rows = batch.map((movie, idx) => ({
      ...movie,
      embedding: embeddingResponse.data[idx]?.embedding ?? null
    }));

    const { error } = await supabase.from("movie_embeddings").insert(rows);
    if (error) {
      throw new Error(`Supabase insert error: ${error.message}`);
    }

    console.log(`Inserted ${Math.min(i + batchSize, toInsert.length)} / ${toInsert.length}`);
  }

  console.log("Backfill complete.");
  if (prisma) {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  if (prisma) {
    prisma.$disconnect().catch(() => undefined);
  }
  process.exit(1);
});
