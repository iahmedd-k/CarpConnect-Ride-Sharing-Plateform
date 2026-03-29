import { normalizePlanId, type PlanId } from "@/lib/plans";

const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  plus: 1,
  pro: 2,
};

export const currentPlanFromStorage = (): PlanId => {
  try {
    const raw = localStorage.getItem("carpconnect_user");
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizePlanId(parsed?.subscription?.plan);
  } catch {
    return "free";
  }
};

export const hasPlanAtLeast = (currentPlan: PlanId, requiredPlan: PlanId): boolean =>
  PLAN_RANK[currentPlan] >= PLAN_RANK[requiredPlan];

