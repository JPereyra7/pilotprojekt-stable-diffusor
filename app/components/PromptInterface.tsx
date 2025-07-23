"use client";

import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import Image from "next/image";
import MediatellLogo from "@/public/cropped-mediatell_logo.webp";
import { supabase } from "../lib/supabaseClient";
import { sanitizeFileName } from "../lib/helpers/sanitizeFileName";

type MLStatus = "success" | "processing" | "failed";
interface MLResponse {
  status: MLStatus;
  output?: string[];
  fetch_result?: string;
  message?: string;
}
interface ChatMessage {
  type: "user" | "assistant" | "loading";
  content: string;
  imageUrl?: string;
}

const KEY = process.env.NEXT_PUBLIC_MODELSLAB_KEY!;
const T2I_ENDPOINT = "https://modelslab.com/api/v6/realtime/text2img";
const IMG2IMG_ENDPOINT = "https://modelslab.com/api/v6/realtime/img2img";
const MODEL_T2I = "runwayml/stable-diffusion-v1-5";
const REPLICATE_API_TOKEN = process.env.NEXT_PUBLIC_REPLICATE_API_TOKEN!;
const REPLICATE_KANDINSKY_URL = "https://api.replicate.com/v1/predictions";
const KANDINSKY_MODEL = "cjwbw/kandinsky-2-2-controlnet-depth";

/* ---------- gemensamma hjälpare ---------- */
async function fetchJson<T>(input: RequestInfo, init: RequestInit) {
  const r = await fetch(input, init);
  const txt = await r.text();
  try {
    return JSON.parse(txt) as T;
  } catch {
    throw new Error(`Non‑JSON (${r.status}) : ${txt.slice(0, 120)}…`);
  }
}

