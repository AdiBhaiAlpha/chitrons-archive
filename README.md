# Chitrons Archive

A minimalist personal digital archive for Chitron Bhattacharjee — AI developer, programmer, designer and writer from Bangladesh.

## Overview

**Chitrons Archive** is a clean, fast, typography-focused personal website and blog. The public frontend is a static site deployable on GitHub Pages, while the backend API runs separately and connects to MongoDB Atlas.

### Architecture

```
GitHub Pages (static frontend)
       ↓
  External API (Node.js + Express)
       ↓
  MongoDB Atlas
```

- **Frontend**: HTML, CSS, Vanilla JavaScript — no build step, no frameworks
- **Backend**: Node.js, Express.js, MongoDB via Mongoose
- **Admin**: PIN-authenticated CMS at `/admin/`

---

## Project Structure

```
chitrons-archive/
├── index.html              # Home page
├── about.html              # About page
├── writing.html            # Blog archive
├── post.html               # Single post page
├── 404.html                # Custom 404
├── feed.xml                # RSS feed
├── robots.txt              # Search engine directives
├── sitemap.xml             # XML sitemap
├── css/
│   └── style.css           # Complete design system
├── js/
│   ├── config.js           # API base URL configuration
│   ├── api.js              # Centralized API client
│   ├── main.js             # Header, nav, theme, SEO helpers
│   ├── home.js             # Home page logic
│   ├── writing.js          # Writing archive logic
│   ├── post.js             # Single post logic
│   └── admin.js            # Admin panel logic
├── admin/
│   └── index.html          # Admin CMS
├── backend/
│   ├── .env                # Environment variables (DO NOT COMMIT)
│   ├── package.json
│   ├── server.js           # Express server
│   ├── models/
│   │   ├── BlogPost.js
│   │   ├── Revision.js
│   │   └── Media.js
│   ├── middleware/
│   │   └── auth.js
│   └── routes/
│       ├── auth.js         # PIN authentication
│       ├── posts.js        # Public read-only API
│       └── admin.js        # Protected admin API
├── .gitignore
└── README.md
```

---

## Requirements

- Node.js 18+
- MongoDB Atlas account (or local MongoDB for development)
- GitHub account (for frontend hosting)

---

## Installation

### 1. Clone / Download

```bash
git clone https://github.com/USERNAME/chitrons-archive.git
cd chitrons-archive
```

### 2. Backend Setup

```bash
cd backend
npm install
```

### 3. Environment Variables

Edit `backend/.env`:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/chitrons-archive?retryWrites=true&w=majority
ADMIN_PIN=2448766
SESSION_SECRET=your-random-secret-string-here
PORT=3000
FRONTEND_URL=https://USERNAME.github.io
```

**Never commit `.env` to version control.**

### 4. Start Backend

```bash
cd backend
npm start
```

The API will run at `http://localhost:3000`.

---

## Frontend Configuration

Edit `js/config.js`:

```javascript
const API_BASE_URL = 'https://your-backend-url.onrender.com';
```

This should point to your deployed backend API.

---

## GitHub Pages Deployment

1. Create a GitHub repository
2. Push the frontend files (everything except `backend/`)
3. Go to **Settings → Pages**
4. Select **Deploy from a branch**
5. Select branch: `main`, folder: `/ (root)`
6. Save
7. Your site will be live at `https://USERNAME.github.io/REPOSITORY/`

### Before deploying, update these placeholders:

- `robots.txt`: Replace `USERNAME` and `REPOSITORY`
- `sitemap.xml`: Replace `USERNAME` and `REPOSITORY`
- `feed.xml`: Replace `USERNAME` and `REPOSITORY`
- All HTML files: Replace `USERNAME/REPOSITORY` in canonical URLs and meta tags
- `js/config.js`: Set the actual backend API URL

---

## Backend Deployment (Render)

