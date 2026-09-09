import { describe, expect, it } from "vitest";
import { formatMenuMessage } from "../convex/format";
import {
  formatPorkMark,
  PORK_LEGEND,
  PORK_MARK_CERTAIN,
  PORK_MARK_MAYBE,
  PORK_SWAP_HINT,
  porkSignal,
} from "../convex/pork";

describe("porkSignal", () => {
  it("marks explicit Hangul pork as certain", () => {
    expect(porkSignal("제육볶음")).toBe("certain");
    expect(porkSignal("돼지불백")).toBe("certain");
    expect(porkSignal("등심돈까스")).toBe("certain");
    expect(porkSignal("돈육간장불고기")).toBe("certain");
    expect(porkSignal("주꾸미돈육볶음")).toBe("certain");
    expect(porkSignal("살코기감자탕")).toBe("certain");
    expect(porkSignal("부대찌개")).toBe("certain");
    expect(porkSignal("순대국")).toBe("certain");
    expect(porkSignal("베이컨크림파스타")).toBe("certain");
  });

  it("does not treat 순두부 as 순대", () => {
    expect(porkSignal("순두부찌개")).toBe("maybe");
  });

  it("treats hamburger as maybe and other 햄 as certain", () => {
    expect(porkSignal("햄버거스테이크")).toBe("maybe");
    expect(porkSignal("햄구이")).toBe("certain");
  });

  it("leaves named other protein unmarked", () => {
    expect(porkSignal("치즈불닭")).toBeNull();
    expect(porkSignal("치킨너겟*머스타드")).toBeNull();
    expect(porkSignal("눈꽃치즈닭갈비덮밥")).toBeNull();
    expect(porkSignal("소고기우거지해장국")).toBeNull();
    expect(porkSignal("참치김치국")).toBeNull();
    expect(porkSignal("생선까스")).toBeNull();
    expect(porkSignal("날치알밥")).toBeNull();
    expect(porkSignal("새우튀김")).toBeNull();
    expect(porkSignal("어묵채볶음")).toBeNull();
    expect(porkSignal("타코야끼")).toBeNull();
  });

  it("does not flag staples or kimchi", () => {
    expect(porkSignal("쌀밥")).toBeNull();
    expect(porkSignal("추가밥")).toBeNull();
    expect(porkSignal("포기김치")).toBeNull();
    expect(porkSignal("깍두기")).toBeNull();
    expect(porkSignal("요구르트")).toBeNull();
    expect(porkSignal("단무지")).toBeNull();
    expect(porkSignal("숙주나물")).toBeNull();
  });

  it("marks small maybe families", () => {
    expect(porkSignal("김치찌개")).toBe("maybe");
    expect(porkSignal("된장찌개")).toBe("maybe");
    expect(porkSignal("갈비만두찜")).toBe("maybe");
    expect(porkSignal("갈비만두(달콤+매콤)")).toBe("maybe");
    expect(porkSignal("마제덮밥")).toBe("maybe");
    expect(porkSignal("피자고로케&케찹")).toBe("maybe");
    expect(porkSignal("오므라이스")).toBe("maybe");
    expect(porkSignal("불고기")).toBe("maybe");
    expect(porkSignal("소불고기")).toBeNull();
  });

  it("does not treat unnamed soups as pork", () => {
    expect(porkSignal("미역국")).toBeNull();
    expect(porkSignal("미소장국")).toBeNull();
    expect(porkSignal("우동국물")).toBeNull();
    expect(porkSignal("잔치국수")).toBeNull();
  });
});

describe("formatPorkMark", () => {
  it("uses compact certain vs maybe marks", () => {
    expect(formatPorkMark("제육볶음")).toBe(PORK_MARK_CERTAIN);
    expect(formatPorkMark("된장찌개")).toBe(PORK_MARK_MAYBE);
    expect(formatPorkMark("쌀밥")).toBe("");
  });
});

describe("formatMenuMessage pork marks", () => {
  const peony = {
    dishes: [
      { name: "제육볶음", description: "свинина", spiciness: 1 },
      { name: "쌀밥", description: "рис", spiciness: 0 },
      { name: "된장찌개", description: "соевый суп", spiciness: 0 },
      { name: "포기김치", description: "кимчи", spiciness: 3 },
    ],
  };
  const azilea = {
    dishes: [
      { name: "등심돈까스", description: "шницель", spiciness: 0 },
      { name: "피자고로케&케찹", description: "крокет", spiciness: 0 },
      { name: "눈꽃치즈닭갈비덮밥", description: "курица", spiciness: 2 },
    ],
  };

  it("leaves the default menu unmarked", () => {
    const menu = formatMenuMessage(peony, azilea);
    expect(menu).toContain("<b>제육볶음</b> — <i>свинина</i> 🌶1");
    expect(menu).toContain("<b>된장찌개</b>");
    expect(menu).not.toContain("🐖");
    expect(menu).not.toContain("возможно");
    expect(menu).not.toContain(PORK_LEGEND);
  });

  it("marks certain and maybe on the same lines when opted in", () => {
    const menu = formatMenuMessage(peony, azilea, { markPork: true });
    expect(menu).toContain("<b>제육볶음</b> — <i>свинина</i> 🌶1 🐖");
    expect(menu).toContain("<b>된장찌개</b> — <i>соевый суп</i> возможно");
    expect(menu).toContain("<b>등심돈까스</b> — <i>шницель</i> 🐖");
    expect(menu).toContain("<b>피자고로케&amp;케찹</b> — <i>крокет</i> возможно");
    expect(menu).toContain("<b>눈꽃치즈닭갈비덮밥</b> — <i>курица</i> 🌶2");
    expect(menu).not.toContain("<b>눈꽃치즈닭갈비덮밥</b> — <i>курица</i> 🌶2 🐖");
    expect(menu).toContain(PORK_LEGEND);
    expect(menu).toContain(PORK_SWAP_HINT);
    expect(menu).toContain("쌀밥");
    expect(menu).toContain("포기김치");
  });
});
