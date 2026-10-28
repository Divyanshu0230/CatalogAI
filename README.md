# CatalogAI

CatalogAI is a shared product desk. I built it so a buyer can sign in, search a real catalog, and ask about what is listed without the answer drifting off into products that were never added.

Prices, stock, and counts come from PostgreSQL. A language model can read a sentence or draft copy, but it does not get to invent a row.

## Project overview

The catalog is one shared assortment. Anyone who is signed in can add or edit a product, and the activity log keeps the name of who did it. That felt closer to a buying desk than a private list per account.

A product has a name, brand, category, description, price, and image URL. I also keep SKU, stock, currency, tags, and a few attributes, because a shelf is hard to run on six fields alone.

What you can do:

- Register, sign in, and stay signed in with a refresh token
- Create, update, delete, and open a product
- Search by words, filter by brand, category, tag, and price, then sort and page through the list
- Ask in a sentence ("cheapest tea") and get back rows that are actually in the database
- Talk to Catalog Assistant AI, rewrite a thin description, and compare up to three products
- Import a CSV, and open a dashboard that counts thin listings, low stock, odd prices, and near-duplicate names

Demo accounts, all with password `Catalog123`:

| Account | What the sign-in card says |
| --- | --- |
| `demo1` | Demo 1, Buyer |
| `demo2` | Demo 2, Manager |
| `demo3` | Demo 3, Editor |

Click a card on the sign-in page. You do not have to type the password for those three.

## Catalog Assistant AI

This is the part I would show first. The assistant is a normal chat. It can take a greeting, a product question, and a goodbye, and the product answer is tied to a row.

I opened a new chat and sent three messages.

1. `hii`
2. `tell me about Brooke Bond Masala Tea`
3. `bye`

It greeted me back, then said there is 1 product and Brooke Bond Masala Tea is ₹165, with the card in the thread. Then it said bye. It did not make up a second tea or a different price.

![Chat with Catalog Assistant AI: hi, Masala Tea at ₹165, then bye](docs/screenshots/assistant-chat.png)

If Groq is down, or the key is missing, a greeting still gets a reply, and a search can still be read locally for prices, brands, and words like tea or shoes. Description drafting stops instead of inventing a paragraph.

## A look around

Sign in. The three demo cards are on the page, and the photos across the top are from the catalog.

![Sign in](docs/screenshots/sign-in.png)

After sign-in the home page asks you to start with one job: search in a sentence, ask the assistant, or rewrite a thin listing. The shelf is under that.

![Home](docs/screenshots/home.png)

Smart Search is where a sentence becomes a filter. "cheapest tea" came back as 2 products, ₹165 to ₹285: Masala Tea and Assam Tea Tin.

![Smart Search for cheapest tea](docs/screenshots/smart-search.png)

API docs are Swagger, on the same API, at `/api/docs/`. I did not host them on a second site.

## Technology stack

- Python, Django, Django REST Framework, JWT (`djangorestframework-simplejwt`)
- PostgreSQL, with `pg_trgm` so a fuzzy name can rank
- React, TypeScript, Vite
- OpenAPI through drf-spectacular
- Groq for the model calls. Fast model reads a query. Quality model writes copy
- Redis and Celery for the shelf scan
- Docker Compose for Postgres, Redis, the API, the worker, and the built frontend
- Gunicorn and WhiteNoise on the API, Nginx in front of the built React app
- GitHub Actions for tests, a Postgres migrate, and the frontend build
- Logging to the console and `backend/logs/vitrine.log`

```mermaid
flowchart LR
  subgraph desk [What you open]
    React[React]
  end
  subgraph api [API]
    Django[Django and DRF]
  end
  subgraph data [Data and jobs]
    PG[(PostgreSQL)]
    Redis[(Redis)]
    Worker[Celery worker]
  end
  Groq[Groq]
  React -->|REST and JWT| Django
  Django --> PG
  Django --> Groq
  Django -->|queue the scan| Redis
  Worker --> Redis
  Worker --> PG
```

## Architecture

Locally I run the React dev server and the Django server against PostgreSQL. Redis sits in Docker, and a Celery worker listens on it. The scan does not run inside the request when a worker is up.

When the whole stack is in Compose, Nginx serves the built frontend and proxies `/api` to Gunicorn, so the browser only talks to one origin.

```mermaid
flowchart TB
  Browser[Browser]
  subgraph compose [Docker Compose]
    Nginx[Nginx and the React build]
    Gunicorn[Gunicorn and Django]
    Worker[Celery worker]
    Redis[(Redis)]
    PG[(PostgreSQL)]
  end
  Groq[Groq]
  Browser --> Nginx
  Nginx -->|/api| Gunicorn
  Gunicorn --> PG
  Gunicorn --> Redis
  Gunicorn --> Groq
  Worker --> Redis
  Worker --> PG
```

