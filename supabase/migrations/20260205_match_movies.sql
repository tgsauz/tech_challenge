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

alter table public.movie_embeddings owner to postgres;

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
security definer
set search_path = public
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

alter function public.match_movies(vector(1536), int, float) owner to postgres;

-- Diagnostics: report current role for server-side verification.
drop function if exists public.whoami();
create or replace function public.whoami()
returns table (
  current_user_name text,
  session_user_name text,
  current_role_name text,
  jwt_role text,
  jwt_sub text,
  jwt_claims jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    current_user::text,
    session_user::text,
    current_role::text,
    coalesce(
      current_setting('request.jwt.claim.role', true),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ),
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$;

alter function public.whoami() owner to postgres;

-- Lock down access to service_role only.
revoke all on schema public from anon, authenticated;
grant usage on schema public to service_role;
grant select on public.movie_embeddings to service_role;
grant execute on function public.match_movies(vector(1536), int, float) to service_role;
grant execute on function public.whoami() to service_role;
