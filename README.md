# Gleni Movie & Music Discovery Chatbot

A production-ready web chat application that helps users discover movies and music through natural conversation. The bot integrates with **TMDB** (The Movie Database) and **Spotify** APIs, uses **OpenAI** for intelligent reasoning and tool selection, and stores user preferences in a **SQLite** database.

## 🎯 Problem It Solves

Instead of browsing multiple apps separately, users can have a natural conversation to discover new content based on their tastes, with intelligent cross-referencing between movies and music.

## 👥 Target Audience

Movie and music enthusiasts who want personalized discovery and cross-media recommendations.

## 💡 Value Proposition

Natural conversation interface for personalized content discovery, combining movie and music recommendations in one place with intelligent cross-referencing.

## ✨ Features

- **Conversational AI**: Natural language interface powered by OpenAI GPT-4o-mini
- **Movie Discovery**: Search, get details, and recommendations via TMDB API
- **Music Discovery**: Search tracks, get details, and recommendations via Spotify API
- **Cross-Referencing**: Find songs in movies and movies featuring specific songs
- **Personalized Recommendations**: Based on user's watched movies and listened songs
- **Persistent History**: SQLite database stores conversations and user preferences
- **Debug Panel**: See which tools the AI called and how it reasoned (bonus feature)
- **Feedback System**: Thumbs up/down on recommendations (bonus feature)

## 📋 User Stories

### Como un aficionado al cine
**Quiero** compartir las películas que he visto recientemente  
**Para** recibir recomendaciones personalizadas de películas similares

**Criterios de aceptación:**
- [x] El bot guarda mis películas vistas en una lista persistente
- [x] El bot genera recomendaciones basadas en mis películas guardadas
- [x] Las recomendaciones incluyen información relevante (género, año, sinopsis)

### Como un amante de la música
**Quiero** descubrir canciones similares a las que me gustan  
**Para** expandir mi biblioteca musical con contenido nuevo

**Criterios de aceptación:**
- [x] El bot busca canciones en Spotify basándose en mis preferencias
- [x] El bot genera recomendaciones de canciones similares
- [x] Las recomendaciones incluyen artista, álbum y año de lanzamiento

### Como un usuario curioso
**Quiero** encontrar qué películas contienen una canción específica  
**Para** descubrir nuevas películas a través de la música que me gusta

**Criterios de aceptación:**
- [x] El bot busca películas que contienen una canción específica
- [x] El bot muestra información relevante de las películas encontradas
- [x] El bot indica el nivel de confianza de la coincidencia

## 🛠️ Tech Stack

- **Frontend + Backend**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: SQLite via Prisma ORM
- **AI**: OpenAI API (GPT-4o-mini) with function calling
- **External APIs**:
  - TMDB API v3 (The Movie Database)
  - Spotify Web API
- **Validation**: Zod
- **Testing**: Vitest (configured, basic tests included)
- **Deployment**: Vercel

## 🏗️ Architecture

### Frontend (`app/`)
- `page.tsx`: Main chat UI with message list, input, and debug panel
- `layout.tsx`: Root layout with metadata
- `globals.css`: Tailwind CSS styles

### Backend (`app/api/`)
- `chat/route.ts`: Main API endpoint that handles user messages and orchestrates AI + tools

### Core Logic (`lib/`)
- `ai/chat.ts`: OpenAI orchestration with tool calling loop
- `ai/tools.ts`: Tool definitions and execution logic
- `tmdb.ts`: TMDB API client (search, details, recommendations, soundtrack)
- `spotify.ts`: Spotify API client (OAuth, search, details, recommendations)
- `persistence.ts`: Database helpers (save/retrieve user history)
- `crossReference.ts`: Cross-reference logic (movies ↔ songs)
- `prisma.ts`: Prisma client singleton
- `config.ts`: Environment variable management

