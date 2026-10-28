# CatalogAI

CatalogAI is a shared product desk with GenAI built into the work, not pasted on as one extra button. You can search in a sentence, talk to Catalog Assistant AI, draft a thin listing in AI Studio, and on a single product ask it to explain, name an audience, rewrite, suggest questions, or compare. A collection can get a short buying note from the products already in that set.

The model reads what you typed and drafts words. Prices, stock, and counts still come from PostgreSQL, so an answer cannot drift off into a product that was never added. Groq is the only provider. If it is down, a search can still be read locally. A description draft stops instead of making a paragraph up.

If you are reviewing the assignment, these are the three links.

- Live site: https://catalogai-jpcb.onrender.com
- GitHub: https://github.com/Divyanshu0230/CatalogAI
- API docs: https://catalogai-api-0uij.onrender.com/api/docs/

The API address by itself also opens those docs. I did not put Swagger on a second website.

The walkthrough below plays on this page. It is silent. Use the play and pause controls on the player. I sign in as Demo 1, then the rest is the GenAI work. Smart Search reads "cheapest tea" and returns the two teas with their prices. Explain AI on Masala Tea writes from the saved price and stock. Catalog Assistant AI takes a hello, then "cheapest tea", and puts both tea cards in the thread. AI Studio drafts a new title, description, and tags, and I leave that draft unsaved. The dashboard is the last moment.

https://github.com/user-attachments/assets/233aad27-5e53-4f2f-8680-e4142fa9f366

## Project overview

The catalog is one shared assortment, and the GenAI features all sit on that same assortment. Anyone who is signed in can add or edit a product, and the activity log keeps the name of who did it. That felt closer to a buying desk than a private list per account.

Smart Search, Catalog Assistant AI, AI Studio, the five jobs on a product page, and the collection brief do not keep a second list of products. They ask Groq to read a sentence or draft some words, then they show what PostgreSQL already has. If you add a tea tomorrow, the next "cheapest tea" can find it. If you delete it, the assistant cannot keep talking about it.

A product has a name, brand, category, description, price, and image URL. I also keep SKU, stock, currency, tags, and a few attributes, because a shelf is hard to run on six fields alone.

A normal pass through the desk looks like this. You sign in, the shelf is under the three jobs on the home page, and you can filter that shelf by brand, category, tag, and price, then sort it and page through it. If you already know the words, the search box is enough. If you would rather say "cheapest tea" or "Nike jackets under 9000", Smart Search turns that sentence into a filter and PostgreSQL returns the rows. If you want to talk, Catalog Assistant AI keeps the thread. If a listing is thin, AI Studio drafts a description and you decide whether to save it. On the product page the same idea is smaller: explain this one, say who it is for, rewrite it, suggest questions, or compare it with two others. The dashboard is the unglamorous part. It counts thin listings, low stock, odd prices, and names that look like duplicates.

You can also register your own account, add a product, edit it, delete it, and import a CSV when a sheet arrives as a file. The activity log stores who did the edit.

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

Smart Search is where a sentence becomes a filter. "cheapest tea" came back as 2 products, ₹165 to ₹285: Masala Tea and Assam Tea Tin. The same pass is in the silent walkthrough above: the shelf, that search, the product explanation, the chat, AI Studio, and the dashboard.

![Smart Search for cheapest tea](docs/screenshots/smart-search.png)

API docs are Swagger, on the same API, at `/api/docs/`. I did not host them on a second site.

## Technology stack

Django holds the catalog. Groq is the only model, and it is called from the API, never from the browser. React is where you type the sentence, the chat, and the draft.

- Python, Django, Django REST Framework, JWT (`djangorestframework-simplejwt`)
- PostgreSQL, with `pg_trgm` so a fuzzy name can rank
- React, TypeScript, Vite
- OpenAPI through drf-spectacular
- Groq for the model calls. A search tries the quicker model first. A description starts with the larger one, and a failed call falls through to the next model
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

Locally I run the React dev server and the Django server against PostgreSQL. A GenAI request never stops in the browser. React posts to Django, Django calls Groq, and Django is the one that decides whether the reply is allowed to mention a product. Redis sits in Docker, and a Celery worker listens on it. The scan does not run inside the request when a worker is up. The assistant and Smart Search do not use that queue. They answer in the request, because you are waiting for the sentence.

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

Chat, AI Studio, a product explanation, and a collection brief are the other GenAI doors. Chat decides first whether you are just talking or whether you want a lookup. Studio and the product jobs only draft text from fields you already saved, and nothing is written until you accept it. The collection brief only sees the products inside that collection.

