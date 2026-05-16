const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createAuthToken,
  hashPassword,
  normalizeEmail,
  normalizeRole,
  sanitizeUser,
  verifyAuthToken,
  verifyPassword
} = require("../server");

test("password hashes are salted and verifiable", () => {
  const first = hashPassword("secret123");
  const second = hashPassword("secret123");

  assert.notEqual(first, second);
  assert.equal(verifyPassword("secret123", first), true);
  assert.equal(verifyPassword("wrong-password", first), false);
});

test("legacy sha256 password hashes still verify", () => {
  const legacyHash = "fcf730b6d95236ecd3c9fc2d92d7b6b2bb061514961aec041d6c7a7192f592e4";

  assert.equal(verifyPassword("secret123", legacyHash), true);
});

test("auth tokens round-trip and reject tampering", () => {
  const token = createAuthToken({ email: "User@Example.com" });
  const auth = verifyAuthToken(token);

  assert.deepEqual(auth, { email: "user@example.com" });
  assert.equal(verifyAuthToken(token.replace(/\.$/, "") + "tampered"), null);
});

test("public user shape never exposes password hashes", () => {
  const user = sanitizeUser({
    id: "u_1",
    first_name: "Ravi",
    last_name: "Kumar",
    email: "ravi@example.com",
    password_hash: "secret",
    role: "Client"
  });

  assert.equal(user.passwordHash, undefined);
  assert.equal(user.password_hash, undefined);
  assert.equal(user.profile.role, "Client");
});

test("normalizers keep identity and role input predictable", () => {
  assert.equal(normalizeEmail("  TEST@Example.COM "), "test@example.com");
  assert.equal(normalizeRole("client"), "Client");
  assert.equal(normalizeRole("anything else"), "Freelancer");
});
