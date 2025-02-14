import { createServer, type Server } from "http";
import express, { type Express, type Request, type Response } from 'express';
import { db } from "@db";
import { sql, eq } from "drizzle-orm";
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
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
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
  const httpServer = createServer(app);
  const sessionMiddleware = setupAuth(app);

  // Global middleware for API routes
  app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    console.log(`[API] ${req.method} ${req.path}`);
    next();
  });

  // Serve uploaded files
  app.use('/uploads', express.static(uploadsDir));

  // Test upload endpoint (no auth required for testing)
  app.post("/api/test-upload", upload.single('file'), async (req: Request, res: Response) => {
    try {
      console.log('[API] Processing test upload request');

      if (!req.file) {
        console.log('[API] No file received in test upload');
        return res.status(400).json({ success: false, message: "No file uploaded" });
      }

      const relativePath = path.relative(process.cwd(), req.file.path);
      const publicPath = '/uploads/' + path.basename(req.file.path);

      console.log('[API] File uploaded successfully:', {
        filename: req.file.filename,
        path: publicPath,
        size: req.file.size
      });

      res.json({
        success: true,
        message: "File uploaded successfully",
        file: {
          filename: req.file.filename,
          path: publicPath,
          size: req.file.size,
          mimetype: req.file.mimetype
        }
      });
    } catch (error) {
      console.error('[API] Test upload error:', error);
      res.status(500).json({ success: false, message: "Error uploading file" });
    }
  });

  // Thumbnail upload endpoint
  app.post("/api/videos/:id/thumbnail", upload.single('thumbnail'), async (req: Request, res: Response) => {
    try {
      console.log('[API] Processing thumbnail upload for video');
      const videoId = parseInt(req.params.id);

      if (isNaN(videoId)) {
        return res.status(400).json({ success: false, message: "Invalid video ID" });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: "No thumbnail uploaded" });
      }

      // Get the existing video
      const existingVideo = await db.query.videos.findFirst({
        where: eq(videos.id, videoId)
      });

      if (!existingVideo) {
        return res.status(404).json({ success: false, message: "Video not found" });
      }

      // Generate the public URL for the thumbnail
      const publicPath = '/uploads/' + path.basename(req.file.path);

      // Update the video with new thumbnail URL
      await db.update(videos)
        .set({ thumbnailUrl: publicPath })
        .where(eq(videos.id, videoId));

      console.log('[API] Thumbnail updated successfully:', {
        videoId,
        thumbnailUrl: publicPath
      });

      // Return the updated video
      const updatedVideo = await db.query.videos.findFirst({
        where: eq(videos.id, videoId),
        with: {
          category: true,
          subcategory: true
        }
      });

      res.json({ success: true, video: updatedVideo });
    } catch (error) {
      console.error('[API] Error updating thumbnail:', error);
      res.status(500).json({ success: false, message: "Error updating thumbnail" });
    }
  });

  // List all videos
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