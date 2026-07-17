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

// Modello Gemini. "gemini-flash-latest" punta all'ultimo flash consigliato
// ed è idoneo al piano gratuito. Se dovesse dare errore, apri l'URL del
// Worker nel browser (richiesta GET) per vedere l'elenco dei modelli
// disponibili sulla tua chiave e scegline uno da lì.
const MODEL = "gemini-flash-latest";

// --- Voce di riserva: Gemini TTS (gratis ma solo ~10 richieste/giorno) ---
const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const TTS_VOICE = "Charon";

// --- Voce principale: ElevenLabs (elegante e veloce) ---
// Si attiva se aggiungi il secret ELEVENLABS_API_KEY. Puoi cambiare la voce:
// prendi un "Voice ID" dalla Voice Library di ElevenLabs (anche voci italiane).
// Default "George": maschile, caldo, britannico raffinato.
const ELEVEN_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const ELEVEN_MODEL = "eleven_multilingual_v2";

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

// ---- Modalità REPORT: l'assistente personale "J.A.R.V.I.S." ----
const REPORT_PROMPT = `Sei J.A.R.V.I.S., l'assistente personale dell'utente, specializzato nella gestione delle sue attività (to-do).
Personalità (ispirata al J.A.R.V.I.S. di Iron Man): un maggiordomo digitale britannico, impeccabilmente educato e formale, dai del "lei" e chiama l'utente per nome (campo "nome" nei dati) o "signore". Sei calmo, competente, leale e discreto. Hai un umorismo secco e "deadpan": ogni tanto una battuta sottile detta con perfetta compostezza, mai volgare, mai eccessiva. Non sei mai robotico né moralista: sei un collaboratore fidato che tiene le cose sotto controllo.
Ricevi in JSON lo stato delle attività dell'utente diviso in "personale" e "lavoro", con: testo, priorità, categoria, da quanti giorni è stata inserita (inseritaGiorniFa), come è stata inserita (origine: voce/testo/manuale), la frase originale detta (fraseOriginale), se è in ritardo (inRitardo), e le attività completate di recente. Inoltre: nome, livello, XP, serie di giorni consecutivi (streak), completate oggi.
Analizza questi dati e produci (in italiano):
- "saluto": una frase di benvenuto breve e personale in stile Jarvis (max 14 parole), col nome e adatta al momento della giornata.
- "panoramica": 2-3 frasi che riassumono con eleganza come sta andando (carico, equilibrio personale/lavoro, ritmo, streak).
- "focusOggi": 1-3 attività CONCRETE su cui concentrarsi oggi, citando il testo reale dell'attività; precedenza a urgenti e a quelle in ritardo.
- "osservazioni": 1-4 osservazioni utili e specifiche (attività ferme da giorni, dove tende a procrastinare, temi ricorrenti nelle frasi originali, categorie più cariche). Cita le attività reali; concediti al massimo una battuta sottile.
- "suggerimenti": 1-3 consigli pratici e garbati per sbloccarsi o migliorare.
Regole: NON inventare attività non presenti nei dati. Se non c'è nulla da fare, complimentati con signorile understatement e proponi riposo. Ogni voce di elenco è una frase breve. Niente markdown, solo testo semplice.`;

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    saluto: { type: "string" },
    panoramica: { type: "string" },
    focusOggi: { type: "array", items: { type: "string" } },
    osservazioni: { type: "array", items: { type: "string" } },
    suggerimenti: { type: "array", items: { type: "string" } },
  },
  required: ["saluto", "panoramica", "focusOggi", "osservazioni", "suggerimenti"],
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

