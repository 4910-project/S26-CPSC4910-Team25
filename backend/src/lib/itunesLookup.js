const https = require("https");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "S26-CPSC4910-Team25/1.0",
        },
      },
      (res) => {
        const status = Number(res.statusCode || 0);
        if (status >= 400) {
          res.resume();
          reject(new Error(`catalog lookup failed with status ${status}`));
          return;
        }

        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw || "{}"));
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on("error", reject);
  });
}

async function lookupCatalogItems(itemIds) {
  const uniqueIds = [...new Set(itemIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const byId = new Map();
  const batchSize = 50;

  for (let index = 0; index < uniqueIds.length; index += batchSize) {
    const batch = uniqueIds.slice(index, index + batchSize);
    const payload = await fetchJson(
      `https://itunes.apple.com/lookup?id=${encodeURIComponent(batch.join(","))}&country=US`
    );
    const results = Array.isArray(payload?.results) ? payload.results : [];

    results.forEach((item) => {
      if (item?.trackId != null) {
        byId.set(String(item.trackId), item);
      }
      if (item?.collectionId != null) {
        byId.set(String(item.collectionId), item);
      }
    });
  }

  return byId;
}

module.exports = {
  lookupCatalogItems,
};
