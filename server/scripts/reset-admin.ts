import { db } from "@db";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 32)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function resetAdminPassword() {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync("admin123", salt, 32) as Buffer;
  const hashedPassword = `${buf.toString("hex")}.${salt}`;
  
  await db.update(users)
    .set({ password: hashedPassword })
    .where(eq(users.username, "admin"));
}

resetAdminPassword().catch(console.error);
