
# 🧠 AI Room Editor — Pilotprojekt

🚀 Deployment länk: https://stable-diffusor-joelp.netlify.app/

Detta är ett experimentellt projekt som använder generativ AI för att placera användaruppladdade objekt (som mattor) in i AI-genererade bilder av rum. Projektet bygger på en kombination av:

- 🧱 **Stable Diffusion v1.5** – för att generera grundläggande rumsmiljöer.
- 🧠 **ControlNet (Kandinsky 2.2 Depth)** – för att försöka placera in en uppladdad bild i scenen baserat på djupinformation.
- ☁️ **Supabase** – för autentisering och filuppladdningar.
- 💻 **Next.js (App Router)** – för frontend + API-routes som kommunicerar med Replicate.
- 🖼️ **Replicate API** – för att köra modeller via REST.

---

## 📦 Installation

```bash
git clone https://github.com/JPereyra7/pilotprojekt-stable-diffusor.git
cd pilotprojekt-stable-diffusor
npm install
```

### 🔐 Miljövariabler

Skapa en `.env.local` och lägg till följande:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_MODELSLAB_KEY=your_modelslab_key
REPLICATE_API_TOKEN=your_replicate_token
```

---

## 🚀 Starta projektet lokalt

```bash
npm run dev
```

---

## ⚠️ Begränsningar

- Modellerna har begränsad förmåga att exakt placera ett specifikt objekt i en befintlig bild.
- Replicate kräver **betald kreditering** för att köra vissa modeller.
- Resultaten kan ibland vara oförutsägbara då vissa modeller "hallucinerar" innehåll istället för att följa instruktioner strikt.
- Detta är ett pilotprojekt och inte optimerat för produktion.

---

## 🔮 Nästa steg

- Utvärdera lokala lösningar med ComfyUI eller Automatic1111 för bättre precision vid inpainting.
- Implementera image masking via ControlNet.
- Möjliggöra användarinteraktion för att rita egna maskområden.

---

## 📄 Licens

MIT
