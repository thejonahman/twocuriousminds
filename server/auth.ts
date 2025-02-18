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
import jwt from 'jsonwebtoken';

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  console.log('[Auth] Checking authentication:', {
    isAuthenticated: req.isAuthenticated?.(),
    session: req.session?.id,
    user: req.user?.id
  });

  if (!req.isAuthenticated || !req.isAuthenticated()) {
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
    console.error("[Auth] Password comparison error:", error);
    return false;
  }
}

async function getUserByUsername(username: string) {
  return db.select().from(users).where(eq(users.username, username)).limit(1);
}

export function setupAuth(app: Express) {
  console.log('[Auth] Setting up authentication...');

  const store = new PostgresSessionStore({
    pool,
    createTableIfMissing: true,
    tableName: 'session',
    pruneSessionInterval: 60
  });

  const sessionMiddleware = session({
    store,
    secret: process.env.REPL_ID || 'fallback-secret-key',
    name: 'connect.sid',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: true,
    cookie: {
      secure: false, // Set to false since we're behind a proxy
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    },
  });

  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(new LocalStrategy(async (username, password, done) => {
    try {
      console.log('[Auth] Login attempt:', { username });
      const [user] = await getUserByUsername(username);

      if (!user) {
        console.log('[Auth] User not found:', username);
        return done(null, false);
      }

      const isValid = await comparePasswords(password, user.password);
      if (!isValid) {
        console.log('[Auth] Invalid password for user:', username);
        return done(null, false);
      }

      console.log('[Auth] Login successful:', { username, userId: user.id });
      return done(null, user);
    } catch (error) {
      console.error('[Auth] Login error:', error);
      return done(error);
    }
  }));

  passport.serializeUser((user: any, done) => {
    console.log('[Auth] Serializing user:', user.id);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      console.log('[Auth] Deserializing user:', id);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) {
        console.log('[Auth] User not found during deserialization:', id);
        return done(null, false);
      }

      done(null, user);
    } catch (error) {
      console.error('[Auth] Deserialization error:', error);
      done(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    console.log('[Auth] Login request:', { 
      username: req.body.username,
      sessionId: req.session?.id 
    });

    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error('[Auth] Authentication error:', err);
        return next(err);
      }

      if (!user) {
        console.log('[Auth] Authentication failed:', info);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      req.logIn(user, (err) => {
        if (err) {
          console.error('[Auth] Login error:', err);
          return next(err);
        }

        console.log('[Auth] Login successful:', { 
          userId: user.id, 
          username: user.username,
          sessionId: req.session?.id
        });

        // Return only necessary user data
        const safeUser = {
          id: user.id,
          username: user.username,
          email: user.email,
          isAdmin: user.isAdmin
        };

        res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    console.log('[Auth] Logout request:', {
      userId: req.user?.id,
      sessionId: req.session?.id
    });

    req.logout((err) => {
      if (err) {
        console.error('[Auth] Logout error:', err);
        return next(err);
      }

      req.session.destroy((err) => {
        if (err) {
          console.error('[Auth] Session destruction error:', err);
          return next(err);
        }

        res.clearCookie('connect.sid');
        console.log('[Auth] Logout successful');
        res.sendStatus(200);
      });
    });
  });

  app.get("/api/user", requireAuth, (req, res) => {
    console.log('[Auth] User data requested:', {
      userId: req.user?.id,
      sessionId: req.session?.id
    });

    // Return only necessary user data
    const user = req.user as any;
    const safeUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin
    };

    res.json(safeUser);
  });

  app.post('/api/templogin', async (req, res) => {
    try {
      const { user, token } = await login(undefined, undefined, true);
      res.json({ user, token });
    } catch (error) {
      console.error('[Auth] Temporary login error:', error);
      res.status(500).json({ error: 'Failed to create temporary login' });
    }
  });

  console.log('[Auth] Authentication setup completed');
  return sessionMiddleware;
}

export async function login(email?: string, password?: string, isTemporary = false) {
  if (isTemporary) {
    const tempUser = {
      id: Date.now(),
      username: `Guest_${Math.random().toString(36).substring(2, 7)}`,
      isTemporary: true
    };
    return { user: tempUser, token: jwt.sign(tempUser, process.env.JWT_SECRET || 'secret') };
  }

  throw new Error('Login logic not fully implemented');
}