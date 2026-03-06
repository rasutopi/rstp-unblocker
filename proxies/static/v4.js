const express = require("express");
const { Readable } = require("stream"); // Web Streamを変換するために必要
const router = express.Router();
require("dotenv").config();

const STATIC_API_V4 = process.env.STATIC_API_V4;

// CORS設定
router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

    // ヘッダーのコピーと調整
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;

    // Pythonサーバー（FastAPI）へリクエスト
    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: headers,
      redirect: "manual"
    });

    // 1. リダイレクト処理
    if (response.status >= 300 && response.status < 400) {
      let location = response.headers.get("location");
      if (!location) {
        return res.status(502).send("Redirect without location header");
      }

      const resolvedUrl = new URL(location, url).toString();
      const proxiedLocation = `/?url=${encodeURIComponent(resolvedUrl)}`;

      return res.redirect(response.status, proxiedLocation);
    }

    // 2. ステータスコードの設定
    res.status(response.status);

    // 3. ヘッダーの転送
    // Content-Lengthはストリーム時に不整合（XMLパースエラー）の原因になるため転送しない
    const excludedHeaders = [
      "transfer-encoding",
      "connection",
      "content-length",
      "content-encoding"
    ];

    response.headers.forEach((value, key) => {
      if (excludedHeaders.includes(key.toLowerCase())) return;
      res.setHeader(key, value);
    });

    // 4. ストリームのパイプ（ここが重要）
    // Node.jsのfetchが返すのは Web Stream (ReadableStream) なので、
    // Readable.fromWeb を使って Node.js Stream に変換してから pipe する
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body);
      
      // デバッグが必要な場合は、ここでデータの中身を少し覗くことができます
      /*
      nodeStream.on('data', (chunk) => {
        console.log("Receiving chunk of size:", chunk.length);
      });
      */

      nodeStream.pipe(res);
    } else {
      res.end();
    }

  } catch (err) {
    console.error("Proxy Error:", err);
    res.status(500).send(`Error fetching upstream: ${err.message}`);
  }
});

module.exports = router;
