-- Enable pgvector for semantic similarity search
create extension if not exists vector;

-- Store movie embeddings for semantic search
create table if not exists public.movie_embeddings (
  id uuid primary key default gen_random_uuid(),
  tmdb_id int not null,
  title text not null,
  overview text,
  genres text[],
  year int,
  poster_url text,
  embedding vector(1536)
);

create index if not exists movie_embeddings_embedding_idx
  on public.movie_embeddings
  using ivfflat (embedding vector_cosine_ops);

-- RPC: similarity search using cosine distance
create or replace function public.match_movies(
  query_embedding vector(1536),
  match_count int default 10,
  similarity_threshold float default 0.7
)
returns table (
  tmdb_id int,
  title text,
  overview text,
  genres text[],
  year int,
  poster_url text,
  similarity float
)
language sql
stable
as $$
  select
    tmdb_id,
    title,
    overview,
    genres,
    year,
    poster_url,
    1 - (embedding <=> query_embedding) as similarity
  from public.movie_embeddings
  where embedding is not null
    and (1 - (embedding <=> query_embedding)) >= similarity_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
