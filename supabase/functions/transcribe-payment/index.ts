import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const safeMimeType = mimeType.split(";")[0].trim() || "audio/webm";
    const namesList = participantNames.length > 0 ? participantNames.join(", ") : "(none provided)";

    const prompt = `You are a payment parser. The user is describing a payment that was made outside the app (e.g. cash, Venmo, e-Transfer, deposit).
Listen carefully and extract:
1. fromName: The name of the person who paid. Must match one of these participants exactly: ${namesList}. Use null if not mentioned. If the user says "everyone paid" or "we all paid", use the special value "EVERYONE".
2. toName: The name of the person who received the payment. Must match one of these participants exactly: ${namesList}. Use null if not mentioned.
3. amount: The amount as a number (just digits and decimal point, no currency symbol).
4. note: A short description of what the payment was for (e.g. "deposit", "rent", "cash for dinner"). Max 100 chars. Use null if not mentioned.

If you can't determine a field, use null for that field.

Respond with ONLY valid JSON in this exact format, no markdown, no explanation:
{"fromName":null,"toName":null,"amount":0.00,"note":null}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
      fromName: string | null;
      toName: string | null;
      amount: number | null;
      note: string | null;
    };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: `Could not parse Gemini response: ${rawText.slice(0, 200)}` }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        fromName: parsed.fromName ? String(parsed.fromName).slice(0, 100) : null,
        toName: parsed.toName ? String(parsed.toName).slice(0, 100) : null,
        amount: parsed.amount != null ? Number(parsed.amount) || null : null,
        note: parsed.note ? String(parsed.note).slice(0, 100) : null,
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
