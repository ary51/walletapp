// This file builds the Express "app" (the middleware pipeline + routes) but doesn't
// start it listening — that's server.js's job. Splitting them this way means tests
// can import `app` and hit it directly without opening a real network port.

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.routes");

const app = express();

// helmet sets a handful of HTTP response headers that block common attacks
// (e.g. stopping the browser from guessing/"sniffing" a response's content type
// in a way that could be exploited). Cheap to add, standard practice.
app.use(helmet());

// Browsers block a webpage on one origin (http://localhost:3000, our Next.js app)
// from calling an API on a different origin (http://localhost:4000, this Express
// app) unless the API explicitly allows it via CORS headers. This only relaxes
// that rule for the one origin we trust, set in CORS_ORIGIN.
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);

// Parses incoming JSON request bodies into `req.body`. Without this, req.body
// would be undefined for a normal `fetch(..., { body: JSON.stringify(...) })` call.
app.use(express.json());

// Logs each incoming request (method, path, status, response time) to the console.
// "dev" is a concise, colored format meant for local development.
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// A simple endpoint with no logic, just to confirm the server is up and reachable.
// Useful while wiring up the frontend, and later as a target for uptime checks.
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);

// Catch-all for routes that don't exist.
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Express recognizes an error-handling middleware by its 4 arguments. Any
// `next(err)` call (or a thrown error inside an async route wrapped correctly)
// ends up here instead of crashing the process or leaking a stack trace to the
// client.
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

module.exports = app;
