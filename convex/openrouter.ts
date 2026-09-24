import { enrichedDishesSchema, type Dish } from "./types";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

export const SYSTEM_PROMPT =
  "You are a helper for a Korean university student cafeteria. " +
  "The student already sees the Hangul name. Translate THE NAME; do not advertise the dish. " +
  "For each dish return spiciness 0–5 and gloss.ru plus gloss.en. " +
  "Each gloss value: a short name translation only (2–5 words). " +
  'Russian examples: "тушёная курица", "рыбная котлета", "кимчи". ' +
  'English examples: "braised chicken", "fish cutlet", "kimchi". ' +
  "Do not transliterate Hangul and do not put pronunciation before the translation " +
  "(not «тонъюк кимчи поккым, жаркое…», not «chimdak, braised chicken»). " +
  "Не транслитерируй хангыль. " +
  "If a loanword is already the usual word (кимчи/kimchi, йогурт/yogurt, рис/rice) — that one word. " +
  "Не перечисляй скрытые ингредиенты. Do not write a review and do not use " +
  "«обязательно», «идеальное», «прекрасный выбор», «нежная», «аппетитный». " +
  "Reply ONLY with a valid JSON object of the form " +
  '{"dishes":[{"name":"...","spiciness":0,"gloss":{"ru":"...","en":"..."}}]}. ' +
  "The name field must match the original dish name. Keep dish order.";

function fallback(names: string[]): Dish[] {
  return names.map((n) => ({ name: n, spiciness: 0, gloss: {} }));
}

function glossFromEnriched(enriched: {
  gloss?: Record<string, string>;
  description?: string;
}): Record<string, string> {
  const gloss: Record<string, string> = { ...(enriched.gloss ?? {}) };
  if (
    (!gloss.ru || !gloss.ru.trim()) &&
    typeof enriched.description === "string" &&
    enriched.description.trim()
  ) {
    gloss.ru = enriched.description.trim();
  }
  return gloss;
}

export async function enrichDishes(names: string[]): Promise<Dish[]> {
  if (names.length === 0) return [];

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("OPENROUTER_API_KEY not set; returning bare dishes");
    return fallback(names);
  }
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const userPrompt =
    "Translate each name into Russian and English. Meaning of the name only, no transliteration:\n" +
    names.map((n, i) => `${i + 1}. ${n}`).join("\n");

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/artyom-kalman/daily-menu",
        "X-Title": "daily-menu",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`OpenRouter HTTP ${res.status}: ${body.slice(0, 500)}`);
      return fallback(names);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      console.warn("OpenRouter response missing content");
      return fallback(names);
    }

    const parsed = enrichedDishesSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      console.warn(
        `OpenRouter response failed validation: ${parsed.error.message}`,
      );
      return fallback(names);
    }

    // Re-align by index, falling back to bare data if the model dropped items.
    const out: Dish[] = [];
    for (let i = 0; i < names.length; i++) {
      const enriched = parsed.data.dishes[i];
      if (enriched) {
        out.push({
          name: names[i], // trust scraper for the canonical name
          spiciness: enriched.spiciness,
          gloss: glossFromEnriched(enriched),
        });
      } else {
        out.push({ name: names[i], spiciness: 0, gloss: {} });
      }
    }
    return out;
  } catch (err) {
    console.warn(`OpenRouter call failed: ${(err as Error).message}`);
    return fallback(names);
  }
}

/** Test helper: expose gloss merge without a live OpenRouter call. */
export function mergeEnrichedGloss(
  enriched: { gloss?: Record<string, string>; description?: string },
): Record<string, string> {
  return glossFromEnriched(enriched);
}
