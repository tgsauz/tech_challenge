# Gleni Movie Discovery Chatbot

A production-ready web chat application that helps users discover movies and movie recommendations through natural conversation. The bot integrates with **TMDB** (The Movie Database), uses **OpenAI** for intelligent reasoning and tool selection, and stores user preferences in a **Supabase Postgres** database.

## Live Demo

https://tech-challenge-omega-five.vercel.app/

## Problem It Solves

Instead of browsing multiple apps separately, users can have a natural conversation to discover new content based on their tastes, with intelligent cross-referencing between movies and user preferences.

## Target Audience

Movie enthusiasts who want personalized discovery and personalized recommendations.

## Value Proposition

Natural conversation interface for personalized content discovery, combining movie recommendations in one place with intelligent cross-referencing.

## Features

- **Conversational AI**: Natural language interface powered by OpenAI GPT-4o-mini
- **Movie Discovery**: Search, get details, and recommendations via TMDB API
- **Personalized Recommendations**: Based on user's watched movies
- **Persistent History**: Supabase Postgres stores conversations and user preferences
- **Debug Panel**: See which tools the AI called and how it reasoned (bonus feature)
- **Feedback System**: Thumbs up/down on recommendations (bonus feature)
- **Clear Chat / History**: Start a fresh chat or wipe all history + feedback with confirmation

## Screenshots / Demo

![Chat recommendations](public/screenshots/chat.png)

![Debug panel](public/screenshots/debug.png)

## User Stories

### Como un aficionado al cine
**Quiero** compartir las peliculas que he visto recientemente  
**Para** recibir recomendaciones personalizadas de peliculas similares

**Criterios de aceptacion:**
- [x] El bot guarda mis peliculas vistas en una lista persistente
- [x] El bot genera recomendaciones basadas en mis peliculas guardadas
- [x] Las recomendaciones incluyen informacion relevante (genero, anio, sinopsis)

### Como un usuario que busca recomendaciones
**Quiero** pedir "peliculas como X"  
**Para** descubrir peliculas similares rapidamente

**Criterios de aceptacion:**
- [x] El bot entiende la intencion de similitud
- [x] El bot devuelve recomendaciones con titulo, anio y sinopsis
- [x] El bot explica brevemente por que coinciden

## Tech Stack

- **Frontend + Backend**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: Supabase Postgres via Prisma ORM
- **AI**: OpenAI API (GPT-4o-mini) with function calling
- **External APIs**: TMDB API v3 (The Movie Database)
- **Validation**: Zod
- **Testing**: Vitest (configured, basic tests included)
- **Deployment**: Vercel

## Architecture

### Frontend (`app/`)
- `page.tsx`: Main chat UI with message list, input, and debug panel
- `layout.tsx`: Root layout with metadata
- `globals.css`: Tailwind CSS styles

### Backend (`app/api/`)
- `chat/route.ts`: Main API endpoint that handles user messages and orchestrates AI + tools

### Core Logic (`lib/`)
- `ai/chat.ts`: OpenAI orchestration with tool calling loop
- `ai/tools.ts`: Tool definitions and execution logic
- `tmdb.ts`: TMDB API client (search, details, recommendations)
- `persistence.ts`: Database helpers (save/retrieve user history)
- `prisma.ts`: Prisma client singleton
- `config.ts`: Environment variable management
- `semanticRecommendations.ts`: Supabase + pgvector similarity search

