import type { Dish } from "./types";

type MenuLike = { dishes: Dish[] } | null;

function formatBlock(menu: MenuLike): string {
  if (!menu || menu.dishes.length === 0) {
    return "Сегодня выходной";
  }
  return menu.dishes
    .map((d, i) => {
      const desc = d.description.trim();
      return desc ? `${i + 1}) ${d.name} - ${desc}` : `${i + 1}) ${d.name}`;
    })
    .join("\n");
}

export function formatMenuMessage(peony: MenuLike, azilea: MenuLike): string {
  return (
    "🍽️ Меню на сегодня.\n\n" +
    "🌸 Peony (верхняя столовая):\n" +
    formatBlock(peony) +
    "\n\n" +
    "🌺 Azilea (нижняя столовая):\n" +
    formatBlock(azilea)
  );
}