The shelf scan is a Celery task, `scan_catalog`. It looks for near-duplicate names inside a brand, and for prices that sit far from the category median. That scan is rules, not a model. The result is cached in Redis. The dashboard still computes the numbers itself if the cache is empty, so the page is not blank before the worker has run.

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

These are the two GenAI calls I would trace if I were checking that the model cannot invent a row. The first is Smart Search. The second is the assistant looking up one product. The dashboard scan under them is separate, and it does not call Groq.

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

This is the part I would want read carefully, because it is more than one button. I use Groq, and only Groq. The key stays on the API. The browser never sees it.

I split the work the way a person at the desk would. Sometimes you are trying to find what is already listed. Sometimes you are trying to write about one listing. The model is allowed to read language and draft words. It is not allowed to be the catalog.

**Smart Search.** You type a sentence instead of filling brand, category, and price by hand. The one I use to check it is "cheapest tea". A fast call comes back as filters only: the category Grocery, the leftover word tea, and sort by price. If the model names a brand or a category that is not already on the sheet, I drop it. PostgreSQL runs what is left. The sentence on the screen is built from those rows, so the count is the number of products that matched, not a number the model felt like saying. For that query it is 2 products, Brooke Bond Masala Tea at ₹165 and Brooke Bond Assam Tea Tin at ₹285.

The same door understands a budget. "running shoes under ₹9,000" or "headphones under ₹5,000" becomes a price ceiling. "premium watches above ₹50,000" becomes a floor. "Nike jackets" becomes a brand plus a word. If Groq is down, the key is missing, or the JSON is junk, a local reader still catches under, above, between, rupees, and the brand and category names. The search still returns rows. It just says the reading was local.

**Catalog Assistant AI.** This is a chat, and the chats stay in the list on the left. I open a new one and talk to it in three steps, because that is how you can tell it is not a search box with a costume.

1. `hii` is only a greeting. It answers in one line and does not go looking for a product.
2. `tell me about Brooke Bond Masala Tea` is a lookup. It says there is 1 product, Brooke Bond Masala Tea is ₹165, and the card for that product is in the thread.
3. `bye` is a goodbye. It does not invent a second tea on the way out.

A product reply is checked before I show it. If it names a price or a product that was not in the rows just fetched, I throw that sentence away and show the line built from the database instead. Up to six products can come back with the reply.

A few questions never need a model. "what is low on stock?" lists active products whose stock is 5 or less and names the first few. If you just looked at a handful of products and ask which is cheaper, the lower price is calculated from those saved prices. The model does not get to crown a product that is not on the screen.

The date and the time, if you ask, come from the clock in Asia/Kolkata. I pass today's date into the call so it does not guess.

**AI Studio.** This is for a listing that is still thin. You give a name, a brand, and a category. The larger model drafts a headline, a description, tags, and only three attributes: color, material, and audience. If it suggests a category, I keep the suggestion only when that category already exists. You read the draft and you save it yourself. Closing the panel does not write anything. If there is no key, this screen stops and says so. I would rather show an empty description than a made-up one.

**On one product.** Open a product and there are five smaller jobs. Each one is handed only the fields already stored on that row, and on the others if you are comparing.

- Explain writes two or three sentences a shopper could read about this listing.
- Audience says who it fits, from the category, the price, and the description.
- Rewrite drafts a 40 to 70 word description and four tags. Saving it is still your click.
- Questions offers four things a shopper might ask before buying.
- Compare talks about this product and the others using their stored names and prices.

If a draft contains a long number that is not already on the listing, I reject the draft. That catches a model inventing a specification.

**A collection brief.** A collection is a set you already picked, such as the monsoon desk. The model writes a short buying note, and it only sees the products in that set. If Groq is unavailable, the note is assembled from those names and prices and marked as a local note, so you can tell the difference.

**Which model, and what I do when one fails.** A search has to come back quickly, so that call tries Qwen first, then GPT-OSS 20B, then GPT-OSS 120B. Writing is the opposite. A description, a brief, or a product explanation starts with GPT-OSS 120B, then falls through to the others if that call fails. Every call asks for a JSON object, with temperature at 0. If the shape is wrong, I do not paste the raw text onto the page.

That is the rule I kept coming back to. The model can read what you typed, and it can draft words. A product, a price, and a count come from PostgreSQL.

## Local setup