// Gemini restituisce audio PCM grezzo (16-bit): lo impacchettiamo in WAV
// così il browser può riprodurlo direttamente.
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function pcmToWavBase64(pcmB64, sampleRate) {
  const pcm = base64ToBytes(pcmB64);
  const numChannels = 1, bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(buffer);
  let p = 0;
  const str = (s) => { for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i)); };
  const u32 = (v) => { view.setUint32(p, v, true); p += 4; };
  const u16 = (v) => { view.setUint16(p, v, true); p += 2; };
  str("RIFF"); u32(36 + pcm.length); str("WAVE");
  str("fmt "); u32(16); u16(1); u16(numChannels); u32(sampleRate); u32(byteRate); u16(blockAlign); u16(bitsPerSample);
  str("data"); u32(pcm.length);
  new Uint8Array(buffer, 44).set(pcm);
  return bytesToBase64(new Uint8Array(buffer));
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY non configurata" }, 500);

    // Diagnostica: apri l'URL del Worker nel browser (GET) per vedere
    // l'elenco dei modelli utilizzabili dalla tua chiave.
    if (request.method === "GET") {
      const lurl =
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=" + env.GEMINI_API_KEY;
      const lr = await fetch(lurl);
      const ld = await lr.json();
      const models = (ld.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace("models/", ""));
      return json({ modelloAttuale: MODEL, modelliDisponibili: models });
    }

    if (request.method !== "POST") return json({ error: "Usa POST" }, 405);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "JSON non valido" }, 400);
    }

    // Chiama Gemini con un prompt di sistema e uno schema, restituisce il JSON.
    async function askGemini(systemPrompt, userText, schema, temperature) {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        MODEL +
        ":generateContent?key=" +
        env.GEMINI_API_KEY;
      const payload = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          temperature: temperature,
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      };
      const g = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!g.ok) {
        const detail = await g.text();
        const e = new Error("gemini");
        e.detail = { status: g.status, detail };
        throw e;
      }
      const data = await g.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return JSON.parse(raw);
    }

    // ---- MODALITÀ VOCE (sintesi vocale neurale) ----
    if (body && body.mode === "speak") {
      const t = (body.text ? String(body.text) : "").trim();
      if (!t) return json({ error: "testo vuoto" }, 400);

      // Voce principale: ElevenLabs (se configurata la chiave)
      if (env.ELEVENLABS_API_KEY) {
        try {
          const url =
            "https://api.elevenlabs.io/v1/text-to-speech/" +
            ELEVEN_VOICE_ID +
            "?output_format=mp3_44100_128";
          const r = await fetch(url, {
            method: "POST",
            headers: {
              "xi-api-key": env.ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify({
              text: t,
              model_id: ELEVEN_MODEL,
              voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
            }),
          });
          if (!r.ok) {
            const detail = await r.text();
            return json({ error: "ElevenLabs " + r.status, detail }, 502);
          }
          const buf = new Uint8Array(await r.arrayBuffer());
          return json({ audio: bytesToBase64(buf), mime: "audio/mpeg" });
        } catch (e) {
          return json({ error: "ElevenLabs fallito" }, 502);
        }
      }

      // Riserva: Gemini TTS
      try {
        const url =
          "https://generativelanguage.googleapis.com/v1beta/models/" +
          TTS_MODEL +
          ":generateContent?key=" +
          env.GEMINI_API_KEY;
        const payload = {
          contents: [
            {
              parts: [
                {
                  text:
                    "Leggi ad alta voce con tono caldo, elegante, pacato e cortese, da raffinato maggiordomo britannico che parla un italiano impeccabile: " +
                    t,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
          },
        };
        const g = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!g.ok) {
          const detail = await g.text();
          return json({ error: "Gemini TTS " + g.status, detail }, 502);
        }
        const data = await g.json();
        const part = (data?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
        if (!part) return json({ error: "Nessun audio ricevuto" }, 502);
        const mime = part.inlineData.mimeType || "";
        const rate = parseInt((mime.match(/rate=(\d+)/) || [])[1] || "24000", 10);
        const audioWav = pcmToWavBase64(part.inlineData.data, rate);
        return json({ audioWav });
      } catch (e) {
        return json({ error: "Sintesi vocale fallita" }, 502);
      }
    }

    // ---- MODALITÀ REPORT (assistente) ----
    if (body && body.mode === "report") {
      try {
        const userText = "Dati attività dell'utente (JSON):\n" + JSON.stringify(body.payload || {});
        const parsed = await askGemini(REPORT_PROMPT, userText, REPORT_SCHEMA, 0.6);
        const report = {
          saluto: String(parsed.saluto || ""),
          panoramica: String(parsed.panoramica || ""),
          focusOggi: Array.isArray(parsed.focusOggi) ? parsed.focusOggi.map(String) : [],
          osservazioni: Array.isArray(parsed.osservazioni) ? parsed.osservazioni.map(String) : [],
          suggerimenti: Array.isArray(parsed.suggerimenti) ? parsed.suggerimenti.map(String) : [],
        };
        return json({ report });
      } catch (e) {
        if (e.detail) return json({ error: "Gemini ha risposto " + e.detail.status, detail: e.detail.detail }, 502);
        return json({ error: "Report non generato" }, 502);
      }
    }

    // ---- MODALITÀ ESTRAZIONE TASK (default) ----
    const text = (body && body.text ? String(body.text) : "").trim();
    if (!text) return json({ tasks: [] });
    try {
      const parsed = await askGemini(SYSTEM_PROMPT, "Testo da analizzare:\n" + text, RESPONSE_SCHEMA, 0.2);
      const tasks = Array.isArray(parsed.tasks)
        ? parsed.tasks
            .filter((t) => t && typeof t.text === "string" && t.text.trim())
            .map((t) => ({
              text: t.text.trim(),
              priority: ["urgente", "normale", "bassa"].includes(t.priority) ? t.priority : "normale",
            }))
        : [];
      return json({ tasks });
    } catch (e) {
      if (e.detail) return json({ error: "Gemini ha risposto " + e.detail.status, detail: e.detail.detail }, 502);
      return json({ error: "Risposta AI non interpretabile" }, 502);
    }
  },
};
