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

    const { audioBase64, mimeType, participantNames = [] } = await req.json() as {
      audioBase64: string;
      mimeType: string;
      participantNames?: string[];
    };

    if (!audioBase64 || !mimeType) {
      return new Response(
        JSON.stringify({ error: "audioBase64 and mimeType are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Gemini rejects MIME types with codec suffixes (e.g. audio/webm;codecs=opus)
    const safeMimeType = mimeType.split(";")[0].trim() || "audio/webm";

    const namesList = participantNames.length > 0 ? participantNames.join(", ") : "(none provided)";

    const prompt = `You are an expense parser. The user is describing an expense out loud.
Listen carefully and extract:
1. title: A short description of what was purchased (e.g. "Dinner at Ramen Bar", "Taxi to airport"). Max 60 chars.
2. amount: The total amount as a number (just digits and decimal point, no currency symbol).
3. category: Pick exactly one from this list: ${CATEGORIES.join(", ")}
4. paidByName: The name of the person who paid, if mentioned. Must match one of these participants exactly: ${namesList}. Use null if not mentioned.
5. splitMode: How the expense is split. Use "all" if split among everyone (default when not specified). Use "only" if the user names specific people to split with. Use "except" if the user says to exclude someone (e.g. "except Mike", "not for Mike"). Use null only if unclear.
6. splitNames: Array of participant names relevant to the splitMode. For "only", the names to include. For "except", the names to exclude. For "all", use an empty array []. Each name must match one of these participants exactly: ${namesList}. Use null if no names are mentioned.

If you can't determine a field, use null for that field.

Respond with ONLY valid JSON in this exact format, no markdown, no explanation:
{"title":"...","amount":0.00,"category":"...","paidByName":null,"splitMode":"all","splitNames":[]}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
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

    // Strip markdown fences, then extract the outermost JSON object
    const fenceStripped = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonStart = fenceStripped.indexOf("{");
    const jsonEnd = fenceStripped.lastIndexOf("}");
    const cleaned = jsonStart !== -1 && jsonEnd !== -1
      ? fenceStripped.slice(jsonStart, jsonEnd + 1)
      : fenceStripped;

    let parsed: {
      title: string | null;
      amount: number | null;
      category: string | null;
      paidByName: string | null;
      splitMode: string | null;
      splitNames: string[] | null;
    };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: `Could not parse Gemini response: ${rawText.slice(0, 200)}` }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (parsed.category && !CATEGORIES.includes(parsed.category)) {
      parsed.category = "General";
    }

    const validModes = ["all", "only", "except"];
    const splitMode = parsed.splitMode && validModes.includes(parsed.splitMode) ? parsed.splitMode : null;
    const splitNames = Array.isArray(parsed.splitNames)
      ? parsed.splitNames.filter((n) => typeof n === "string")
      : null;

    return new Response(
      JSON.stringify({
        title: parsed.title ? String(parsed.title).slice(0, 60) : null,
        amount: parsed.amount != null ? Number(parsed.amount) || null : null,
        category: parsed.category ?? null,
        paidByName: parsed.paidByName ?? null,
        splitMode,
        splitNames,
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
