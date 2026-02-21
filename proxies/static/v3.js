const express = require("express");
const router = express.Router();
const { CurlSession } = require("curl-cffi");

router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

router.get("/", async (reqExpress, res) => {
  const { url } = reqExpress.query;
  if (!url) return res.status(400).send("Missing url");

  const session = new CurlSession();

  try {
    console.log("Proxy start:", url);

    const response = await session.get(url, {
      impersonate: "chrome136",
      timeout: 10000,
      httpVersion: 1,
      keepAlive: false
    });

    if (!response) throw new Error("Empty response");

    // --- Content-Type の解決 ---
    let contentType = "application/octet-stream";
    if (response.headers) {
      contentType = response.headers["content-type"] || contentType;
    }

    if (url.includes("count.getloli.com") || url.includes(".svg")) {
      contentType = "image/svg+xml";
    } else if (url.includes(".css")) {
      contentType = "text/css";
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline"); // ブラウザでの表示を優先
    res.status(response.status || 200);

    // --- データの送信 ---
    const rawData = response.dataRaw || response.data;
    return res.send(Buffer.from(rawData));

  } catch (err) {
    console.error("Proxy error:", err.message);
    if (!res.headersSent) {
      res.status(500).send("Proxy error: " + err.message);
    }
  } finally {
    try {
      session.close();
    } catch (e) {}
    console.log("Proxy finished");
  }
});

module.exports = router;