import { isCartItemAvailable, summarizeCartAvailability } from "./cartAvailability";

describe("cartAvailability helpers", () => {
  test("identifies unavailable cart items from the backend status flag", () => {
    expect(isCartItemAvailable({ is_available: 1 })).toBe(true);
    expect(isCartItemAvailable({ is_available: 0 })).toBe(false);
    expect(isCartItemAvailable({})).toBe(true);
  });

  test("excludes unavailable items from the available cart total", () => {
    const result = summarizeCartAvailability([
      { id: 1, price_in_points: 300, is_available: 1 },
      { id: 2, price_in_points: 125, is_available: 0 },
      { id: 3, price_in_points: 75, is_available: 1 },
    ]);

    expect(result.availableItems).toHaveLength(2);
    expect(result.unavailableItems).toHaveLength(1);
    expect(result.availableTotal).toBe(375);
  });
});
