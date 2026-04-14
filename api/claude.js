// ── Rate limiting por IP ──────────────────────────────────
// Máximo 20 requests por IP cada 60 segundos
const RATE_LIMIT   = 20;
const WINDOW_MS    = 60 * 1000;
const ipMap        = new Map(); // { ip: { count, resetAt } }

function isRateLimited(ip) {
  const now  = Date.now();
  const entry = ipMap.get(ip);

  if (!entry || now > entry.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

// ── Límite de páginas PDF ─────────────────────────────────
// Si el body contiene un document block tipo PDF, verificamos
// que el base64 no sea demasiado grande (~3 páginas ≈ 150KB)
const MAX_PDF_BYTES = 150 * 1024; // 150 KB en base64 ≈ 3 páginas promedio

function pdfTooLarge(body) {
  try {
    const messages = body?.messages || [];
    for (const msg of messages) {
      const content = Array.isArray(msg.content) ? msg.content : [];
      for (const block of content) {
        if (block?.type === "document" && block?.source?.media_type === "application/pdf") {
          const bytes = (block.source.data?.length || 0) * 0.75; // base64 → bytes aprox
          if (bytes > MAX_PDF_BYTES) return true;
        }
      }
    }
  } catch {}
  return false;
}

// ── Handler ───────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Rate limit
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Demasiadas solicitudes. Esperá un momento e intentá de nuevo." });
  }

  // PDF size limit
  if (pdfTooLarge(req.body)) {
    return res.status(400).json({ error: "El PDF es demasiado grande. Usá documentos de hasta 3 páginas." });
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
