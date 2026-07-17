# Attivare l'assistente AI (Google Gemini) — guida in 3 passi

L'app funziona già senza AI (analisi locale). Questi passi aggiungono l'AI di Google
**gratuita**, tenendo la tua chiave al sicuro dietro un piccolo "ponte" su Cloudflare.

---

## Passo 1 — Ottieni la chiave Gemini (gratis)

1. Vai su **https://aistudio.google.com/apikey** e accedi con il tuo account Google.
2. Clicca **"Create API key"** (Crea chiave API).
3. Copia la chiave (una stringa lunga). Tienila da parte, ci serve al Passo 2.

> Il piano gratuito basta per un uso personale (poche richieste al giorno).

---

## Passo 2 — Crea il "ponte" su Cloudflare (gratis)

1. Crea un account gratuito su **https://dash.cloudflare.com** (se non ce l'hai).
2. Nel menu a sinistra: **Workers & Pages** → **Create** → **Create Worker**.
3. Dai un nome (es. `todolist-ai`) e clicca **Deploy**.
4. Clicca **Edit code**: cancella tutto e incolla il contenuto del file
   [`worker.js`](worker.js). Poi **Deploy** (in alto a destra).
5. Aggiungi la chiave come segreto:
   - Vai su **Settings** → **Variables and Secrets** (o "Variabili").
   - **Add** → tipo **Secret** → Nome: `GEMINI_API_KEY` → Valore: la chiave del Passo 1.
   - Salva / **Deploy**.
6. Copia l'**URL del Worker** (qualcosa tipo `https://todolist-ai.tuonome.workers.dev`).

---

## Passo 3 — Collega l'app

1. Apri la todolist, tocca l'ingranaggio **⚙️** in alto a destra nella home.
2. Incolla l'URL del Worker nel campo **"URL del Worker AI"**.
3. **Salva**. Dovresti vedere **● AI attiva**.

Fatto! Ora quando detti o scrivi, l'AI ordina le attività e assegna le priorità
automaticamente. Se l'AI non è raggiungibile, l'app torna da sola all'analisi locale.

---

## Note

- **Costi:** zero, entro i limiti gratuiti di Gemini e Cloudflare.
- **Sicurezza:** la chiave resta solo dentro Cloudflare, mai nell'app pubblica.
- **Cambiare modello:** in `worker.js` puoi modificare la costante `MODEL`
  (es. `gemini-2.5-flash`) se un modello non fosse disponibile.
- **Disattivare l'AI:** svuota il campo URL nelle impostazioni e Salva.
