const express = require("express");
const router = express.Router();
const { req } = require("curl-cffi");

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
  if (!url) return res.status(400).send("Missing url query parameter");

  try {
    const response = await req.get(url, {
      impersonate: "chrome136",
      timeout: 30000,
    });

    const contentType =
      response.headers?.get?.("content-type") ||
      "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.status(response.status || 200);

    if (response.dataRaw) {
      return res.send(Buffer.from(response.dataRaw));
    }

    if (typeof response.data === "string") {
      return res.send(response.data);
    }

    res.send("");
  } catch (err) {
    res.status(500).send(`Error fetching ${url}: ${err.message}`);
  }
});

module.exports = router;