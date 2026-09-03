import { enrichedDishesSchema, type Dish } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

const SYSTEM_PROMPT =
  "Ты помощник студенческой столовой при корейском университете. " +
  "Тебе дают список блюд из меню. Для каждого блюда верни короткое " +
  "аппетитное описание (максимум 2 предложения, на русском языке) и " +
  "оценку остроты от 0 до 5 (0 — совсем не острое, 5 — очень острое). " +
  "Отвечай ТОЛЬКО валидным JSON-объектом вида " +
  '{"dishes":[{"name":"...","description":"...","spiciness":0}]}. ' +
  "Поле name должно совпадать с исходным названием блюда. " +
  "Сохрани порядок блюд.";

function fallback(names: string[]): Dish[] {
  return names.map((n) => ({ name: n, description: "", spiciness: 0 }));
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
    "Опиши следующие блюда:\n" +
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
          description: enriched.description,
          spiciness: enriched.spiciness,
        });
      } else {
        out.push({ name: names[i], description: "", spiciness: 0 });
      }
    }
    return out;
  } catch (err) {
    console.warn(`OpenRouter call failed: ${(err as Error).message}`);
    return fallback(names);
  }
}
