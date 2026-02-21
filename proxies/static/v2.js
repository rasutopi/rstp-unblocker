const express = require("express");
const router = express.Router();
const { req } = require("curl-cffi");

req.session = undefined;

router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

router.get("/", async (reqExpress, res) => {
  const { url } = reqExpress.query;
  if (!url) return res.status(400).send("Missing url");

  let response;

  try {
    console.log("Proxy start:", url);

    response = await req.get(url, {
      impersonate: "chrome136",
      signal: AbortSignal.timeout(10000)
    });

    if (!response) throw new Error("Empty response");

    const contentType =
      response.headers?.get?.("content-type") ||
      "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.status(response.status || 200);

    if (response.dataRaw) {
      return res.end(Buffer.from(response.dataRaw));
    }

    if (typeof response.data === "string") {
      return res.end(response.data);
    }

    return res.end("");

  } catch (err) {
    console.error("Proxy error:", err.message);

    if (!res.headersSent) {
      res.status(500).end("Proxy error");
    }

  } finally {
    console.log("Proxy finished");

    try {
      response?.close?.();
    } catch {}
  }
});

module.exports = router;