The Django project is split the same way the desk is split.

| App | Job |
| --- | --- |
| `apps.accounts` | Register, login, refresh, and the signed-in profile |
| `apps.catalog` | Products, search, filters, import, collections, activity, the health scan |
| `apps.ai` | Search reading, chat, descriptions, product explain, collection brief |
| `config` | Settings, URLs, Swagger |

## System design

A request is authenticated with a JWT. Access lasts 12 hours, refresh lasts 7 days. The catalog endpoints are closed until you are signed in. Swagger and the health check are open so a reviewer can see the API shape.

Search has two doors.

- A short query goes to `GET /api/products/?q=`. One or two words must all match. Three or more words can match any of them. On PostgreSQL the match is a word boundary, so "hat" does not hit "that".
- A sentence goes to `POST /api/ai/search/`. The model is only allowed to return filters: brand, category, price bounds, leftover keywords, and a sort. Django checks those against brands and categories that exist, then PostgreSQL returns the rows. The sentence on the page is written from those rows.

The shelf scan is a Celery task, `scan_catalog`. It looks for near-duplicate names inside a brand, and for prices that sit far from the category median. The result is cached in Redis. The dashboard still computes the numbers itself if the cache is empty, so the page is not blank before the worker has run.

```mermaid
flowchart TD
  User[Signed-in buyer]
  User --> Products[Product CRUD and listing]
  User --> Search[Word search or sentence search]
  User --> Chat[Catalog Assistant AI]
  User --> Studio[Description draft]
  User --> Dash[Dashboard refresh]
  Products --> PG[(PostgreSQL)]
  Search --> Read{Sentence?}
  Read -->|yes| Groq[Groq returns filters only]
  Read -->|no| PG
  Groq --> PG
  Chat --> Groq
  Chat --> PG
  Studio --> Groq
  Dash --> Queue[Redis]
  Queue --> Worker[Celery scan_catalog]
  Worker --> PG
  Worker --> Cache[Redis cache]
```

## Low level

Sentence search, one request:

```mermaid
sequenceDiagram
  participant Buyer
  participant React
  participant API as Django
  participant Groq
  participant DB as PostgreSQL
  Buyer->>React: cheapest tea
  React->>API: POST /api/ai/search/
  API->>Groq: read the sentence, JSON only
  Groq-->>API: category, sort, keywords
  API->>DB: products that match those filters
  DB-->>API: Masala Tea 165, Assam Tea Tin 285
  API-->>React: those rows, plus a sentence built from them
  React-->>Buyer: 2 products, ₹165 to ₹285
```

Chat is the same idea, with the thread stored.

```mermaid
sequenceDiagram
  participant Buyer
  participant React
  participant API as Django
  participant Groq
  participant DB as PostgreSQL
  Buyer->>React: tell me about Brooke Bond Masala Tea
  React->>API: POST /api/ai/conversations/{id}/messages/
  API->>Groq: decide if this is talk or a lookup
  Groq-->>API: look it up
  API->>DB: matching product
  DB-->>API: Masala Tea, ₹165
  API-->>React: reply plus the product card
```

The scan, off the request:

```mermaid
sequenceDiagram
  participant Buyer
  participant API as Django
  participant Redis
  participant Worker as Celery
  participant DB as PostgreSQL
  Buyer->>API: refresh the dashboard
  API->>Redis: enqueue scan_catalog
  API-->>Buyer: current health payload
  Worker->>Redis: take the task
  Worker->>DB: duplicates and price outliers
  Worker->>Redis: store the payload
```

A price is called out when the category has at least four active products and the price is at least five times the median, or at most 15% of it.

## GenAI

Groq is the only provider. I use `openai/gpt-oss-20b` when the call has to be quick, and `openai/gpt-oss-120b` when it is writing copy.

There are two kinds of call, and both are grounded.

1. **Ask the desk.** The model returns filters only: brand, category, price bounds, leftover keywords, and sort. Those have to match brands and categories that exist. PostgreSQL runs the query. The line you read is built from the rows that came back, so a model cannot invent a count. If the key is missing, the call times out, or the JSON is junk, a local reader does the same job for prices, brands, and category words.
2. **Draft the story, or write a brief.** Given a name, brand, and category, the quality model drafts a headline, a short note, tags, and only attributes it can support: color, material, audience. Nothing is saved until you accept it. A collection brief only sees the products in that collection. If no model is configured, the brief is built from those rows and labeled that way. A description draft refuses instead of making copy up.

On a product page the same idea shows up as Explain, Audience, Rewrite, Questions, and Compare. Explain on a listing talks about that listing's price and category. It is not a general essay.

## Local setup

You need Python 3.12, Node 20, and PostgreSQL 16. Redis can be the Compose service below. Docker is how I run Redis. PostgreSQL can be your own server, or the `db` service in Compose.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Put your Groq key in `backend/.env`. Then:

