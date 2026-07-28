import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CATEGORIES = ["General", "Food", "Drink", "Accommodation", "Transport", "Activities", "Shopping", "Other"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { imageBase64, mimeType } = await req.json() as {
      imageBase64: string;
      mimeType: string;
    };

    if (!imageBase64 || !mimeType) {
      return new Response(
        JSON.stringify({ error: "imageBase64 and mimeType are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const prompt = `You are a receipt parser. Look at this receipt image and extract:
1. title: A short description of what was purchased (e.g. "Dinner at Ramen Bar", "Groceries", "Taxi to airport"). Max 60 chars.
2. amount: The total amount as a number (just digits and decimal point, no currency symbol). Use the grand total / final total.
3. category: Pick exactly one from this list: ${CATEGORIES.join(", ")}

Respond with ONLY valid JSON in this exact format, no markdown, no explanation:
{"title":"...","amount":0.00,"category":"..."}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 256,
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${geminiRes.status}`, detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed: { title: string; amount: number; category: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "Could not parse Gemini response", raw: rawText }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate category
    if (!CATEGORIES.includes(parsed.category)) {
      parsed.category = "General";
    }

    return new Response(
      JSON.stringify({
        title: String(parsed.title ?? "").slice(0, 60),
        amount: Number(parsed.amount) || 0,
        category: parsed.category,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
