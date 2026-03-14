export const MONETIZATION_ENV_NAME = "NEXT_PUBLIC_ENABLE_MONETIZATION";

export function isMonetizationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_MONETIZATION?.trim() === "1";
}
