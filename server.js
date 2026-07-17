const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const DB_KEY = "shtStudiosDB";
const CFG_KEY = "shtStudiosConfig";

/* ============================================================
   Persistent storage (Upstash Redis)
   ------------------------------------------------------------
   Render's free instances wipe local files on every redeploy
   and after the container sleeps, so config/registrations were
   getting lost. This stores that data in Upstash Redis instead,
   which lives outside the container and never resets.

   Set these two environment variables in Render (Settings ->
   Environment) after creating a free database at upstash.com:
     UPSTASH_REDIS_REST_URL
     UPSTASH_REDIS_REST_TOKEN

   If they're not set (e.g. running locally without Upstash),
   this falls back to local JSON files so local testing still
   works without any extra setup.
   ============================================================ */


const UPSTASH_URL   = process.env.https://regular-hamster-170572.upstash.io;
const UPSTASH_TOKEN = process.env.gQAAAAAAAppMAAIgcDFhMGI3NzNkYzA3MjU0NWZiOWYzZjUzZDM4ZTEzODk1ZA;
const USE_UPSTASH   = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

async function upstashGet(key) {
    const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    if (!res.ok) throw new Error(`Upstash GET failed: ${res.status}`);
    const data = await res.json();
    return data.result; // string or null
}

async function upstashSet(key, valueString) {
    const res = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        body: valueString
    });
    if (!res.ok) throw new Error(`Upstash SET failed: ${res.status}`);
    return res.json();
}

function localFilePath(key) {
    // Reuse the same filenames the app used before, for local dev.
    return path.join(__dirname, key);
}

async function readData(key, fallback) {
    try {
        if (USE_UPSTASH) {
            const raw = await upstashGet(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } else {
            const filePath = localFilePath(key);
            if (!fs.existsSync(filePath)) return fallback;
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
        }
    } catch (err) {
        console.error(`readData(${key}) failed:`, err.message);
        return fallback;
    }
}

async function writeData(key, data) {
    try {
        if (USE_UPSTASH) {
            await upstashSet(key, JSON.stringify(data));
        } else {
            fs.writeFileSync(localFilePath(key), JSON.stringify(data));
        }
    } catch (err) {
        console.error(`writeData(${key}) failed:`, err.message);
    }
}

function sendJSON(res, data, status = 200) {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify(data));
}

/* ============================================================
   Static file serving (index.html, admin.html, style.css, ...)
   ============================================================ */

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".js":   "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg":  "image/svg+xml",
    ".ico":  "image/x-icon"
};

const PUBLIC_DIR = __dirname;

function serveStaticFile(req, res, pathname) {
    let requestedPath = pathname === "/" ? "/index.html" : pathname;

    const safePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));
    if (!safePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end("Forbidden");
    }

    fs.readFile(safePath, (err, data) => {
        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            return res.end("404 - Not Found");
        }
        const ext = path.extname(safePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
        res.end(data);
    });
}

/* ============================================================
   Server
   ============================================================ */

const server = http.createServer(async (req, res) => {

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    try {
        // ==========================
        // GET /get-db
        // ==========================
        if (req.method === "GET" && pathname === "/get-db") {
            const db = await readData(DB_KEY, { registrations: [] });
            const cfg = await readData(CFG_KEY, {
                placeId: "",
                redirectPlaceId: "",
                requireCode: false,
                accessCodes: []
            });
            return sendJSON(res, { db, config: cfg });
        }

        // ==========================
        // GET /api
        // ==========================
        if (req.method === "GET" && (pathname === "/api" || pathname === "/api.html")) {
            const action   = parsedUrl.searchParams.get("action");
            const playerId = parsedUrl.searchParams.get("id");
            const apiKey   = parsedUrl.searchParams.get("key");

            if (action === "verify" && playerId) {
                const cfg = await readData(CFG_KEY, {});
                const expectedKey = cfg.apiKey;

                if (expectedKey && apiKey !== expectedKey) {
                    return sendJSON(res, { valid: false, error: "Invalid API key" });
                }

                const db = await readData(DB_KEY, { registrations: [] });
                const found = db.registrations.find(r =>
                    String(r.id).trim() === String(playerId).trim()
                );

                if (found && found.status === "active") {
                    found.verifyCount = (found.verifyCount || 0) + 1;
                    found.lastVerifiedAt = Date.now();
                    await writeData(DB_KEY, db);

                    return sendJSON(res, {
                        valid: true,
                        robloxUsername: found.robloxUsername,
                        registeredAt: found.registeredAt
                    });
                }

                return sendJSON(res, { valid: false });
            }

            return sendJSON(res, { valid: false, error: "Invalid parameters" });
        }

        // ==========================
        // POST /sync-db
        // ==========================
        if (req.method === "POST" && pathname === "/sync-db") {
            let body = "";
            req.on("data", chunk => { body += chunk; });
            req.on("end", async () => {
                try {
                    const data = JSON.parse(body);
                    if (data.db) await writeData(DB_KEY, data.db);
                    if (data.config) await writeData(CFG_KEY, data.config);
                    sendJSON(res, { success: true });
                } catch (err) {
                    res.writeHead(400);
                    res.end(err.toString());
                }
            });
            return;
        }

        // ==========================
        // Static files
        // ==========================
        if (req.method === "GET") {
            return serveStaticFile(req, res, pathname);
        }

        // ==========================
        // 404
        // ==========================
        res.writeHead(404);
        res.end();

    } catch (err) {
        console.error("Unhandled error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
    }
});

console.log(`SHT Studios Server startet auf Port ${PORT}...`);
console.log(USE_UPSTASH ? "Storage: Upstash Redis (persistent)" : "Storage: local JSON files (dev mode, not persistent on Render)");

server.listen(PORT, () => {
    console.log("Server läuft! Drücke STRG+C zum Beenden.");
});