### Database (`prisma/`)
- `schema.prisma`: Database schema (Conversation, Message, WatchedMovie, ListenedSong, Feedback)

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ and npm
- API keys for:
  - OpenAI ([get one here](https://platform.openai.com/api-keys))
  - TMDB ([get one here](https://www.themoviedb.org/settings/api))
  - Spotify ([create app here](https://developer.spotify.com/dashboard))

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
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
DATABASE_URL="file:./prisma/dev.db"
```

4. **Set up the database**

Generate Prisma Client and run migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

This creates the SQLite database file at `prisma/dev.db`.

5. **Run the development server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📝 How to Get API Keys

### OpenAI API Key

1. Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign up or log in
3. Click "Create new secret key"
4. Copy the key (you won't see it again!)

### TMDB API Key

1. Go to [https://www.themoviedb.org](https://www.themoviedb.org)
2. Create an account
3. Go to Settings → API
4. Request an API key (automatic approval for basic usage)
5. Copy the API key

### Spotify Client Credentials

1. Go to [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click "Create app"
4. Fill in app name and description
5. Copy the **Client ID** and **Client Secret**

## 🎮 Usage Examples

### Example 1: Save Movies and Get Recommendations

**User**: "I loved The Matrix and Inception"

**Bot**: 
- Saves both movies to your history
- Gets recommendations for each
- Returns: "Based on The Matrix and Inception, here are some recommendations: [list]"

### Example 2: Find Songs in a Movie

**User**: "What songs are in Pulp Fiction?"

**Bot**:
- Searches for Pulp Fiction on TMDB
- Gets soundtrack data
- Searches Spotify for soundtrack albums
- Returns: "Here are the songs featured in Pulp Fiction: [list]"

### Example 3: Find Movies with a Song

**User**: "Find movies with 'Bohemian Rhapsody'"

**Bot**:
- Searches Spotify for the song
- Cross-references with TMDB
- Returns: "Movies featuring 'Bohemian Rhapsody': [list]"

## 🔧 Technical Decisions

### Why TMDB and Spotify?

- **TMDB**: Comprehensive movie database with free API, good documentation, and reliable data
- **Spotify**: Industry-standard music API with excellent search and recommendation algorithms

### How We Handle API Rate Limits

- **TMDB**: Error handling returns user-friendly messages when rate limits are hit
- **Spotify**: Token caching (1 hour) reduces API calls; retry logic handles 401 errors
- **OpenAI**: Tool calling is limited to 5 iterations to avoid excessive API usage

### Prompting Strategy

- **System prompt**: Defines bot role, guidelines, and response format
- **Tool descriptions**: Clear descriptions help the LLM choose the right tools
- **Few-shot examples**: Built into the system prompt to guide behavior

### How We Match Songs to Movies

- **TMDB soundtrack data**: Extracts music department crew (composers, music supervisors)
- **Spotify search**: Searches for soundtrack albums/playlists
- **Fuzzy matching**: Combines both sources and ranks by confidence (high/medium/low)

### Known Limitations

- **TMDB soundtrack data**: Not all movies have complete soundtrack information. We use best-effort extraction from credits.
- **Spotify API**: Some movie soundtracks may not be available as albums on Spotify.
- **Cross-referencing**: Matching songs to movies relies on available metadata and may not be 100% accurate.

### Future Improvements

- User accounts with authentication (currently uses localStorage-based user IDs)
- Collaborative filtering (recommendations based on similar users)
- RAG with embeddings for semantic search of movie/song descriptions
- Streaming responses (SSE) for real-time recommendation display
- Better soundtrack matching using dedicated soundtrack databases
- User preferences (favorite genres, etc.) stored in database

## 🧪 Testing

Run tests with:

```bash
npm test
```

Basic unit tests are included for cross-reference logic. More comprehensive E2E tests can be added using Playwright.

## 📦 Deployment to Vercel

1. **Push to GitHub**

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. **Deploy on Vercel**

- Go to [https://vercel.com](https://vercel.com)
- Import your GitHub repository
- Add environment variables in Vercel dashboard:
  - `OPENAI_API_KEY`
  - `TMDB_API_KEY`
  - `SPOTIFY_CLIENT_ID`
  - `SPOTIFY_CLIENT_SECRET`
  - `DATABASE_URL` (use Vercel's Postgres or keep SQLite for small scale)

3. **Run migrations on Vercel**

After deployment, you may need to run Prisma migrations. You can do this via Vercel's CLI or add a build script.

## 🎁 Bonus Features Implemented

- ✅ **Debug Panel**: Shows tool calls, API responses, and LLM reasoning
- ✅ **Feedback System**: Thumbs up/down on recommendations (database schema ready)
- ✅ **Testing**: Vitest configured with basic unit tests
- ✅ **Rate Limiting**: Handled via error messages and token caching
- ✅ **Accessibility**: Semantic HTML, keyboard navigation support

## 📄 License

This project is part of a technical challenge and is provided as-is.

## 🙏 Acknowledgments

- TMDB for movie data
- Spotify for music data
- OpenAI for AI capabilities
- Next.js and Vercel for the excellent framework and hosting
