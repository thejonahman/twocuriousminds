import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, type SelectUser } from "@db/schema";
import { db, pool } from "@db";
import { eq } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 32)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  try {
    // Handle bcrypt passwords from existing database
    if (stored.startsWith('$2b$')) {
      // Return false for now as we'll update these passwords
      return false;
    }

    const [hashedPassword, salt] = stored.split(".");
    const buf = (await scryptAsync(supplied, salt, 32)) as Buffer;
    const storedBuf = Buffer.from(hashedPassword, "hex");

    if (buf.length !== storedBuf.length) {
      console.error(`Buffer length mismatch: ${buf.length} vs ${storedBuf.length}`);
      return false;
    }

    return timingSafeEqual(buf, storedBuf);
  } catch (error) {
    console.error("Password comparison error:", error);
    return false;
  }
}

async function getUserByUsername(username: string) {
  return db.select().from(users).where(eq(users.username, username)).limit(1);
}

export function setupAuth(app: Express) {
  const store = new PostgresSessionStore({ pool, createTableIfMissing: true });
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID!,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
      secure: app.get("env") === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log(`Attempting login for user: ${username}`);
        const [user] = await getUserByUsername(username);

        if (!user) {
          console.log(`User not found: ${username}`);
          return done(null, false);
        }

        const isValid = await comparePasswords(password, user.password);
        console.log(`Password validation result: ${isValid}`);

        if (!isValid) {
          return done(null, false);
        }

        return done(null, user);
      } catch (error) {
        console.error("Login error:", error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    const result = insertUserSchema.safeParse(req.body);
    if (!result.success) {
      const error = fromZodError(result.error);
      return res.status(400).send(error.toString());
    }

    const [existingUser] = await getUserByUsername(result.data.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    try {
      const hashedPassword = await hashPassword(result.data.password);
      const [user] = await db
        .insert(users)
        .values({
          ...result.data,
          password: hashedPassword,
        })
        .returning();

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}