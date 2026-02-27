const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const path = require("path");
const kv = require("./structs/kv.js");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
const WebSocket = require("ws");
const https = require("https");

const log = require("./structs/log.js");
const error = require("./structs/error.js");
const functions = require("./structs/functions.js");
const AutoBackendRestart = require("./structs/autobackendrestart.js");

const app = express();

// Some routes/models use a `.cache()` helper on mongoose queries (common in
// projects that add a caching plugin). If no plugin is installed, calling it
// throws `...cache is not a function`. Provide a safe no-op shim.
if (mongoose?.Query?.prototype && typeof mongoose.Query.prototype.cache !== "function") {
  mongoose.Query.prototype.cache = function cache() {
    return this;
  };
}

if (!fs.existsSync("./ClientSettings")) fs.mkdirSync("./ClientSettings");

global.JWT_SECRET = functions.MakeID();
const PORT = config.port;
const WEBSITEPORT = config.Website.websiteport;

let httpsServer;

if (config.bEnableHTTPS) {
  const httpsOptions = {
    cert: fs.readFileSync(config.ssl.cert),
    ca: fs.existsSync(config.ssl.ca)
      ? fs.readFileSync(config.ssl.ca)
      : undefined,
    key: fs.readFileSync(config.ssl.key),
  };

  httpsServer = https.createServer(httpsOptions, app);
}

if (!fs.existsSync("./ClientSettings")) fs.mkdirSync("./ClientSettings");

global.JWT_SECRET = functions.MakeID();

console.log("[astris-backend] booting\n");

const tokens = JSON.parse(
  fs.readFileSync("./tokenManager/tokens.json").toString()
);

for (let tokenType in tokens) {
  for (let tokenIndex in tokens[tokenType]) {
    let decodedToken = jwt.decode(
      tokens[tokenType][tokenIndex].token.replace("eg1~", "")
    );

    if (
      DateAddHours(
        new Date(decodedToken.creation_date),
        decodedToken.hours_expire
      ).getTime() <= new Date().getTime()
    ) {
      tokens[tokenType].splice(Number(tokenIndex), 1);
    }
  }
}

fs.writeFileSync("./tokenManager/tokens.json", JSON.stringify(tokens, null, 2));

global.accessTokens = tokens.accessTokens;
global.refreshTokens = tokens.refreshTokens;
global.clientTokens = tokens.clientTokens;
global.kv = kv;

global.exchangeCodes = [];
global.gameFinishedReward = {}; // Track players who finished a game and should receive V-Bucks
global.gameRewards = {}; // Track V-Bucks rewards: { accountId: { eliminations: 0, won: false } }
global.socketConnections = new Map(); // WebSocket connections for IgnisClient

let updateFound = false;

mongoose.set("strictQuery", true);

mongoose.connect(config.mongodb.database, () => {
  log.backend("App successfully connected to MongoDB!");
});

mongoose.connection.on("error", (err) => {
  log.error(
    "MongoDB failed to connect, please make sure you have MongoDB installed and running."
  );
  throw err;
});