1. Create a [Render](https://render.com) account
2. Create a new **Web Service**
3. Connect your GitHub repository
4. Set the **Root Directory** to `backend`
5. Set **Build Command**: `npm install`
6. Set **Start Command**: `npm start`
7. Add environment variables:
   - `MONGODB_URI` — your MongoDB Atlas connection string
   - `ADMIN_PIN` — your admin PIN
   - `SESSION_SECRET` — a random secret string
   - `FRONTEND_URL` — your GitHub Pages URL
   - `NODE_ENV` — `production`
8. Deploy

---

## Admin Panel

Access the admin at: `https://USERNAME.github.io/REPOSITORY/admin/`

### Login

Enter the PIN configured in your backend's `ADMIN_PIN` environment variable.

### Features

- **Dashboard**: Overview of posts, stats
- **Posts**: Create, edit, publish, unpublish, schedule, trash, restore, permanently delete, duplicate
- **Rich Text Editor**: Bold, italic, headings, lists, blockquotes, code blocks, links, images, undo/redo
- **Autosave**: Drafts auto-save every 30 seconds
- **Revisions**: Previous versions are saved when editing posts
- **Labels/Tags**: Organize posts with labels
- **SEO**: Custom SEO title and description per post
- **Scheduling**: Schedule posts for future publication
- **Bulk Actions**: Select and act on multiple posts

### Security

- PIN is verified server-side only
- PIN is never stored in frontend code
- Rate limiting on login attempts (5 per 15 minutes)
- Session-based authentication
- All admin API endpoints require authentication

---

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/posts` | List published posts (search, filter, sort, paginate) |
| GET | `/api/posts/:slug` | Get single published post |
| GET | `/api/posts/nav/:slug` | Get previous/next post navigation |
| GET | `/api/posts/categories` | List categories |
| GET | `/api/posts/labels` | List labels with counts |

### Admin (require authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with PIN |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Check auth status |
| GET | `/api/admin/stats` | Dashboard statistics |
| GET | `/api/admin/posts` | List all posts (any status) |
| GET | `/api/admin/posts/:id` | Get single post (any status) |
| POST | `/api/admin/posts` | Create post |
| PUT | `/api/admin/posts/:id` | Update post |
| DELETE | `/api/admin/posts/:id` | Move to trash |
| POST | `/api/admin/posts/:id/publish` | Publish post |
| POST | `/api/admin/posts/:id/unpublish` | Unpublish post |
| POST | `/api/admin/posts/:id/restore` | Restore from trash |
| DELETE | `/api/admin/posts/:id/permanent` | Permanent delete |
| POST | `/api/admin/posts/:id/duplicate` | Duplicate post |
| GET | `/api/admin/revisions/:postId` | Get post revisions |
| POST | `/api/admin/revisions/:id/restore` | Restore revision |

### Query Parameters (GET /api/posts)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `search` | - | Full-text search |
| `category` | - | Filter by category |
| `tag` | - | Filter by label |
| `sort` | `newest` | `newest` or `oldest` |
| `page` | `1` | Page number |
| `limit` | `10` | Posts per page |

---

## SEO

### Implemented

- Unique title tags per page
- Unique meta descriptions per page
- Canonical URLs
- Open Graph metadata (og:title, og:description, og:type, og:url, og:site_name)
- Twitter/X Card metadata
- JSON-LD structured data (Person, WebSite, BlogPosting, BreadcrumbList, CollectionPage)
- Semantic HTML (header, nav, main, article, section, footer)
- robots.txt
- sitemap.xml
- RSS feed (feed.xml)
- Internal linking (Home → Writing → About)
- Author entity consistency
- Mobile-responsive design
- Fast loading (no frameworks, minimal JS)

### SEO Setup Steps

1. Replace all `USERNAME/REPOSITORY` placeholders in HTML, robots.txt, sitemap.xml, feed.xml
2. Submit sitemap to Google Search Console
3. Verify ownership in Google Search Console
4. Request indexing for key pages
5. Add the website URL to your GitHub profile bio
6. Use consistent "Chitron Bhattacharjee" spelling across the web

### Google Search Console Setup

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property → URL prefix → Enter your GitHub Pages URL
3. Verify using HTML tag or DNS
4. Go to Sitemaps → Submit `sitemap.xml`
5. Use URL Inspection → Enter homepage URL → Request Indexing
6. Monitor performance in the Performance tab

---

## Design Principles

- Extremely minimalist
- Typography-focused
- Warm neutral palette (off-white, near-black, muted gray)
- One restrained accent color
- Generous whitespace
- Dark mode with localStorage persistence
- Respects `prefers-color-scheme`
- Subtle hover states
- No unnecessary animations
- `prefers-reduced-motion` support

---

## License

Personal project of Chitron Bhattacharjee.
