export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
};

// ── PDF size limit ────────────────────────────────────────
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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (pdfTooLarge(req.body)) {
    return res.status(400).json({ error: "El PDF es demasiado grande. Máximo 3 páginas." });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  }

  try {
    const { messages, system, max_tokens } = req.body;

    // Groq usa el mismo formato que OpenAI
    const groqMessages = [];
    if (system) groqMessages.push({ role: "system", content: system });
    for (const m of messages || []) {
      const content = typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content.filter(b => b.type === "text").map(b => b.text).join("\n")
          : "";
      if (content.trim()) groqMessages.push({ role: m.role, content });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: groqMessages,
        max_tokens: max_tokens || 1000,
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || `Error ${response.status}` });
    }

    const text = data.choices?.[0]?.message?.content || "";
    return res.status(200).json({
      content: [{ type: "text", text }],
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
