/**
 * Sınıf Rota — Dynamic Time-Based Greeting Helper
 *
 * Rules:
 * - 05:00–11:59 -> "Günaydın, Öğretmenim"
 * - 12:00–17:59 -> "İyi günler, Öğretmenim"
 * - 18:00–04:59 -> "İyi akşamlar, Öğretmenim"
 */

import { useSyncExternalStore } from "react";

export const DEFAULT_GREETING = "Günaydın, Öğretmenim";

export function getGreeting(input: Date | number = new Date()): string {
  const hour = typeof input === "number" ? input : input.getHours();
  if (hour >= 5 && hour < 12) {
    return "Günaydın, Öğretmenim";
  }
  if (hour >= 12 && hour < 18) {
    return "İyi günler, Öğretmenim";
  }
  return "İyi akşamlar, Öğretmenim";
}

const noopSubscribe = () => () => {};

export function useGreeting(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => getGreeting(),
    () => DEFAULT_GREETING,
  );
}
