import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { videos, categories, chatMessages } from "@db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import express from "express";

export function registerRoutes(app: Express): Server {
  // Serve thumbnail images with proper encoding
  app.use('/thumbnails', (req, res, next) => {
    // Remove /thumbnails/ from the start of the URL
    const requestedFile = req.url.replace(/^\/+/, '');
    // Create the full path to the file
    const filePath = path.join(process.cwd(), 'attached_assets', 'Videos links 18dddbcd8a1080daa23ad9562f0ed3e4', requestedFile);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error(`Error serving thumbnail: ${requestedFile}`, err);
        next();
      }
    });
  });

  // Videos endpoints
  app.get("/api/videos", async (_req, res) => {
    const result = await db.query.videos.findMany({
      with: {
        category: true,
        subcategory: true,
      },
      orderBy: (videos) => [videos.title],
    });
    res.json(result);
  });

  app.get("/api/videos/:id", async (req, res) => {
    const result = await db.query.videos.findFirst({
      where: eq(videos.id, parseInt(req.params.id)),
      with: {
        category: true,
        subcategory: true,
      },
    });
    if (!result) {
      res.status(404).json({ message: "Video not found" });
      return;
    }
    res.json(result);
  });

  // Categories endpoints
  app.get("/api/categories", async (_req, res) => {
    const result = await db.query.categories.findMany({
      with: {
        subcategories: true,
      },
    });
    res.json(result);
  });

  // Chat messages endpoints
  app.post("/api/chat", async (req, res) => {
    const { videoId, question } = req.body;

    try {
      // Call Delphi.ai API
      const delphiResponse = await fetch("https://delphi.ai/jonah/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });

      const answer = await delphiResponse.text();

      const message = await db.insert(chatMessages).values({
        videoId,
        question,
        answer
      }).returning();

      res.json(message[0]);
    } catch (error) {
      res.status(500).json({ message: "Failed to get chat response" });
    }
  });

  app.get("/api/chat/:videoId", async (req, res) => {
    const messages = await db.query.chatMessages.findMany({
      where: eq(chatMessages.videoId, parseInt(req.params.videoId)),
      orderBy: (messages) => [messages.createdAt],
    });
    res.json(messages);
  });

  const httpServer = createServer(app);
  return httpServer;
}