You need Python 3.12, Node 20, and PostgreSQL 16. Redis can be the Compose service below. Docker is how I run Redis. PostgreSQL can be your own server, or the `db` service in Compose.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Put your Groq key in `backend/.env`. That key is what turns on Smart Search, the assistant, AI Studio, the product jobs, and the collection brief. Without it, a sentence search still runs through the local reader, and a greeting still gets a reply. Drafting a description stops. Then:

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

Copy `backend/.env.example`. The three Groq lines are the GenAI configuration. `GROQ_API_KEY` is required for the live assistant and for AI Studio. The two model names are only the fallbacks. A search still tries Qwen first.

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
| `GROQ_FAST_MODEL` | Default `openai/gpt-oss-20b`. Used when a search needs a second try. |
| `GROQ_QUALITY_MODEL` | Default `openai/gpt-oss-120b`. Writes descriptions, briefs, and product explanations. |
| `VITE_API_URL` | Empty in local dev, so Vite proxies `/api`. Set it when the frontend is hosted on another origin. |

Restart the API after you change a key. `load_dotenv` does not override variables that are already in the process.

## Deployment

The live site is [https://catalogai-jpcb.onrender.com](https://catalogai-jpcb.onrender.com).

The repository is [https://github.com/Divyanshu0230/CatalogAI](https://github.com/Divyanshu0230/CatalogAI).

The API is [https://catalogai-api-0uij.onrender.com](https://catalogai-api-0uij.onrender.com). That address opens the docs. Swagger is also at [https://catalogai-api-0uij.onrender.com/api/docs/](https://catalogai-api-0uij.onrender.com/api/docs/). The schema is [https://catalogai-api-0uij.onrender.com/api/schema/](https://catalogai-api-0uij.onrender.com/api/schema/).

Both run on Render, in Singapore. The site is the React build, served as a static site, so the page itself does not spin down. The API is a Python web service on the free instance, in front of a free Postgres 16 database. The same GenAI is on that host. Sign in and you can run Smart Search, open a chat, and draft a listing. The Groq key is set on the API only. I built the frontend with `VITE_API_URL` set to that API origin. `DJANGO_DEBUG` is `0`, `BEHIND_PROXY` is `1`, and the API allows the static site origin.

The shared demo accounts on that database are demo1, demo2, and demo3. The password is Catalog123.

The free API sleeps after 15 minutes with no requests. The next request takes about a minute while Render wakes it. After that it stays up for as long as people are using it. The free database expires on 27 November 2026, thirty days after I created it. That covers this review.

I did not put Redis on the public host. `CELERY_TASK_ALWAYS_EAGER=1` there, so the shelf scan runs inside the request. On my machine I still run Redis and a Celery worker. The public start command migrates, then seeds only when the product table is empty, so a restart does not wipe later edits.

Docker Compose is still the one-machine path:

```bash
docker compose up --build
```

That site is on port 8080. Nginx serves the frontend and proxies `/api`, `/admin`, and `/static` to Django. `SEED_ON_START=1` in that file is for an empty Compose database.

GitHub Actions, in `.github/workflows/ci.yml`, runs on push and on pull requests. It runs the Django tests, migrates a Postgres 16 service, and builds the frontend.

## Key design decisions

I kept one shared assortment. Anyone signed in can edit a product, and the activity log stores who did it. A private catalog per account would have been easier to fake, and it would not feel like a desk where buyers look at the same shelf.

The model interprets language. The database answers. I tried the other way in my head, letting the model list products, and it will invent a SKU the moment the prompt is loose. So Smart Search may only return filters, the assistant may only talk about rows that were just loaded, AI Studio may only draft from the name, brand, and category you typed, and a product explanation may only use the fields already saved on that row. That same rule is why there are several GenAI features and still one catalog.

Prices are in INR, grouped the Indian way, because the seeded sheet mixes grocery with everything else. A tea at ₹165 and a chair at ₹4,990 should read like prices you would see here.

PostgreSQL trigram similarity can rank a fuzzy name. It does not decide which rows qualify. "hat" must not match "that", so the word search uses a word boundary. Duplicate detection compares names inside the same brand, which keeps the pair explainable on the dashboard.

The shelf scan can run in Celery and sit in Redis. The dashboard still computes the numbers itself when the cache is empty, which is also how the public site works, because I did not put Redis on the free host. A price is flagged when its category has at least four active products and the price is at least five times the median, or at most 15% of it.

An image has to be an image URL. If you paste a page that ends in `.html`, the form tells you. I do not fetch that page from the server. A data URL for a JPEG is accepted, because it is already an image.
