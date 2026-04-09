export function isCartItemAvailable(item) {
  return Number(item?.is_available ?? 1) !== 0;
}

export function summarizeCartAvailability(items) {
  const availableItems = items.filter((item) => isCartItemAvailable(item));
  const unavailableItems = items.filter((item) => !isCartItemAvailable(item));
  const availableTotal = availableItems.reduce(
    (sum, item) => sum + Number(item?.price_in_points ?? item?.cost ?? 0),
    0
  );

  return {
    availableItems,
    unavailableItems,
    availableTotal,
  };
}
