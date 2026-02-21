const express = require("express");
const router = express.Router();
require("dotenv").config();

const STATIC_API_V4 = process.env.STATIC_API_V4;

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
    const upstreamUrl = `${STATIC_API_V4}?url=${encodeURIComponent(url)}`;

    const response = await fetch(upstreamUrl, {
      method: "GET",
    });

    if (!response.ok) {
      return res
        .status(response.status)
        .send(`Upstream error: ${response.statusText}`);
    }

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    const arrayBuffer = await response.arrayBuffer();
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(500).send(`Error fetching upstream: ${err.message}`);
  }
});

module.exports = router;
