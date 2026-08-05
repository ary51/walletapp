// Entry point: this is the file you actually run (`node server.js` or `npm run dev`).
// It loads environment variables, then starts the Express app listening on a port.

require("dotenv").config();

const app = require("./src/app");

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`walletapp backend listening on http://localhost:${PORT}`);
});
