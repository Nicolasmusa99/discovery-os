export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
};

// ── Rate limiting por IP ──────────────────────────────────
const RATE_LIMIT = 20;
const WINDOW_MS  = 60 * 1000;
const ipMap      = new Map();

function isRateLimited(ip) {
  const now   = Date.now();
  const entry = ipMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

// ── PDF size limit (~3 páginas) ───────────────────────────
const MAX_PDF_BYTES = 150 * 1024;

function pdfTooLarge(body) {
  try {
    for (const msg of body?.messages || []) {
      for (const block of Array.isArray(msg.content) ? msg.content : []) {
        if (block?.type === "document" && block?.source?.media_type === "application/pdf") {
          if ((block.source.data?.length || 0) * 0.75 > MAX_PDF_BYTES) return true;
        }
      }
    }
  } catch {}
  return false;
}

// ── Handler ───────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS headers para que el browser pueda llamar a /api/claude
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Demasiadas solicitudes. Esperá un momento." });
  }

  if (pdfTooLarge(req.body)) {
    return res.status(400).json({ error: "El PDF es demasiado grande. Máximo 3 páginas." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
