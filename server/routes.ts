import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { thumbnails } from "@db/schema";
import { eq } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  // Get all thumbnails
  app.get("/api/thumbnails", async (_req, res) => {
    try {
      const allThumbnails = await db.query.thumbnails.findMany({
        orderBy: (thumbnails, { desc }) => [desc(thumbnails.createdAt)],
      });

      if (!allThumbnails) {
        return res.json([]);
      }

      res.json(allThumbnails);
    } catch (error) {
      console.error("Error fetching thumbnails:", error);
      res.status(500).json({ 
        message: "Failed to fetch thumbnails",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  });

  // Get a single thumbnail
  app.get("/api/thumbnails/:id", async (req, res) => {
    try {
      const thumbnail = await db.query.thumbnails.findFirst({
        where: eq(thumbnails.id, parseInt(req.params.id)),
      });

      if (!thumbnail) {
        return res.status(404).json({ message: "Thumbnail not found" });
      }

      res.json(thumbnail);
    } catch (error) {
      console.error("Error fetching thumbnail:", error);
      res.status(500).json({ 
        message: "Failed to fetch thumbnail",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}