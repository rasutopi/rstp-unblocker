const express = require("express");
const router = express.Router();
const cloudscraper = require("cloudscraper");

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
      encoding: null, // ← バイナリ取得するために重要
      resolveWithFullResponse: true,
    });

    const contentType =
      response.headers["content-type"] || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.status(200).send(response.body);
  } catch (err) {
    res.status(500).send(`Error fetching ${url}: ${err.message}`);
  }
});

module.exports = router;
