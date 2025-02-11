import { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users } from "@db/schema";
import { db, pool } from "@db";
import { eq } from "drizzle-orm";

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        email: string;
        isAdmin: boolean;
      }
    }
  }
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 32)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashedPassword, salt] = stored.split(".");
  const buf = (await scryptAsync(supplied, salt, 32)) as Buffer;
  const storedBuf = Buffer.from(hashedPassword, "hex");
  return timingSafeEqual(buf, storedBuf);
}

export function setupAuth(app: Express) {
  // Create session store with retry logic
  const store = new PostgresSessionStore({
    pool,
    createTableIfMissing: true,
    tableName: 'session',
    pruneSessionInterval: 60, // Prune expired sessions every minute
    errorLog: console.error.bind(console),
  });

  // Configure session middleware
  app.use(session({
    store,
    secret: process.env.REPL_ID || 'dev-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    rolling: true, // Refresh session with each request
  }));

  // Add user data to request if session exists
  app.use((req, res, next) => {
    if (req.session?.userId) {
      req.user = req.session.user;
    }
    next();
  });

  // Register endpoint
  app.post("/api/register", async (req, res) => {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Check if user exists
      const existingUser = await db.query.users.findFirst({
        where: eq(users.username, username)
      });

      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Create new user
      const [user] = await db
        .insert(users)
        .values({
          username,
          email,
          password: await hashPassword(password),
          isAdmin: false
        })
        .returning();

      // Set up session
      req.session.userId = user.id;
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin
      };

      res.status(201).json({
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login endpoint
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      // Find user
      const user = await db.query.users.findFirst({
        where: eq(users.username, username)
      });

      if (!user || !(await comparePasswords(password, user.password))) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Set up session
      req.session.userId = user.id;
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin
      };

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Logout endpoint
  app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie('connect.sid');
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user endpoint
  app.get("/api/user", (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(req.user);
  });
}