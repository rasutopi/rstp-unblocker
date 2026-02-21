const express = require("express");
const cloudscraper = require("cloudscraper");
const router = express.Router();

router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

router.get("/", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing url query parameter");

  try {
    const response = await cloudscraper.get({
      uri: url,
      encoding: null, // ← バイナリ対応
      resolveWithFullResponse: true,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });

    const contentType =
      response.headers["content-type"] || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.status(response.statusCode).send(response.body);
  } catch (err) {
    res.status(500).send(`Error fetching ${url}: ${err.message}`);
  }
});

module.exports = router;
