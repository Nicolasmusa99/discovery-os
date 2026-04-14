export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
};

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

// ── Convertir formato Anthropic → Gemini ─────────────────
function toGeminiMessages(messages, system) {
  const contents = [];
  if (system) {
    contents.push({ role: "user",  parts: [{ text: `[INSTRUCCIONES]\n${system}` }] });
    contents.push({ role: "model", parts: [{ text: "Entendido." }] });
  }
  for (const msg of messages) {
    const role = msg.role === "assistant" ? "model" : "user";
    let text = "";
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content.filter(b => b.type === "text").map(b => b.text).join("\n");
    }
    if (text.trim()) contents.push({ role, parts: [{ text }] });
  }
  return contents;
}

// ── Handler ───────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (pdfTooLarge(req.body)) {
    return res.status(400).json({ error: "El PDF es demasiado grande. Máximo 3 páginas." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  try {
    const { messages, system, max_tokens } = req.body;
    const contents = toGeminiMessages(messages, system);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: max_tokens || 1000,
            temperature: 0.7,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || "Error de Gemini" });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return res.status(200).json({
      content: [{ type: "text", text }],
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