### Database (`prisma/`)
- `schema.prisma`: Database schema (Conversation, Message, WatchedMovie, Feedback)

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- OpenAI API key ([get one here](https://platform.openai.com/api-keys))
- TMDB API key ([get one here](https://www.themoviedb.org/settings/api))

### Installation

1. **Clone the repository**

```bash
git clone <your-repo-url>
cd gleni-chat-bot
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in your API keys:

```env
OPENAI_API_KEY=your-openai-key-here
TMDB_API_KEY=your-tmdb-key-here
DATABASE_URL="your-database-pooler-url"
DIRECT_URL="your-direct-database-url"
SUPABASE_URL="your-supabase-url"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
```

4. **Set up the database**

Generate Prisma Client and run migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

This creates the database tables in your Supabase Postgres instance.

Optional: **Enable semantic recommendations**

Run the Supabase migration in `supabase/migrations/20260205_match_movies.sql` on your hosted Supabase project (SQL editor).

Then backfill embeddings (requires OpenAI + TMDB + Supabase keys):

```bash
npm run backfill:embeddings:full
```

5. **Run the development server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How to Get API Keys

### OpenAI API Key

1. Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign up or log in
3. Click "Create new secret key"
4. Copy the key (you won't see it again!)

### TMDB API Key

1. Go to [https://www.themoviedb.org](https://www.themoviedb.org)
2. Create an account
3. Go to Settings -> API
4. Request an API key (automatic approval for basic usage)
5. Copy the API key


## Usage Examples

### Example 1: Save Movies and Get Recommendations

**User**: "I loved The Matrix and Inception"

**Bot**:
- Saves both movies to your history
- Gets recommendations for each
- Returns: "Based on The Matrix and Inception, here are some recommendations: [list]"

### Example 2: Movies Like X

**User**: "Give me movies like Interstellar"

**Bot**:
- Searches for Interstellar
- Returns similar movies with short explanations

## Technical Decisions

### Why TMDB?

- **TMDB**: Comprehensive movie database with free API, good documentation, and reliable data

### How We Handle API Rate Limits

- **TMDB**: Error handling returns user-friendly messages when rate limits are hit
- **OpenAI**: Tool calling is limited to 5 iterations to avoid excessive API usage

### Prompting Strategy

- **System prompt**: Defines bot role, guidelines, and response format
- **Tool descriptions**: Clear descriptions help the LLM choose the right tools
- **Few-shot examples**: Built into the system prompt to guide behavior

### Known Limitations


### Future Improvements

- User accounts with authentication (currently uses localStorage-based user IDs)
- Collaborative filtering (recommendations based on similar users)
- RAG with embeddings for semantic search of movie descriptions
- Streaming responses (SSE) for real-time recommendation display
- User preferences (favorite genres, etc.) stored in database

## Testing

Run tests with:

```bash
npm test
```

Basic unit tests are included for cross-reference logic. More comprehensive E2E tests can be added using Playwright.

## Deployment to Vercel

1. **Push to GitHub**

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. **Deploy on Vercel**

- Go to [https://vercel.com](https://vercel.com)
- Import your GitHub repository
Add environment variables in Vercel dashboard:
- `OPENAI_API_KEY`
- `TMDB_API_KEY`
- `DATABASE_URL` (use your Supabase pooled connection string)
- `DIRECT_URL` (only needed if you run migrations in Vercel)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

3. **Run migrations**

Run Prisma migrations manually (e.g. from your local machine or CI):

```bash
npm run prisma:migrate:deploy
```

If you want semantic recommendations in production, also apply the Supabase SQL migration and run the embeddings backfill script.

## Admin Actions in the UI

- **Clear chat**: Deletes the current conversation and starts a new one.
- **Clear history**: Deletes all conversations and resets feedback + watched history for the current user. A confirmation modal requires typing `CLEAR`.

## Bonus Features Implemented

- [x] **Debug Panel**: Shows tool calls, API responses, and LLM reasoning
- [x] **Feedback System**: Thumbs up/down on recommendations (database schema ready)
- [x] **Clear Chat / History**: Clear current chat or wipe all history (with confirmation)
- [x] **Testing**: Vitest configured with basic unit tests
- [x] **Rate Limiting**: TMDB rate-limit errors are handled with user-friendly messages
- [x] **Accessibility**: Semantic HTML, keyboard navigation support

## License

This project is part of a technical challenge and is provided as-is.

## Acknowledgments

- TMDB for movie data
- OpenAI for AI capabilities
- Next.js and Vercel for the excellent framework and hosting
