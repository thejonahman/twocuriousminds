import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, type SelectUser } from "@db/schema";
import { db, pool } from "@db";
import { eq } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

// Create requireAuth middleware
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  console.log('Auth check - isAuthenticated:', req.isAuthenticated());
  console.log('Auth check - session:', req.session);
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 32)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  try {
    const [hashedPassword, salt] = stored.split(".");
    const buf = (await scryptAsync(supplied, salt, 32)) as Buffer;
    const storedBuf = Buffer.from(hashedPassword, "hex");
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
  // Create session store without automatic table creation
  const store = new PostgresSessionStore({
    pool,
    createTableIfMissing: false,
    tableName: 'session'
  });

  // Configure session middleware with updated settings for WebSocket support
  const sessionMiddleware = session({
    store,
    secret: process.env.REPL_ID || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/' // Ensure cookie is sent for all paths including WebSocket
    },
    name: 'session', // Explicit session cookie name
  });

  // Set up session handling
  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure local strategy for username/password auth
  passport.use(new LocalStrategy(async (username, password, done) => {
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

      // Convert user.id to string to match Express.User interface
      const userWithStringId = {
        ...user,
        id: user.id.toString()
      };

      return done(null, userWithStringId);
    } catch (error) {
      console.error("Login error:", error);
      return done(error);
    }
  }));

  // Serialize user into the session - use string ID
  passport.serializeUser((user, done) => {
    console.log('Serializing user:', user.id);
    done(null, user.id);
  });

  // Deserialize user from the session - parse string ID back to number
  passport.deserializeUser(async (id: string, done) => {
    try {
      console.log('Deserializing user:', id);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, parseInt(id)))
        .limit(1);

      if (!user) {
        console.log('User not found during deserialization:', id);
        return done(null, false);
      }

      // Convert user.id to string to match Express.User interface
      const userWithStringId = {
        ...user,
        id: user.id.toString()
      };

      done(null, userWithStringId);
    } catch (error) {
      console.error('Deserialization error:', error);
      done(error);
    }
  });

  // Auth endpoints
  app.post("/api/register", async (req, res, next) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        const error = fromZodError(result.error);
        return res.status(400).send(error.toString());
      }

      const [existingUser] = await getUserByUsername(result.data.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      const hashedPassword = await hashPassword(result.data.password);
      const [user] = await db
        .insert(users)
        .values({
          username: result.data.username,
          email: result.data.email,
          password: hashedPassword,
          isAdmin: false,
        })
        .returning();

      // Convert user.id to string before login
      const userWithStringId = {
        ...user,
        id: user.id.toString()
      };

      req.login(userWithStringId, (err) => {
        if (err) return next(err);
        res.status(201).json(userWithStringId);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    console.log('Login successful. User:', req.user);
    res.status(200).json(req.user);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", requireAuth, (req, res) => {
    console.log('GET /api/user - isAuthenticated:', req.isAuthenticated());
    console.log('Session:', req.session);
    console.log('User:', req.user);
    res.json(req.user);
  });

  return sessionMiddleware;
}