// Same lazy-init pattern as config/plaid.js: build the client on first real
// use, not at require time, so a server without GEMINI_API_KEY set yet still
// boots and serves every other route — only an actual AI request fails, with
// a clear error, instead of the whole app refusing to start.

const { GoogleGenAI } = require("@google/genai");

let client = null;

function getGeminiClient() {
  if (client) return client;

  if (!process.env.GEMINI_API_KEY) {
    throw Object.assign(
      new Error(
        "GEMINI_API_KEY is not set. Add it to backend/.env — get a free key (no credit card, " +
          "1000+ requests/day) at https://aistudio.google.com/apikey."
      ),
      { status: 500 }
    );
  }

  client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

// Configurable so a model swap is a one-line .env edit, not a code change —
// which matters here: gemini-2.5-flash (this file's original default) turned
// out to already be retired for new users by the time this was actually
// tested against the live API, which named gemini-3.6-flash as its direct
// replacement. Model names in a fast-moving API are not something to trust
// as a hardcoded constant for long.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

module.exports = { getGeminiClient, MODEL };
