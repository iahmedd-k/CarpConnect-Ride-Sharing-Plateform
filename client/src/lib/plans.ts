export type PlanId = "free" | "plus" | "pro";

export const PLAN_META: Record<PlanId, {
  id: PlanId;
  name: string;
  monthlyPriceUsd: number;
  monthlyPricePkr: number;
  limits: {
    monthlyRideRequests: number;
    monthlyBookings: number;
    monthlyRideOffers: number;
  };
  highlights: string[];
}> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    monthlyPricePkr: 0,
    limits: {
      monthlyRideRequests: 25,
      monthlyBookings: 8,
      monthlyRideOffers: 8,
    },
    highlights: [
      "Basic route matching",
      "In-app chat",
      "Standard support",
      "Basic CO2 tracking",
    ],
  },
  plus: {
    id: "plus",
    name: "Plus",
    monthlyPriceUsd: 7,
    monthlyPricePkr: 1999,
    limits: {
      monthlyRideRequests: 140,
      monthlyBookings: 90,
      monthlyRideOffers: 40,
    },
    highlights: [
      "Recurring route setup",
      "Booking history and tracking",
      "Detailed emissions and spending view",
      "Priority support",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPriceUsd: 15,
    monthlyPricePkr: 4299,
    limits: {
      monthlyRideRequests: 350,
      monthlyBookings: 250,
      monthlyRideOffers: 180,
    },
    highlights: [
      "Highest monthly usage caps",
      "Includes all Plus features",
      "Priority support",
    ],
  },
};

export const normalizePlanId = (value: any): PlanId => {
  const raw = String(value || "free").toLowerCase();
  if (raw === "basic") return "plus";
  if (raw === "plus" || raw === "pro") return raw;
  return "free";
};
