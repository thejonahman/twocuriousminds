import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema } from "@db/schema";
import { db, pool } from "@db";
import { eq } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

// Define the AuthenticatedRequest type
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    email: string;
    isAdmin: boolean;
  };
}

// Create asyncHandler wrapper for async route handlers
export const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return Promise.resolve(fn(req as AuthenticatedRequest, res, next)).catch(next);
  };
};

// Create requireAuth middleware
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  // Debug log to track auth state
  console.log('Auth check - session:', req.session);
  console.log('Auth check - user:', req.user);

  if (!req.isAuthenticated || !req.isAuthenticated()) {
    console.log('Auth check failed - not authenticated');
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
  console.log('Setting up authentication...');

  // Create session store
  const store = new PostgresSessionStore({
    pool,
    createTableIfMissing: true,
    tableName: 'session',
    pruneSessionInterval: 60
  });

  // Configure session middleware
  const sessionMiddleware = session({
    store,
    secret: process.env.REPL_ID || 'fallback-secret-key',
    name: 'connect.sid',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    },
  });

  // Initialize session middleware first
  app.use(sessionMiddleware);

  // Initialize passport and session AFTER session middleware
  app.use(passport.initialize());
  app.use(passport.session());

  // Set up passport strategy
  passport.use(new LocalStrategy(async (username, password, done) => {
    try {
      const [user] = await getUserByUsername(username);

      if (!user) {
        return done(null, false);
      }

      const isValid = await comparePasswords(password, user.password);
      if (!isValid) {
        return done(null, false);
      }

      return done(null, user);
    } catch (error) {
      console.error("Login error:", error);
      return done(error);
    }
  }));

  passport.serializeUser((user: any, done) => {
    console.log('Serializing user:', user.id);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      console.log('Deserializing user:', id);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) {
        console.log('No user found during deserialization');
        return done(null, false);
      }

      console.log('User deserialized successfully');
      done(null, user);
    } catch (error) {
      console.error('Deserialization error:', error);
      done(error);
    }
  });

  // Auth endpoints must be registered AFTER passport setup
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

  app.get("/api/user", requireAuth, (req, res) => {
    res.json(req.user);
  });

  console.log('Authentication setup completed');
  return sessionMiddleware;
}