# walletapp

A personal finance / expense tracker, built as a portfolio project to demonstrate
full-stack, security, and AI-integration skills.

## Structure

This is a monorepo with two independent apps — they don't share code or a
runtime, and each has its own `package.json`, dependencies, and dev server.

```
walletapp/
  backend/     Node.js + Express REST API (talks to PostgreSQL)
  frontend/    Next.js web app (talks to the backend over HTTP)
```

**Why two separate apps instead of one Next.js app with API routes?** Next.js can
do both frontend and backend in one project, but keeping a standalone Express API
demonstrates the ability to design and run a REST API independently of any
particular frontend framework — the kind of API another team's mobile app or a
third-party integration could also call. That's a common real-world setup and a
better resume signal than a framework's built-in API routes.

## Running locally

You'll need [Node.js](https://nodejs.org) (LTS) installed, plus a free
[Neon](https://neon.tech) Postgres database.

### Backend

```
cd backend
npm install
copy .env.example .env      # then fill in DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
npm run migrate             # creates the database tables
npm run dev                 # starts the API on http://localhost:4000
```

### Frontend

```
cd frontend
npm install
copy .env.local.example .env.local
npm run dev                 # starts the web app on http://localhost:3000
```

See `backend/.env.example` for how to generate `JWT_SECRET` and `ENCRYPTION_KEY`.
