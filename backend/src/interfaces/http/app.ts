import path from "node:path";
import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "../../infrastructure/config/env.js";
import { sanitizeMiddleware } from "./middlewares/sanitize.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { apiRateLimiter } from "./middlewares/rateLimit.js";
import { createApiRouter, ApiRoutesDependencies } from "./routes/index.js";

export interface CreateAppOptions {
  serveStaticDir?: string;
  allowedHosts?: string[];
  disableCors?: boolean;
}

export function createApp(deps: ApiRoutesDependencies, options?: CreateAppOptions): Express {
  const app = express();

  // Validación de cabecera Host (anti DNS-rebinding). El arreglo puede rellenarse después de
  // crear la app (el puerto aleatorio se conoce al escuchar), por eso se lee en cada petición
  // y la comprobación se instala aunque aún esté vacío (vacío = rechazar todo).
  if (options?.allowedHosts) {
    const allowed = options.allowedHosts;
    app.use((req: Request, res: Response, next: NextFunction) => {
      const host = req.headers.host;
      if (!host || !allowed.includes(host)) {
        res.status(403).json({ success: false, error: "Host no permitido" });
        return;
      }
      // Una petición con Origin ajeno (otra web intentando usar la API local) se rechaza;
      // el mismo origen de la app (http://<host permitido>) sí pasa.
      const origin = req.headers.origin;
      if (origin && !allowed.some((h) => origin === `http://${h}`)) {
        res.status(403).json({ success: false, error: "Origen no permitido" });
        return;
      }
      next();
    });
  }

  // Seguridad HTTP Headers
  app.use(
    helmet({
      // En escritorio se sirve por http://127.0.0.1: la CSP por defecto de helmet incluye
      // `upgrade-insecure-requests` y rompería la carga, así que se define una CSP estricta propia.
      contentSecurityPolicy: options?.serveStaticDir
        ? {
            useDefaults: false,
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "blob:"],
              mediaSrc: ["'self'", "blob:"],
              fontSrc: ["'self'", "data:"],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"]
            }
          }
        : undefined
    })
  );

  // CORS con allowlist
  if (!options?.disableCors) {
    const origins = env.CORS_ORIGINS.split(",").map((o) => o.trim());
    app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin || origins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error("No permitido por CORS"));
          }
        },
        credentials: true
      })
    );
  }

  // Parsing y Sanitización
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.use(cookieParser());
  app.use(sanitizeMiddleware);

  // Rate Limiting global
  app.use(apiRateLimiter);

  // Rutas API
  app.use("/api", createApiRouter(deps));

  // Servir frontend estático y fallback SPA si se proporciona serveStaticDir
  if (options?.serveStaticDir) {
    const staticDir = options.serveStaticDir;
    app.use(express.static(staticDir));
    app.get("*", (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) {
        return next();
      }
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  // Manejador centralizado de errores
  app.use(errorHandler);

  return app;
}