```bash
python manage.py migrate
python manage.py seed_catalog
python manage.py runserver
```

In another terminal, start Redis if you want the background scan:

```bash
docker compose up -d redis
cd backend
source .venv/bin/activate
celery -A config worker --loglevel=info --pool=solo
```

Set `REDIS_URL=redis://localhost:6379/0` and `CELERY_TASK_ALWAYS_EAGER=0` in `.env` before you start Django, so the scan is queued instead of running inside the request. On macOS I use `--pool=solo` because the default process pool crashed before the task ran.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

API docs: http://localhost:8000/api/docs/

Admin: http://localhost:8000/admin/ after `python manage.py createsuperuser`. The demo accounts are not superusers.

Tests use SQLite, so they do not need Postgres:

```bash
cd backend
python manage.py test
```

`python manage.py migrate` against `DATABASE_URL` is what exercises PostgreSQL, including the trigram index.

Whole stack in Docker, including Postgres, the API, the worker, and the site on port 8080:

```bash
docker compose up --build
```

That Compose database is empty until the API boots with `SEED_ON_START=1`, which the backend service sets. Do not point it at a Postgres that is already serving this catalog on port 5432.

## Environment variables

Copy `backend/.env.example`.

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | JWT signing secret. Replace it before a public deploy. |
| `DJANGO_DEBUG` | `1` locally, `0` in public deploys. |
| `DATABASE_URL` | `postgres://user:pass@host:5432/vitrine` |
| `REDIS_URL` | `redis://host:6379/0`. Empty means the scan cache stays in process memory. |
| `CELERY_TASK_ALWAYS_EAGER` | `1` runs the shelf scan inside the request. `0` when a worker is up. |
| `ALLOWED_HOSTS` | Comma-separated hostnames. |
| `CORS_ORIGINS` | Frontend origins, comma-separated. |
| `CSRF_TRUSTED_ORIGINS` | Same origins, for the admin and unsafe requests. |
| `BEHIND_PROXY` | Set to `1` when TLS stops in front of Gunicorn. |
| `SEED_ON_START` | `1` on the first boot of an empty database. Leave it off after that. |
| `AI_PROVIDER` | `groq`. |
| `GROQ_API_KEY` | Key for chat, search reading, and product copy. |
| `GROQ_FAST_MODEL` | Default `openai/gpt-oss-20b`. Reads a search. |
| `GROQ_QUALITY_MODEL` | Default `openai/gpt-oss-120b`. Writes descriptions and briefs. |
| `VITE_API_URL` | Empty in local dev, so Vite proxies `/api`. Set it when the frontend is hosted on another origin. |

Restart the API after you change a key. `load_dotenv` does not override variables that are already in the process.

## Deployment

The app is packaged for a public host. I have not put it on one yet, so there is no live URL in this README until that deploy exists.

One machine, the path I would use first:

```bash
docker compose up --build
```

The site is on port 8080. Nginx serves the frontend and proxies `/api`, `/admin`, and `/static` to Django.

Split hosting, if the frontend and the API live apart:

- Frontend on Vercel or Netlify. Set `VITE_API_URL` to the public API origin at build time.
- API and the Celery worker on Render, Railway, or Cloud Run. Set `DJANGO_DEBUG=0`, a real `DJANGO_SECRET_KEY`, `ALLOWED_HOSTS`, `CORS_ORIGINS`, and `BEHIND_PROXY=1` when TLS ends in front of the process.
- Managed PostgreSQL for `DATABASE_URL`. The container entrypoint runs `migrate`. Set `SEED_ON_START=1` only for the first demo boot.
- Managed Redis for `REDIS_URL`, with `CELERY_TASK_ALWAYS_EAGER=0`, and a process running `celery -A config worker --loglevel=info`.

Swagger stays on the API at `/api/docs/`. The schema is `/api/schema/`.

GitHub Actions, in `.github/workflows/ci.yml`, runs on push and on pull requests. It runs the Django tests, migrates a Postgres 16 service, and builds the frontend.

## Key design decisions

- One shared assortment, not a private catalog per account. `created_by` and the activity log say who edited what. That matches a buying desk better than a toy database per user.
- The model interprets language. The database answers. If a model is allowed to list products, it will invent SKUs.
- Prices are INR, grouped the Indian way, because the seeded sheet is a mix of general merchandise and grocery.
- PostgreSQL trigram similarity ranks a fuzzy name. It does not decide the filter. Duplicate detection uses a name ratio inside the same brand, so the pair is stable and I can explain it.
- Celery scans are cached. The health page still computes immediately if the cache is cold, so the desk works before a worker is running.
- A page URL is not an image. The form accepts an `http` or `https` image, and it tells you when the link is an HTML page.
