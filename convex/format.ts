import type { Dish } from "./types";
import { looksLikeCafeteriaNotice } from "./notices";

export const NO_MENU_INFO = "Нет информации";

type MenuLike = { dishes: Dish[] } | null;

function formatBlock(menu: MenuLike): string {
  if (!menu || menu.dishes.length === 0) {
    return NO_MENU_INFO;
  }
  const names = menu.dishes.map((d) => d.name);
  if (looksLikeCafeteriaNotice(names)) {
    return names.join("\n");
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
