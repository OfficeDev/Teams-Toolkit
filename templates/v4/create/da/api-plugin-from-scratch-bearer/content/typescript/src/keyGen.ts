import crypto from "crypto";

// Define the length of the random string
const KEY_LENGTH = 12;

// Generate random bytes
const bytes: Buffer = crypto.randomBytes(KEY_LENGTH);

// Convert the random bytes to a string using base64 encoding, and trim the result to the desired length
const key: string = bytes.toString("base64").slice(0, KEY_LENGTH);

console.log(`Generated a new API Key: ${key}`);
