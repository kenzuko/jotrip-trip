export const VEHICLE_RULES = {
  sevenSeat: {
    code: "7_SEAT",
    vndPerKm: 15_000,
  },
} as const;

export function estimateSevenSeatPrice(distanceKm: number) {
  const safeDistance = Math.max(0, distanceKm);
  return Math.round(safeDistance * VEHICLE_RULES.sevenSeat.vndPerKm);
}
