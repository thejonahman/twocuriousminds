import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';
import { db } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';

const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 32));
  return `${buf.toString("hex")}.${salt}`;
}

async function main() {
  const hashedPassword = await hashPassword('admin123');
  console.log(hashedPassword);
}

main().catch(console.error);