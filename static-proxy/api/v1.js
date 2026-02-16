export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing url query parameter");

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).send(`Upstream error: ${response.statusText}`);
    }

    // 元の Content-Type をそのまま設定
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    // CORS 有効
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");

    // OPTIONS メソッドのプリフライト対応
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    const arrayBuffer = await response.arrayBuffer();
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(500).send(`Error fetching ${url}: ${err.message}`);
  }
}
