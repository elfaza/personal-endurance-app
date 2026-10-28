import type { FoodItem } from "./wellness";

// Rounded reference estimates per 100 g. Cooking methods and brands vary.
// Source: USDA FoodData Central SR Legacy food descriptions (see docs).
export const foodReferences = [
  {
    id: "rice",
    name: "White rice, cooked",
    kcal: 130,
    protein: 2.7,
    carbs: 28.2,
    fat: 0.3,
  },
  {
    id: "chicken",
    name: "Chicken breast, roasted, skinless",
    kcal: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
  },
  {
    id: "egg",
    name: "Egg, hard-boiled",
    kcal: 155,
    protein: 12.6,
    carbs: 1.1,
    fat: 10.6,
  },
  {
    id: "banana",
    name: "Banana, raw",
    kcal: 89,
    protein: 1.1,
    carbs: 22.8,
    fat: 0.3,
  },
  {
    id: "oil",
    name: "Vegetable oil",
    kcal: 884,
    protein: 0,
    carbs: 0,
    fat: 100,
  },
  {
    id: "sugar",
    name: "Sugar, granulated",
    kcal: 387,
    protein: 0,
    carbs: 100,
    fat: 0,
  },
] as const;
export function referenceItem(id: string, grams: number): FoodItem | null {
  const ref = foodReferences.find((r) => r.id === id);
  if (!ref) return null;
  const factor = grams / 100;
  return {
    name: ref.name,
    grams,
    kcalLow: Math.round(ref.kcal * factor * 0.8),
    kcalHigh: Math.round(ref.kcal * factor * 1.2),
    protein: Math.round(ref.protein * factor * 10) / 10,
    carbs: Math.round(ref.carbs * factor * 10) / 10,
    fat: Math.round(ref.fat * factor * 10) / 10,
    basis: "reference",
  };
}
