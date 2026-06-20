import http from "node:http";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "debug",
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    component: "horizon_failover_demo",
    env: process.env.NODE_ENV ?? "development",
    service: "paymaster-server",
  },
  formatters: {
    level: (level) => ({ level }),
  },
});

const nodeAUrl = "http://127.0.0.1:4101";
const nodeBUrl = "http://127.0.0.1:4102";

function startMockServer (port, handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function closeServer (server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function isRetryable (error) {
  const status = error.status;
  if ([408, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const code = error.code;
  return [
    "ECONNRESET",
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ETIMEDOUT",
  ].includes(code);
}

class DemoFailoverClient {
  constructor(urls) {
    this.nodes = urls.map((url) => ({
      url,
      state: "Active",
      consecutiveFailures: 0,
    }));
  }

  async submitTransaction (payload) {
    for (let index = 0; index < this.nodes.length; index += 1) {
      const node = this.nodes[index];
      const attempt = index + 1;
      logger.info(
        { attempt, node_url: node.url, total_nodes: this.nodes.length },
        "Submitting transaction via Horizon node"
      );

      try {
        const response = await fetch(`${node.url}/transactions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }

        const data = await response.json();
        node.state = "Active";
        node.consecutiveFailures = 0;
        logger.info({ node_state: node.state, node_url: node.url }, "Horizon node marked active");
        logger.info(
          { node_url: node.url, tx_hash: data.hash },
          "Transaction submission succeeded"
        );
        return data;
      } catch (error) {
        node.state = "Inactive";
        node.consecutiveFailures += 1;
        logger.warn({ node_state: node.state, node_url: node.url }, "Horizon node marked inactive");
        logger.warn(
          {
            disposition: isRetryable(error) ? "retryable" : "final",
            error_message: error.message,
            node_url: node.url,
          },
          "Transaction submission failed"
        );

        if (!isRetryable(error)) {
          throw error;
        }
      }
    }

    throw new Error("All Horizon nodes failed");
  }

  getNodeStatuses () {
    return this.nodes;
  }
}

const nodeAServer = await startMockServer(4101, (req, res) => {
  if (req.method === "POST" && req.url === "/transactions") {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "primary node unavailable" }));
    return;
  }

  res.writeHead(404).end();
});

const nodeBServer = await startMockServer(4102, (req, res) => {
  if (req.method === "POST" && req.url === "/transactions") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ hash: "demo-hash-node-b" }));
    return;
  }

  res.writeHead(404).end();
});

try {
  const client = new DemoFailoverClient([nodeAUrl, nodeBUrl]);
  const result = await client.submitTransaction({ envelopeXdr: "AAAA-demo" });

  logger.info({ result }, "Final result");
  logger.info({ node_statuses: client.getNodeStatuses() }, "Node status snapshot");
} finally {
  await closeServer(nodeAServer);
  await closeServer(nodeBServer);
}
