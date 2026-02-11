const express = require("express");
const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");
const { exec } = require("child_process");
const crypto = require("crypto");
const cors = require("cors");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

/* -------------------------------------------------------------------------- */
/*                               APP SETUP                                    */
/* -------------------------------------------------------------------------- */

const app = express();
app.use(express.json());
app.use(cors());

/* -------------------------------------------------------------------------- */
/*                           RATE LIMITING (ENFORCED)                          */
/* -------------------------------------------------------------------------- */

const storeProvisionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                  // max 5 store provisions per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Rate limit exceeded. Please try again later.",
  },
});

/* -------------------------------------------------------------------------- */
/*                               ENV CONFIG                                   */
/* -------------------------------------------------------------------------- */

const {
  ENVIRONMENT,
  PUBLIC_IP,
  LOCAL_BASE_DOMAIN,
  STORE_PORT,
  PORT,
  REDIS_HOST,
  REDIS_PORT,
  CHARTS_BASE_PATH,
} = process.env;

const API_PORT = PORT || 3005;

/* -------------------------------------------------------------------------- */
/*                             ENGINE CONFIG                                  */
/* -------------------------------------------------------------------------- */

const ENGINE_CONFIG = {
  woocommerce: {
    chartPath: `${CHARTS_BASE_PATH}/wc-store`,
  },
  medusa: {
    chartPath: `${CHARTS_BASE_PATH}/medusa-stub`,
  },
};

/* -------------------------------------------------------------------------- */
/*                         STORE URL GENERATION                                */
/* -------------------------------------------------------------------------- */

function getStoreEndpoint(storeId) {
  if (ENVIRONMENT === "prod") {
    const host = `${storeId}.${PUBLIC_IP}.sslip.io`;
    const port = STORE_PORT ? `:${STORE_PORT}` : "";
    return {
      hostname: host,
      url: `http://${host}${port}`,
    };
  }

  // local
  const baseDomain = LOCAL_BASE_DOMAIN || "localtest.me";
  const host = `${storeId}.${baseDomain}`;
  return {
    hostname: host,
    url: `http://${host}`,
  };
}

/* -------------------------------------------------------------------------- */
/*                              DATABASE                                      */
/* -------------------------------------------------------------------------- */

let db;

(async () => {
  db = await open({
    filename: "./database.sqlite",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      status TEXT,
      url TEXT,
      createdAt DATETIME
    )
  `);
})();

/* -------------------------------------------------------------------------- */
/*                                 QUEUE                                      */
/* -------------------------------------------------------------------------- */

const redisConnection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
});

const queue = new Queue("provisioning", { connection: redisConnection });

/* -------------------------------------------------------------------------- */
/*                     GUARDRAIL (COMMENTED): MAX STORES PER IP                */
/* -------------------------------------------------------------------------- */
/*
Intent:
Prevent slow abuse where a single IP provisions unlimited stores
over time while respecting rate limits.

Design:
- Track creator IP per store
- Enforce a hard cap (e.g. 3 active stores per IP)

Not enforced in Round 1 to keep the demo lightweight.

const MAX_STORES_PER_IP = 3;

async function enforceStoreCap(ip) {
  const row = await db.get(
    "SELECT COUNT(*) as count FROM stores WHERE status != 'Deleted' AND createdByIp = ?",
    [ip]
  );

  if (row.count >= MAX_STORES_PER_IP) {
    throw new Error("Store limit reached for this IP");
  }
}
*/
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                                   API                                      */
/* -------------------------------------------------------------------------- */

// List stores
app.get("/api/stores", async (req, res) => {
  const rows = await db.all(
    "SELECT * FROM stores ORDER BY createdAt DESC"
  );
  res.json(rows);
});

// Create store
app.post("/api/stores", storeProvisionLimiter, async (req, res) => {
  const { name, type } = req.body;

  if (!ENGINE_CONFIG[type]) {
    return res.status(400).json({ error: "Invalid store engine" });
  }

  const storeId = `urumi-${crypto.randomUUID().slice(0, 5)}`;
  const { hostname, url } = getStoreEndpoint(storeId);

  const store = {
    id: storeId,
    name,
    type,
    status: "Provisioning",
    url,
    createdAt: new Date().toISOString(),
  };

  await db.run(
    "INSERT INTO stores VALUES (?, ?, ?, ?, ?, ?)",
    [
      store.id,
      store.name,
      store.type,
      store.status,
      store.url,
      store.createdAt,
    ]
  );

  await queue.add("install", {
    storeId,
    hostname,
    type,
  });

  res.json(store);
});

// Delete store
app.delete("/api/stores/:id", async (req, res) => {
  const { id } = req.params;

  exec(
    `helm uninstall ${id} -n ${id} && kubectl delete ns ${id}`,
    async () => {
      await db.run("DELETE FROM stores WHERE id = ?", [id]);
      res.status(204).send();
    }
  );
});

/* -------------------------------------------------------------------------- */
/*                                  WORKER                                    */
/* -------------------------------------------------------------------------- */

new Worker(
  "provisioning",
  async (job) => {
    const { storeId, hostname, type } = job.data;
    const engine = ENGINE_CONFIG[type];

    const valuesFile =
      ENVIRONMENT === "prod"
        ? `${engine.chartPath}/values-prod.yaml`
        : `${engine.chartPath}/values-local.yaml`;

    let setArgs = "";

    if (type === "woocommerce") {
      setArgs = `--set wordpress.ingress.hostname=${hostname}`;
    }

    /* ---------------------------------------------------------------------- */
    /*                 HELM TIMEOUT GUARDRAIL (ENFORCED)                       */
    /* ---------------------------------------------------------------------- */
    const cmd = `
      helm upgrade --install ${storeId} ${engine.chartPath} \
        --namespace ${storeId} \
        --create-namespace \
        -f ${valuesFile} \
        ${setArgs} \
        --wait \
        --timeout 5m
    `;

    return new Promise((resolve, reject) => {
      exec(cmd, async (err, stdout, stderr) => {
        if (err) {
          console.error(stderr);
          await db.run(
            "UPDATE stores SET status = ? WHERE id = ?",
            ["Failed", storeId]
          );
          return reject(err);
        }

        console.log(stdout);

        await db.run(
          "UPDATE stores SET status = ? WHERE id = ?",
          ["Ready", storeId]
        );

        resolve();
      });
    });
  },
  { connection: redisConnection }
);

/* -------------------------------------------------------------------------- */
/*                GUARDRAIL (COMMENTED): NAMESPACE RESOURCE QUOTA              */
/* -------------------------------------------------------------------------- */
/*
Intent:
Limit per-store blast radius at the Kubernetes level.

Example ResourceQuota per store namespace:

apiVersion: v1
kind: ResourceQuota
metadata:
  name: store-quota
spec:
  hard:
    requests.cpu: "2"
    requests.memory: 2Gi
    limits.cpu: "2"
    limits.memory: 2Gi
    persistentvolumeclaims: "2"

Can be applied via:
- Helm hook
- kubectl apply after namespace creation

Not enforced in Round 1 to keep provisioning fast and simple.
*/
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                                SERVER                                      */
/* -------------------------------------------------------------------------- */

app.listen(API_PORT, "0.0.0.0", () => {
  console.log(`Orchestrator running on port ${API_PORT}`);
  console.log(`Environment: ${ENVIRONMENT}`);
});
