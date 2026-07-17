const http = require("http");
const fs = require("fs");
const url = require("url");

const PORT = 8080;
const DB_FILE = "shtStudiosDB";
const CFG_FILE = "shtStudiosConfig";

function readJson(file, fallback) {
    if (!fs.existsSync(file)) return fallback;

    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJson(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data));
    } catch (err) {
        console.error(err);
    }
}

function sendJSON(res, data, status = 200) {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    });

    res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {

    const parsedUrl = url.parse(req.url, true);

    // ==========================
    // GET /get-db
    // ==========================
    if (req.method === "GET" && parsedUrl.pathname === "/get-db") {

        const db = readJson(DB_FILE, {
            registrations: []
        });

        const cfg = readJson(CFG_FILE, {
            placeId: "",
            redirectPlaceId: "",
            requireCode: false,
            accessCodes: []
        });

        return sendJSON(res, {
            db,
            config: cfg
        });
    }

    // ==========================
    // GET /api
    // ==========================
    if (
        req.method === "GET" &&
        (parsedUrl.pathname === "/api" ||
            parsedUrl.pathname === "/api.html")
    ) {

        const action = parsedUrl.query.action;
        const playerId = parsedUrl.query.id;
        const apiKey = parsedUrl.query.key;

        if (action === "verify" && playerId) {

            const cfg = readJson(CFG_FILE, {});
            const expectedKey = cfg.apiKey;

            if (expectedKey && apiKey !== expectedKey) {
                return sendJSON(res, {
                    valid: false,
                    error: "Invalid API key"
                });
            }

            const db = readJson(DB_FILE, {
                registrations: []
            });

            const found = db.registrations.find(r =>
                String(r.id).trim() === String(playerId).trim()
            );

            if (found && found.status === "active") {

                found.verifyCount = (found.verifyCount || 0) + 1;
                found.lastVerifiedAt = 1720000000000;

                writeJson(DB_FILE, db);

                return sendJSON(res, {
                    valid: true,
                    robloxUsername: found.robloxUsername,
                    registeredAt: found.registeredAt
                });
            }

            return sendJSON(res, {
                valid: false
            });
        }

        return sendJSON(res, {
            valid: false,
            error: "Invalid parameters"
        });
    }

    // ==========================
    // POST /sync-db
    // ==========================
    if (req.method === "POST" && parsedUrl.pathname === "/sync-db") {

        let body = "";

        req.on("data", chunk => {
            body += chunk;
        });

        req.on("end", () => {

            try {

                const data = JSON.parse(body);

                if (data.db) {
                    writeJson(DB_FILE, data.db);
                }

                if (data.config) {
                    writeJson(CFG_FILE, data.config);
                }

                sendJSON(res, {
                    success: true
                });

            } catch (err) {

                res.writeHead(400);
                res.end(err.toString());

            }

        });

        return;
    }

    // ==========================
    // 404
    // ==========================
    res.writeHead(404);
    res.end();

});

console.log(`SHT Studios Server startet auf Port ${PORT}...`);

server.listen(PORT, () => {
    console.log("Server läuft! Drücke STRG+C zum Beenden.");
});