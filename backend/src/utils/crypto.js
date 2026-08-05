// Encrypts/decrypts individual sensitive fields (e.g. a bank account number) before
// they go into the database, using Node's built-in `crypto` module — no extra
// package needed.
//
// Why encrypt at all, when the whole database connection is already over SSL and
// Neon encrypts its disks? Those protect data "in transit" and "at rest on the
// provider's disk." They do NOT protect against someone who gets read access to the
// database itself (a leaked connection string, a misconfigured backup, a malicious
// insider, a SQL injection bug elsewhere in the app). Encrypting specific sensitive
// columns ourselves means even a full database dump doesn't expose that data in
// plain text — you'd also need JWT_SECRET... no, you'd need ENCRYPTION_KEY, which
// lives only in the server's environment variables, never in the database.
//
// This is "application-level encryption," and it's why bcrypt (for passwords) and
// this AES module (for other sensitive fields) are separate tools: passwords are
// never decrypted (you only ever check "does this match?"), so they use a one-way
// hash. Things like a bank account number DO need to be recovered later to show the
// user or send to Plaid, so they use two-way encryption instead.
//
// Algorithm: AES-256-GCM.
//   - AES-256 = a well-vetted symmetric cipher with a 256-bit key.
//   - GCM = a mode that also produces an "auth tag," a checksum proving the
//     ciphertext wasn't tampered with after encryption. Without it, an attacker with
//     write access to the database could flip bits in the ciphertext and you'd
//     silently decrypt garbage instead of noticing.
//   - Every encryption uses a fresh random IV (initialization vector) so encrypting
//     the same value twice never produces the same ciphertext twice — that alone
//     would leak information (e.g. "these two users have the same phone number").

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // bytes; 96-bit IV is the recommended size for GCM

function getKey() {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a 32-byte value encoded as 64 hex characters.");
  }
  return key;
}

/**
 * Encrypts a plaintext string.
 * @param {string} plaintext
 * @returns {string} a single string combining iv, authTag, and ciphertext
 *   (all base64), joined with ":" so it can be stored in one text column.
 */
function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/**
 * Reverses `encrypt`.
 * @param {string} payload the string produced by `encrypt`
 * @returns {string} the original plaintext
 */
function decrypt(payload) {
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = String(payload).split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted payload.");
  }

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

module.exports = { encrypt, decrypt };
