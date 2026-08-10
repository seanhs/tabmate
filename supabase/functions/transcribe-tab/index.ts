import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_MODEL = "gemini-3.6-flash";

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

    const { audioBase64, mimeType } = await req.json() as {
      audioBase64: string;
      mimeType: string;
    };

    if (!audioBase64 || !mimeType) {
      return new Response(
        JSON.stringify({ error: "audioBase64 and mimeType are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const safeMimeType = mimeType.split(";")[0].trim() || "audio/webm";

    const prompt = `You are a tab creation parser. The user is describing a new group expense tab out loud.
Listen carefully and extract:
1. tripName: A short name for the tab/trip/event (e.g. "Vegas 2026", "Cabin Weekend", "Roommates"). Max 60 chars. Use null if not mentioned.
2. names: An array of participant names (first names or nicknames as spoken). Each name should be a clean string, max 40 chars. Use an empty array [] if no names are mentioned.

If you can't determine a field, use null for tripName or an empty array for names.

Respond with ONLY valid JSON in this exact format, no markdown, no explanation:
{"tripName":null,"names":[]}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: safeMimeType, data: audioBase64 } },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const errJson = await geminiRes.json().catch(() => null);
      const detail = errJson?.error?.message ?? JSON.stringify(errJson);
      return new Response(
        JSON.stringify({ error: detail ?? `Gemini API error (${geminiRes.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const fenceStripped = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonStart = fenceStripped.indexOf("{");
    const jsonEnd = fenceStripped.lastIndexOf("}");
    const cleaned = jsonStart !== -1 && jsonEnd !== -1
      ? fenceStripped.slice(jsonStart, jsonEnd + 1)
      : fenceStripped;

    let parsed: {
      tripName: string | null;
      names: string[];
    };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: `Could not parse Gemini response: ${rawText.slice(0, 200)}` }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const names = Array.isArray(parsed.names)
      ? parsed.names
          .filter((n) => typeof n === "string" && n.trim().length > 0)
          .map((n) => String(n).trim().slice(0, 40))
      : [];

    return new Response(
      JSON.stringify({
        tripName: parsed.tripName ? String(parsed.tripName).slice(0, 60) : null,
        names,
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
