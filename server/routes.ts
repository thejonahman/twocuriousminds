import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import { analyzeImage, findBestImageForVideo } from "./lib/imageAnalysis";

export function registerRoutes(app: Express): Server {
  // put application routes here
  // prefix all routes with /api
  // Add route to handle video thumbnail updates
  app.get('/api/thumbnail/:videoId', async (req, res) => {
    try {
      const assetsDir = path.join(process.cwd(), 'attached_assets');
      const bestImage = await findBestImageForVideo(
        req.params.videoId,
        assetsDir
      );
      res.json({ thumbnailUrl: bestImage });
    } catch (error) {
      console.error('Error finding thumbnail:', error);
      res.status(500).json({ error: 'Failed to find thumbnail' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}