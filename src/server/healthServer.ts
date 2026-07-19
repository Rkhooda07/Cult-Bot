import { createServer, type Server } from "node:http";
import type { Client } from "discord.js";
import { logger } from "../utils/logger";
import { env } from "../config/env";

/**
 * Minimal HTTP health endpoint, colocated in the bot process.
 *
 * Exists for two reasons, both external to the bot's own logic:
 *
 *  1. Platform health checks. Koyeb (and most PaaS) probe the exposed port and
 *     consider the deployment failed if nothing answers. A Discord bot is pure
 *     outbound — it would otherwise never listen on anything.
 *
 *  2. Anti-idle. Free tiers scale to zero after ~1h without INBOUND HTTP
 *     traffic. The gateway WebSocket is outbound and does not count, so an
 *     always-on bot would still be suspended hourly, dropping it offline. An
 *     external pinger (UptimeRobot / cron-job.org) hits /health every 5-10 min
 *     to keep the instance warm. See docs/deployment.md.
 *
 * Uses node:http rather than express: this is one route with no middleware,
 * routing, or body parsing, and the runtime target is a 512MB instance.
 */

/**
 * /health always returns 200 while the process is alive — it is a LIVENESS
 * probe, not a readiness one, and that is deliberate.
 *
 * Returning 503 on a disconnected gateway would be more informative, but the
 * platform reacts to a failing health check by restarting the instance, and
 * discord.js reconnects on its own after transient drops. A 503 would turn a
 * five-second blip into a restart loop, each cycle re-running `prisma migrate
 * deploy` at boot. The gateway state is reported in the body instead, so a
 * genuinely wedged bot is still visible to anyone (or anything) reading it.
 */
function buildStatus(client: Client) {
  const ready = client.isReady();

  return {
    status: "ok",
    discord: {
      connected: ready,
      // client.ws.ping is -1 until the first heartbeat ack lands.
      wsPing: ready && client.ws.ping >= 0 ? Math.round(client.ws.ping) : null,
      guilds: ready ? client.guilds.cache.size : 0,
      user: client.user?.tag ?? null,
    },
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

export function startHealthServer(client: Client): Server {
  const server = createServer((req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405, { allow: "GET" }).end();
      return;
    }

    // "/" is answered too: platform health checks and uptime pingers are often
    // configured against the root before anyone remembers to set the path.
    if (req.url === "/health" || req.url === "/") {
      const body = JSON.stringify(buildStatus(client));
      res.writeHead(200, {
        "content-type": "application/json",
        // Pingers hit this every few minutes; nothing here is cacheable.
        "cache-control": "no-store",
      });
      res.end(body);
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "not_found" }));
  });

  // 0.0.0.0, not localhost. A container-internal bind is invisible to the
  // platform's health checker and the deployment fails with no obvious cause —
  // this is the single most common way a PaaS deploy of a working app dies.
  server.listen(env.PORT, "0.0.0.0", () => {
    logger.info({ port: env.PORT }, "Health server listening on 0.0.0.0");
  });

  // Never let a port problem take down a working bot. If the port is already
  // bound, the Discord side is still perfectly functional; log loudly instead.
  server.on("error", (err) => {
    logger.error({ err, port: env.PORT }, "Health server error (bot unaffected)");
  });

  return server;
}
