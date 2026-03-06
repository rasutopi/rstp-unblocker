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

    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;

    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: headers,
      redirect: "manual"
    });

    // redirect
    if (response.status >= 300 && response.status < 400) {
      let location = response.headers.get("location");
      if (!location) {
        return res.status(502).send("Redirect without location header");
      }

      const resolvedUrl = new URL(location, url).toString();
      const proxiedLocation = `/?url=${encodeURIComponent(resolvedUrl)}`;

      return res.redirect(response.status, proxiedLocation);
    }

    // statusそのまま
    res.status(response.status);

    // header転送
    response.headers.forEach((value, key) => {
      if (key === "transfer-encoding" || key === "connection") return;
      res.setHeader(key, value);
    });

    // stream pipe
    response.body.pipe(res);

  } catch (err) {
    res.status(500).send(`Error fetching upstream: ${err.message}`);
  }
});

module.exports = router;