app.use(cors());
app.use(rateLimit({ windowMs: 0.5 * 60 * 1000, max: 55 }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

fs.readdirSync("./routes").forEach((fileName) => {
  try {
    app.use(require(`./routes/${fileName}`));
  } catch (err) {
    log.error(`Routes Error: Failed to load ${fileName}`);
  }
});

fs.readdirSync("./Api").forEach((fileName) => {
  try {
    app.use(require(`./Api/${fileName}`));
  } catch (err) {
    log.error(`API Error: Failed to load ${fileName}`);
  }
});

app.get("/unknown", (req, res) => {
  log.debug("GET /unknown endpoint called");
  res.json({ msg: "Uhh mister kyle we have a problem" });
});

let server;
if (config.bEnableHTTPS) {
  server = httpsServer
    .listen(PORT, () => {
      log.backend(`Backend started listening on port ${PORT} (SSL Enabled)`);
      require("./xmpp/xmpp.js");
      if (config.discord.bUseDiscordBot === true) {
        require("./DiscordBot");
      }
      if (config.bUseAutoRotate === true) {
        require("./structs/autorotate.js");
      }
    })
    .on("error", async (err) => {
      if (err.code === "EADDRINUSE") {
        log.error(`Port ${PORT} is already in use!\nClosing in 3 seconds...`);
        await functions.sleep(3000);
        process.exit(0);
      } else {
        throw err;
      }
    });
} else {
  server = app
    .listen(PORT, () => {
      log.backend(`Backend started listening on port ${PORT} (SSL Disabled)`);
      require("./xmpp/xmpp.js");
      if (config.discord.bUseDiscordBot === true) {
        require("./DiscordBot");
      }
      if (config.bUseAutoRotate === true) {
        require("./structs/autorotate.js");
      }
    })
    .on("error", async (err) => {
      if (err.code === "EADDRINUSE") {
        log.error(`Port ${PORT} is already in use!\nClosing in 3 seconds...`);
        await functions.sleep(3000);
        process.exit(0);
      } else {
        throw err;
      }
    });
}

if (config.bEnableAutoBackendRestart === true) {
  AutoBackendRestart.scheduleRestart(config.bRestartTime);
}

if (config.bEnableCalderaService === true) {
  const createCalderaService = require("./CalderaService/calderaservice");
  const calderaService = createCalderaService();

  let calderaHttpsOptions;
  if (config.bEnableHTTPS) {
    calderaHttpsOptions = {
      cert: fs.readFileSync(config.ssl.cert),
      ca: fs.existsSync(config.ssl.ca)
        ? fs.readFileSync(config.ssl.ca)
        : undefined,
      key: fs.readFileSync(config.ssl.key),
    };
  }

  if (config.bEnableHTTPS) {
    const calderaHttpsServer = https.createServer(
      calderaHttpsOptions,
      calderaService
    );

    if (!config.bGameVersion) {
      log.calderaservice("Please define a version in the config!");
      return;
    }

    calderaHttpsServer
      .listen(config.bCalderaServicePort, () => {
        log.calderaservice(
          `Caldera Service started listening on port ${config.bCalderaServicePort} (SSL Enabled)`
        );
      })
      .on("error", async (err) => {
        if (err.code === "EADDRINUSE") {
          log.calderaservice(
            `Caldera Service port ${config.bCalderaServicePort} is already in use!\nClosing in 3 seconds...`
          );
          await functions.sleep(3000);
          process.exit(1);
        } else {
          throw err;
        }
      });
  } else {
    if (!config.bGameVersion) {
      log.calderaservice("Please define a version in the config!");
      return;
    }

    calderaService
      .listen(config.bCalderaServicePort, () => {
        log.calderaservice(
          `Caldera Service started listening on port ${config.bCalderaServicePort} (SSL Disabled)`
        );
      })
      .on("error", async (err) => {
        if (err.code === "EADDRINUSE") {
          log.calderaservice(
            `Caldera Service port ${config.bCalderaServicePort} is already in use!\nClosing in 3 seconds...`
          );
          await functions.sleep(3000);
          process.exit(1);
        } else {
          throw err;
        }
      });
  }
}

if (config.Website.bUseWebsite === true) {
  const websiteApp = express();
  require("./Website/website")(websiteApp);

  let httpsOptions;
  if (config.bEnableHTTPS) {
    httpsOptions = {
      cert: fs.readFileSync(config.ssl.cert),
      ca: fs.existsSync(config.ssl.ca)
        ? fs.readFileSync(config.ssl.ca)
        : undefined,
      key: fs.readFileSync(config.ssl.key),
    };
  }

  if (config.bEnableHTTPS) {
    const httpsServer = https.createServer(httpsOptions, websiteApp);
    httpsServer
      .listen(config.Website.websiteport, () => {
        log.website(
          `Website started listening on port ${config.Website.websiteport} (SSL Enabled)`
        );
      })
      .on("error", async (err) => {
        if (err.code === "EADDRINUSE") {
          log.error(
            `Website port ${config.Website.websiteport} is already in use!\nClosing in 3 seconds...`
          );
          await functions.sleep(3000);
          process.exit(1);
        } else {
          throw err;
        }
      });
  } else {
    websiteApp
      .listen(config.Website.websiteport, () => {
        log.website(
          `Website started listening on port ${config.Website.websiteport} (SSL Disabled)`
        );
      })
      .on("error", async (err) => {
        if (err.code === "EADDRINUSE") {
          log.error(
            `Website port ${config.Website.websiteport} is already in use!\nClosing in 3 seconds...`
          );
          await functions.sleep(3000);
          process.exit(1);
        } else {
          throw err;
        }
      });
  }
}

if (config.bEnableIgnisClient === true) {
  const IgnisClient = require("./IgnisClient/IgnisClient.js");
  const ignisClient = new IgnisClient();

  ignisClient.start(config.bIgnisClientPort || 9999).catch(async (err) => {
    if (err.code === "EADDRINUSE") {
      log.error(
        `Ignis Client port ${
          config.bIgnisClientPort || 9999
        } is already in use!\nClosing in 3 seconds...`
      );
      await functions.sleep(3000);
      process.exit(1);
    } else {
      log.error(`Failed to start Ignis Client: ${err.message}`);
      throw err;
    }
  });

  global.ignisClient = ignisClient;
}

if (config.bEnableArsenicSocket === true) {
  const anticheatSystem = require("./structs/anticheat.js");
  const { createArsenicSocketServer } = require("./ArsenicSocket/arsenicSocket.js");
  const arsenicPort = config.bArsenicSocketPort || 2096;

  createArsenicSocketServer(arsenicPort, anticheatSystem)
    .then(({ server: arsenicHttpServer }) => {
      global.arsenicSocketServer = arsenicHttpServer;
    })
    .catch(async (err) => {
      if (err.code === "EADDRINUSE") {
        log.error(
          `Arsenic Socket port ${arsenicPort} is already in use.\nClosing in 3 seconds...`
        );
        await functions.sleep(3000);
        process.exit(1);
      } else {
        log.error(`Failed to start Arsenic Socket: ${err.message}`);
        throw err;
      }
    });
}

app.use((req, res, next) => {
  const url = req.originalUrl;
  log.debug(
    `Missing endpoint: ${req.method} ${url} request port ${req.socket.localPort}`
  );
  if (req.url.includes("..")) {
    res.redirect("https://youtu.be/dQw4w9WgXcQ");
    return;
  }
  error.createError(
    "errors.com.epicgames.common.not_found",
    "Sorry the resource you were trying to find could not be found",
    undefined,
    1004,
    undefined,
    404,
    res
  );
});

function DateAddHours(pdate, number) {
  let date = pdate;
  date.setHours(date.getHours() + number);

  return date;
}

// --- Nova funcionalidade: reinício periódico a cada 10 minutos (graceful) ---
(function schedulePeriodicRestart() {
  try {
    const RESTART_INTERVAL_MINUTES = 10;
    const RESTART_INTERVAL_MS = RESTART_INTERVAL_MINUTES * 60 * 1000;
    let isRestarting = false;

    async function initiateGracefulRestart() {
      if (isRestarting) {
        log.backend('[AutoRestart] Restart already in progress, skipping.');
        return;
      }
      isRestarting = true;
      log.backend(`[AutoRestart] Periodic graceful restart triggered. Preparing to close services...`);

      // Timeout fallback: força sair se algo travar (15s)
      const FORCE_EXIT_TIMEOUT = setTimeout(() => {
        log.error('[AutoRestart] Graceful shutdown timed out; forcing exit.');
        process.exit(1);
      }, 15000);

      try {
        // 1) Parar IgnisClient se existir e tiver método de stop
        try {
          if (global.ignisClient && typeof global.ignisClient.stop === 'function') {
            log.backend('[AutoRestart] Stopping IgnisClient...');
            await Promise.resolve(global.ignisClient.stop());
            log.backend('[AutoRestart] IgnisClient stopped.');
          }
        } catch (e) {
          log.error('[AutoRestart] Error stopping IgnisClient:', e.stack || e);
        }

        // 1b) Close Arsenic anticheat socket server
        try {
          if (global.arsenicSocketServer && typeof global.arsenicSocketServer.close === 'function') {
            log.backend('[AutoRestart] Closing Arsenic socket server...');
            await new Promise((resolve) => {
              global.arsenicSocketServer.close(() => {
                log.backend('[AutoRestart] Arsenic socket server closed.');
                resolve();
              });
            });
          }
        } catch (e) {
          log.error('[AutoRestart] Error closing Arsenic socket:', e.stack || e);
        }

        // 2) Fechar conexões WebSocket guardadas (global.socketConnections)
        try {
          if (global.socketConnections && typeof global.socketConnections.forEach === 'function') {
            log.backend('[AutoRestart] Closing socketConnections...');
            try {
              global.socketConnections.forEach((ws) => {
                try {
                  if (ws && typeof ws.close === 'function') ws.close();
                } catch (e) { /* ignore per-socket errors */ }
              });
            } catch (e) {
              // caso global.socketConnections não seja iterável ou seja Map
              try {
                for (const [k, s] of global.socketConnections) {
                  try { if (s && typeof s.close === 'function') s.close(); } catch (e) {}
                }
              } catch (ee) {}
            }
            log.backend('[AutoRestart] socketConnections close attempted.');
          }
        } catch (e) {
          log.error('[AutoRestart] Error closing socketConnections:', e.stack || e);
        }

        // 3) Fechar servidor HTTP/Express (server variable está no escopo)
        try {
          if (typeof server !== 'undefined' && server && typeof server.close === 'function') {
            log.backend('[AutoRestart] Closing HTTP server...');
            await new Promise((resolve, reject) => {
              try {
                server.close((err) => {
                  if (err) {
                    log.error('[AutoRestart] Error while closing HTTP server:', err);
                    return reject(err);
                  }
                  log.backend('[AutoRestart] HTTP server closed.');
                  resolve();
                });
              } catch (e) {
                log.error('[AutoRestart] Exception while closing server:', e.stack || e);
                resolve(); // continuar mesmo se falhar
              }
            });
          } else {
            log.backend('[AutoRestart] No HTTP server to close or server.close not available.');
          }
        } catch (e) {
          log.error('[AutoRestart] Error closing HTTP server:', e.stack || e);
        }

        // 4) Fechar conexão Mongoose
        try {
          if (mongoose && mongoose.connection && typeof mongoose.connection.close === 'function') {
            log.backend('[AutoRestart] Closing mongoose connection...');
            await mongoose.connection.close(false);
            log.backend('[AutoRestart] Mongoose connection closed.');
          }
        } catch (e) {
          log.error('[AutoRestart] Error closing mongoose connection:', e.stack || e);
        }

        // 5) Tentar persistir kv (se existir método save/persist)
        try {
          if (global.kv && typeof global.kv.save === 'function') {
            log.backend('[AutoRestart] Persisting KV store...');
            await Promise.resolve(global.kv.save());
            log.backend('[AutoRestart] KV persisted.');
          }
        } catch (e) {
          log.error('[AutoRestart] Error persisting KV store:', e.stack || e);
        }

        // 6) Pequeno delay para garantir flush de logs
        await new Promise((r) => setTimeout(r, 500));

        // Limpar timeout de força
        clearTimeout(FORCE_EXIT_TIMEOUT);

        log.backend('[AutoRestart] Graceful shutdown complete. Exiting process for restart.');
        // Sai com código 0 para indicar reinício normal ao process manager
        process.exit(0);
      } catch (e) {
        log.error('[AutoRestart] Unexpected error during graceful restart:', e.stack || e);
        // Se algo falhar, força saída
        try { clearTimeout(FORCE_EXIT_TIMEOUT); } catch (e) {}
        process.exit(1);
      }
    }

    // Agendar reinícios periódicos
    setInterval(() => {
      try {
        initiateGracefulRestart().catch((err) => {
          log.error('[AutoRestart] initiateGracefulRestart failed:', err.stack || err);
        });
      } catch (e) {
        log.error('[AutoRestart] Error scheduling graceful restart:', e.stack || e);
      }
    }, RESTART_INTERVAL_MS);

    log.backend(`[AutoRestart] Scheduled periodic graceful restart every ${RESTART_INTERVAL_MINUTES} minutes.`);
  } catch (e) {
    log.error(`[AutoRestart] Failed to schedule periodic restart: ${e.stack || e}`);
  }
})();

module.exports = app;