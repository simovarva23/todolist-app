// ===========================================================
// TODOLIST — Cloudflare Worker (ponte verso Google Gemini)
// Tiene NASCOSTA la tua chiave API: l'app parla con questo Worker,
// il Worker parla con Gemini usando la chiave salvata come "secret".
//
// Come si usa: incolla questo file nell'editor del Worker su
// dash.cloudflare.com, aggiungi la variabile segreta GEMINI_API_KEY,
// e fai Deploy. Poi incolla l'URL del Worker nelle impostazioni ⚙️
// dell'app todolist.
// ===========================================================

// Modello Gemini gratuito. Se dovesse dare errore "model not found",
// prova a cambiarlo (es. "gemini-2.5-flash" o "gemini-1.5-flash").
const MODEL = "gemini-2.0-flash";

const SYSTEM_PROMPT = `Sei un assistente che estrae attività (to-do) da un testo dettato o scritto in italiano, spesso disordinato.
Regole:
- Restituisci un elenco di attività brevi, chiare e concrete (massimo una riga ciascuna).
- Riformula in modo pulito, correggi errori di trascrizione evidenti, ma NON inventare attività non presenti.
- Se il testo contiene più cose da fare, separale in attività distinte.
- Per ciascuna assegna una priorità:
  * "urgente" se ci sono parole come subito, urgente, entro oggi, scadenza, importante, non dimenticare;
  * "bassa" se ci sono parole come quando puoi, con calma, prima o poi, se hai tempo;
  * "normale" in tutti gli altri casi.
- Ogni attività inizia con la lettera maiuscola, senza punto finale.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          priority: { type: "string", enum: ["urgente", "normale", "bassa"] },
        },
        required: ["text", "priority"],
      },
    },
  },
  required: ["tasks"],
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return json({ error: "Usa POST" }, 405);
    if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY non configurata" }, 500);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "JSON non valido" }, 400);
    }
    const text = (body && body.text ? String(body.text) : "").trim();
    if (!text) return json({ tasks: [] });

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      MODEL +
      ":generateContent?key=" +
      env.GEMINI_API_KEY;

    const payload = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: "Testo da analizzare:\n" + text }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    let g;
    try {
      g = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return json({ error: "Rete verso Gemini fallita" }, 502);
    }

    if (!g.ok) {
      const detail = await g.text();
      return json({ error: "Gemini ha risposto " + g.status, detail }, 502);
    }

    const data = await g.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: "Risposta AI non interpretabile", raw }, 502);
    }

    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks
          .filter((t) => t && typeof t.text === "string" && t.text.trim())
          .map((t) => ({
            text: t.text.trim(),
            priority: ["urgente", "normale", "bassa"].includes(t.priority) ? t.priority : "normale",
          }))
      : [];

    return json({ tasks });
  },
};
