import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import cluster from "cluster";
import os from "os";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Middleware to capture raw body (useful for Twilio signature verification etc.)
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Logging helper
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// Request/response logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  const port = parseInt(process.env.PORT || "3000", 10);
  const isDev = process.env.NODE_ENV !== "production";

  // In development, run single process (no clustering) to avoid Vite conflicts
  if (isDev) {
    await registerRoutes(httpServer, app);

    seedDatabase().catch((err) => {
      console.error("Database seeding failed:", err.message);
    });

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      if (res.headersSent) return next(err);
      return res.status(status).json({ message });
    });

    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);

    httpServer.listen(port, "0.0.0.0", () => {
      log(`Server listening on port ${port}`);
    });

    return;
  }

  // Production: use clustering
  if (cluster.isPrimary) {
    const numCPUs = os.cpus().length;
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    httpServer.listen(port, "0.0.0.0", () => {
      log(`Master ${process.pid} listening on port ${port}`);
    });

    cluster.on("exit", (worker) => {
      log(`Worker ${worker.process.pid} died, restarting...`);
      cluster.fork();
    });
  } else {
    await registerRoutes(httpServer, app);

    seedDatabase().catch((err) => {
      console.error("Database seeding failed:", err.message);
    });

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      if (res.headersSent) return next(err);
      return res.status(status).json({ message });
    });

    serveStatic(app);
  }
})();
