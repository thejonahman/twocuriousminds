import { createServer, type Server } from "http";
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { db } from "@db";
import { sql, eq, and, desc } from "drizzle-orm";
import { videos } from "@db/schema";
import { setupAuth, requireAuth } from "./auth";
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, JPG, PNG and WebP are allowed.'));
    }
  }
});

interface AuthUser {
  id: number;
  username: string;
  email: string;
  is_admin?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function registerRoutes(app: Express): Server {
  // Create HTTP server first
  const httpServer = createServer(app);

  // Setup auth and get session middleware BEFORE registering routes
  const sessionMiddleware = setupAuth(app);

  // Global middleware to ensure JSON responses for all /api routes
  app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    console.log(`[API] ${req.method} ${req.path} - Processing API request`);
    next();
  });

  // Setup static file serving for uploads
  app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

  // File upload endpoint - moved to top to ensure proper registration
  app.post("/api/upload", requireAuth, upload.single('thumbnail'), async (req: AuthenticatedRequest, res: Response) => {
    console.log('[API] Processing file upload request');
    try {
      if (!req.file) {
        console.log('[API] No file uploaded');
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Return the URL path to the uploaded file
      const fileUrl = `/uploads/${req.file.filename}`;
      console.log('[API] File uploaded successfully:', fileUrl);
      res.json({ url: fileUrl });
    } catch (error) {
      console.error('[API] File upload error:', error);
      res.status(500).json({ message: "Error uploading file" });
    }
  });

  // Add thumbnail update endpoint for existing videos
  app.patch("/api/videos/:id/thumbnail", requireAuth, upload.single('thumbnail'), async (req: AuthenticatedRequest, res: Response) => {
    console.log('[API] Processing thumbnail update for video');
    const videoId = parseInt(req.params.id);

    if (isNaN(videoId)) {
      return res.status(400).json({ message: "Invalid video ID" });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ message: "No thumbnail uploaded" });
      }

      // Get the existing video
      const existingVideo = await db.query.videos.findFirst({
        where: eq(videos.id, videoId)
      });

      if (!existingVideo) {
        return res.status(404).json({ message: "Video not found" });
      }

      // Generate the new thumbnail URL
      const thumbnailUrl = `/uploads/${req.file.filename}`;

      // Update the video with new thumbnail URL
      await db.update(videos)
        .set({ thumbnailUrl })
        .where(eq(videos.id, videoId));

      console.log('[API] Thumbnail updated successfully for video:', videoId);

      // Return the updated video with the new thumbnail URL
      const updatedVideo = await db.query.videos.findFirst({
        where: eq(videos.id, videoId),
        with: {
          category: true,
          subcategory: true
        }
      });

      res.json(updatedVideo);
    } catch (error) {
      console.error('[API] Error updating thumbnail:', error);
      res.status(500).json({ message: "Error updating thumbnail" });
    }
  });

  // Endpoint to list all videos with their thumbnails
  app.get("/api/videos", async (req: Request, res: Response) => {
    try {
      const allVideos = await db.query.videos.findMany({
        with: {
          category: true,
          subcategory: true
        }
      });
      res.json(allVideos);
    } catch (error) {
      console.error('[API] Error fetching videos:', error);
      res.status(500).json({ message: "Error fetching videos" });
    }
  });

  return httpServer;
}