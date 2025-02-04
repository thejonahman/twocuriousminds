import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import express from "express";
import { analyzeImage, findBestImageForVideo } from "./lib/imageAnalysis";

export function registerRoutes(app: Express): Server {
  // Serve static files from attached_assets directory
  app.use('/attached_assets', express.static(path.join(process.cwd(), 'attached_assets')));

  // Add route to handle video thumbnail updates
  app.get('/api/thumbnail/:videoId', async (req, res) => {
    try {
      const assetsDir = path.join(process.cwd(), 'attached_assets');
      const bestImage = await findBestImageForVideo(
        req.params.videoId,
        assetsDir
      );

      if (!bestImage) {
        console.error('No suitable thumbnail found for video:', req.params.videoId);
        return res.status(404).json({ error: 'No suitable thumbnail found' });
      }

      res.json({ thumbnailUrl: bestImage });
    } catch (error) {
      console.error('Error finding thumbnail:', error);
      res.status(500).json({ error: 'Failed to find thumbnail' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}