async function pollForResult(url: string) {
  const stop = Date.now() + 120_000;
  while (Date.now() < stop) {
    const d = await fetchJson<MLResponse>(url, {
      method: "POST",
      headers: { key: KEY, "Content-Type": "application/json" },
    });
    if (d.status === "success" && d.output?.length) return d.output[0];
    if (d.status === "failed")
      throw new Error(d.message || "generation failed");
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Modelslab timeout");
}

async function runKandinskyControlnetViaServerRoute(
  initImage: string,
  controlImage: string,
  prompt: string
): Promise<string> {
  // 1. Starta prediction via din egen route
  const startRes = await fetch("/api/replicate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version:
        "98b54ca0b42be225e927f1dae2d9c506e69fe5b3bce301e13718d662a227a12b",
      input: {
        prompt: prompt,
        image: initImage,
        control_image: controlImage,
        num_inference_steps: 30,
        guidance_scale: 4.5,
      },
    }),
  });

  const startData = await startRes.json();
  const statusUrl = startData?.urls?.get;

  if (!statusUrl) {
    throw new Error("Failed to start prediction.");
  }

  // 2. Polla tills den är klar
  while (true) {
    const predictionId = statusUrl.split("/").pop();
    const res = await fetch(`/api/replicate/${predictionId}`);

    const data = await res.json();

    if (data.status === "succeeded") {
      return data.output[0];
    } else if (data.status === "failed") {
      throw new Error("Replicate prediction failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, 3000)); // Vänta 3 sek innan ny poll
  }
}

async function removeRugBackground(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const cvs = new OffscreenCanvas(img.width, img.height);
  const ctx = cvs.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];

    // Identifiera vit/ljus bakgrund
    const brightness = (r + g + b) / 3;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    const isBackground = brightness > 220 && saturation < 30;

    if (isBackground) {
      // Gradual transparency baserat på brightness
      const alpha = Math.max(0, (255 - brightness) * 2);
      data[i + 3] = alpha;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Lägg till subtle drop shadow för realism
  const shadowCvs = new OffscreenCanvas(img.width + 20, img.height + 20);
  const shadowCtx = shadowCvs.getContext("2d")!;

  // Rita skugga först
  shadowCtx.globalAlpha = 0.3;
  shadowCtx.filter = "blur(8px)";
  shadowCtx.drawImage(cvs, 12, 12);

  // Rita mattan ovanpå
  shadowCtx.globalAlpha = 1;
  shadowCtx.filter = "none";
  shadowCtx.drawImage(cvs, 10, 10);

  const blob = await shadowCvs.convertToBlob({ type: "image/png" });
  return URL.createObjectURL(blob);
}

/* ---------- Smart floor detection ---------- */
function detectFloorArea(roomImg: ImageBitmap): { corners: number[] } {
  const w = roomImg.width;
  const h = roomImg.height;

  // Realistiska perspektiv-punkter för golvmatta
  // Trapetsform som följer perspektiv-linjerna
  return {
    corners: [
      w * 0.25,
      h * 0.75, // vänster bak
      w * 0.75,
      h * 0.75, // höger bak
      w * 0.85,
      h * 0.9, // höger fram
      w * 0.15,
      h * 0.9, // vänster fram
    ],
  };
}

/* ---------- Korrekt perspective warp med CSS transforms ---------- */
import {
  createPerspectiveTransform,
  applySimplePerspective,
} from "../lib/warp";

async function compositeRugOnFloor(
  roomUrl: string,
  rugUrl: string
): Promise<string> {
  const [roomImg, rugImg] = await Promise.all([
    createImageBitmap(await fetch(roomUrl).then((r) => r.blob())),
    createImageBitmap(await fetch(rugUrl).then((r) => r.blob())),
  ]);

  const cvs = new OffscreenCanvas(roomImg.width, roomImg.height);
  const ctx = cvs.getContext("2d")!;

  // Rita rummet först
  ctx.drawImage(roomImg, 0, 0);

  // Få floor corners och beräkna transform
  const floor = detectFloorArea(roomImg);
  const transform = createPerspectiveTransform(
    rugImg.width,
    rugImg.height,
    floor.corners
  );

  // Rita mattan med perspective
  ctx.save();
  ctx.globalAlpha = 0.9;
  applySimplePerspective(ctx, rugImg, transform);
  ctx.restore();

  // Lägg till realistisk skugga
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.2;

  const shadowOffset = transform.scaleY * rugImg.height * 0.1;
  const shadowGradient = ctx.createRadialGradient(
    transform.centerX,
    transform.centerY + shadowOffset,
    0,
    transform.centerX,
    transform.centerY + shadowOffset,
    Math.max(
      transform.scaleX * rugImg.width,
      transform.scaleY * rugImg.height
    ) * 0.6
  );
  shadowGradient.addColorStop(0, "rgba(0,0,0,0.3)");
  shadowGradient.addColorStop(1, "rgba(0,0,0,0)");

  ctx.fillStyle = shadowGradient;
  ctx.fillRect(
    transform.centerX - transform.scaleX * rugImg.width * 0.8,
    transform.centerY - transform.scaleY * rugImg.height * 0.4,
    transform.scaleX * rugImg.width * 1.6,
    transform.scaleY * rugImg.height * 1.2
  );
  ctx.restore();

  const blob = await cvs.convertToBlob({ type: "image/png" });
  return URL.createObjectURL(blob);
}

export function PromptInterface() {
  /* ---- state ---- */
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [rugFile, setRugFile] = useState<File | null>(null);
  const [rugPrev, setRugPrev] = useState<string | null>(null);
  const [rugUrl, setRugUrl] = useState<string | null>(null);

  const [modal, setModal] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (rugPrev) URL.revokeObjectURL(rugPrev);
    };
  }, [rugPrev]);

  /* ---------- steg 1: generera rum ---------- */
  async function genRoom(text: string) {
    setMsgs((m) => [
      ...m,
      { type: "user", content: text },
      { type: "loading", content: "Genererar rum…" },
    ]);
    setPrompt("");
    setLoading(true);

    try {
      const enhancedPrompt = `${text}, clear floor visible, interior photography, realistic perspective, good lighting`;

      const body = {
        prompt: enhancedPrompt,
        model_id: MODEL_T2I,
        aspect_ratio: "1:1",
        guidance_scale: 7.5,
        num_inference_steps: 25,
      };

      const data = await fetchJson<MLResponse>(T2I_ENDPOINT, {
        method: "POST",
        headers: { key: KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const imgUrl =
        data.status === "success"
          ? data.output![0]
          : await pollForResult(data.fetch_result!);

      setRoomUrl(imgUrl);
      setMsgs((m) => [
        ...m.slice(0, -1),
        {
          type: "assistant",
          content: "Här är rummet! Nu kan du ladda upp en matta.",
          imageUrl: imgUrl,
        },
      ]);
    } catch (e) {
      setMsgs((m) => [
        ...m.slice(0, -1),
        { type: "assistant", content: `Fel: ${(e as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  /* ---------- steg 2: smart rug placement med minimal AI polish ---------- */
  async function placeRug(text: string) {
    if (!roomUrl || !rugFile) return;
    setMsgs((m) => [
      ...m,
      { type: "user", content: text },
      { type: "loading", content: "Placerar matta med hög precision…" },
    ]);
    setPrompt("");
    setLoading(true);

    try {
      const processedRugUrl = await removeRugBackground(rugFile);

      let publicRug = rugUrl;
      if (!publicRug) {
        const rugBlob = await fetch(processedRugUrl).then((r) => r.blob());
        const name = `${Date.now()}_processed_${sanitizeFileName(
          rugFile.name
        )}.png`;

        await supabase.storage
          .from("carpet-uploads")
          .upload(name, rugBlob, { upsert: true });
        publicRug = supabase.storage.from("carpet-uploads").getPublicUrl(name)
          .data.publicUrl;
        setRugUrl(publicRug);
      }

      const compLocalUrl = await compositeRugOnFloor(roomUrl, publicRug);

      const preservationPrompt = `${
        text || "interior photograph"
      }, KEEP the exact same rug pattern and colors as shown, preserve rug design, natural lighting, seamless floor placement, photorealistic, high quality, do not change rug appearance, maintain original rug texture and pattern`;

      const polishBody = {
        init_image: compLocalUrl, 
        prompt: preservationPrompt,
        negative_prompt:
          "different rug pattern, changed colors, new rug design, floating objects, multiple rugs, unrealistic shadows, blurry edges",
        strength: "0.08", 
        steps: 15,
        guidance_scale: 5.0, 
        model_id: MODEL_T2I,

        controlnet_conditioning_scale: "0.9",
      };

      const USE_AI_POLISH = true;

      let finalUrl;

      if (USE_AI_POLISH) {
        const roomBlob = await fetch(roomUrl).then((r) => r.blob());
        const rugBlob = await fetch(processedRugUrl).then((r) => r.blob());

        const roomName = `${Date.now()}_room.png`;
        const rugName = `${Date.now()}_rug_processed.png`;

        await Promise.all([
          supabase.storage
            .from("carpet-uploads")
            .upload(roomName, roomBlob, { upsert: true }),
          supabase.storage
            .from("carpet-uploads")
            .upload(rugName, rugBlob, { upsert: true }),
        ]);

        const roomPublic = supabase.storage
          .from("carpet-uploads")
          .getPublicUrl(roomName).data.publicUrl;
        const rugPublic = supabase.storage
          .from("carpet-uploads")
          .getPublicUrl(rugName).data.publicUrl;

        finalUrl = await runKandinskyControlnetViaServerRoute(
          roomPublic,
          rugPublic,
          preservationPrompt
        );
      } else {
        finalUrl = compLocalUrl;
      }

      /* Clean up */
      URL.revokeObjectURL(processedRugUrl);
      if (rugPrev) URL.revokeObjectURL(rugPrev);

      setMsgs((m) => [
        ...m.slice(0, -1),
        {
          type: "assistant",
          content: "Perfekt! Din matta är nu placerad i rummet.",
          imageUrl: finalUrl,
        },
      ]);

      setRugFile(null);
      setRugPrev(null);
      setRugUrl(null);
    } catch (e) {
      setMsgs((m) => [
        ...m.slice(0, -1),
        { type: "assistant", content: `Fel: ${(e as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    if (!roomUrl) {
      await genRoom(prompt);
    } else if (rugFile) {
      await placeRug(prompt);
    } else {
      setMsgs((m) => [
        ...m,
        { type: "user", content: prompt },
        {
          type: "assistant",
          content: "Ladda upp en matta först för att placera den i rummet!",
        },
      ]);
      setPrompt("");
    }
  };

  function pick(f: File) {
    setRugFile(f);
    const u = URL.createObjectURL(f);
    setRugPrev((p) => {
      if (p) URL.revokeObjectURL(p);
      return u;
    });

    setMsgs((m) => [
      ...m,
      {
        type: "assistant",
        content:
          "Matta laddad! Skriv en beskrivning eller tryck bara 'Skicka' för att placera den i rummet.",
      },
    ]);
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0e0e10] text-white">
      <header className="border-b border-[#323237] p-4">
        <Image src={MediatellLogo} alt="logo" width={120} height={40} />
      </header>

      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        {msgs.length === 0 && (
          <div className="text-center mt-16">
            <h1 className="text-3xl font-bold mb-4">
              Välkommen till{" "}
              <span className="text-orange-500">Interior<span className="italic text-orange-200">AI</span></span>
            </h1>
            <div className="text-gray-400 leading-relaxed space-y-2">
              <p>
                <strong>Steg 1:</strong> Skriv en prompt och generera ett rum
                med synligt golv
              </p>
              <p>
                <strong>Steg 2:</strong> Ladda upp din matta (helst med vit
                bakgrund)
              </p>
              <p>
                <strong>Steg 3:</strong> AI placerar mattan automatiskt och
                polerar resultatet!
              </p>
              <div className="mt-4 p-3 bg-orange-500/10 rounded border border-orange-500/30">
                <p className="text-sm text-orange-300">
                  💡 <strong>Tips:</strong> Använd prompts som &quot;living room
                  with wooden floor&quot; eller &quot;bedroom with carpet area
                  visible&quot;
                </p>
              </div>
            </div>
          </div>
        )}

        {/* —— chatt —— */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {msgs.map((m, i) => (
            <div key={i} className="flex gap-4">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                  m.type === "user"
                    ? "bg-orange-500 text-white"
                    : "bg-[#1a1a1d] text-gray-300 border border-[#323237]"
                }`}
              >
                {m.type === "user" ? "Du" : "AI"}
              </div>
              <div className="flex-1">
                {m.type === "loading" ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full"></div>
                    <p className="text-gray-400">{m.content}</p>
                  </div>
                ) : (
                  <div className="border border-[#323237] bg-[#1a1a1d] p-4 rounded-lg">
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.imageUrl && (
                      <Image
                        src={m.imageUrl}
                        alt=""
                        onClick={() => setModal(m.imageUrl!)}
                        width={512}
                        height={512}
                        className="mt-3 rounded max-h-96 object-contain cursor-zoom-in hover:opacity-90 transition-opacity"
                        style={{
                          width: "auto",
                          height: "auto",
                          maxHeight: "24rem",
                        }}
                        unoptimized
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <form
          onSubmit={onSubmit}
          className="border-t border-[#323237] bg-[#0e0e10] p-4"
        >
          <div className="flex gap-3">
            <input
              id="file"
              hidden
              type="file"
              accept="image/*"
              disabled={!roomUrl}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) pick(f);
                e.target.value = "";
              }}
            />

            {rugPrev ? (
              <div className="relative">
                <img
                  src={rugPrev}
                  alt="Preview"
                  className="w-12 h-12 object-cover rounded border border-orange-500 cursor-pointer hover:opacity-80"
                  onClick={() => document.getElementById("file")?.click()}
                />
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-xs">
                  ✓
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={!roomUrl}
                onClick={() => document.getElementById("file")?.click()}
                className={`p-3 rounded border transition-colors ${
                  roomUrl
                    ? "bg-[#1a1a1d] border-[#323237] hover:border-orange-500 cursor-pointer"
                    : "bg-gray-800 border-gray-700 cursor-not-allowed opacity-50"
                }`}
                title={!roomUrl ? "Generera ett rum först" : "Ladda upp matta"}
              >
                📎
              </button>
            )}

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                !roomUrl
                  ? "Beskriv rummet du vill generera..."
                  : rugFile
                  ? "Beskriv hur mattan ska placeras (eller lämna tomt)..."
                  : "Ladda upp en matta först..."
              }
              rows={1}
              className="flex-1 resize-none bg-[#1a1a1d] border border-[#323237] rounded px-4 py-2 focus:border-orange-500 focus:outline-none"
            />

            <button
              disabled={loading || !prompt.trim()}
              className={`px-6 py-2 rounded transition-colors ${
                loading || !prompt.trim()
                  ? "bg-gray-600 cursor-not-allowed"
                  : "bg-orange-500 hover:bg-orange-600"
              }`}
            >
              {loading ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
              ) : (
                "Skicka"
              )}
            </button>
          </div>

          {/* Status info */}
          <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span className={roomUrl ? "text-green-400" : ""}>
              {roomUrl ? "✓ Rum genererat" : "○ Väntar på rum"}
            </span>
            <span className={rugFile ? "text-green-400" : ""}>
              {rugFile ? "✓ Matta laddad" : "○ Väntar på matta"}
            </span>
          </div>
        </form>

        {/* —— modal —— */}
        {modal && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="relative max-w-full max-h-full">
              <button
                onClick={() => setModal(null)}
                className="absolute -top-4 -right-4 w-8 h-8 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white font-bold z-10"
              >
                ×
              </button>
              <img
                src={modal}
                alt="Full size"
                className="max-h-[90vh] max-w-[90vw] object-contain rounded shadow-2xl"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
