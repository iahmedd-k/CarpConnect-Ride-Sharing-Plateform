import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Crown, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";
import api from "@/lib/api";
import { PLAN_META, normalizePlanId, type PlanId } from "@/lib/plans";
import { Button } from "@/components/ui/button";

const devBypassEnabled = String(import.meta.env.VITE_DEV_PLAN_BYPASS || "false").toLowerCase() === "true";

const SubscriptionPage = () => {
  const [loading, setLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<PlanId>("free");
  const [billingConfig, setBillingConfig] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [stripePlan, setStripePlan] = useState<PlanId | null>(null);
  const [bypassBusy, setBypassBusy] = useState(false);
  const [downgradeBusy, setDowngradeBusy] = useState(false);
  const location = useLocation();
  const dashboardPath = location.pathname === "/driver-dashboard" ? "/driver-dashboard" : "/dashboard";

  const fetchMe = async () => {
    const res = await api.get("/auth/me");
    const meUser = res.data?.data?.user || null;
    const meUsage = res.data?.data?.usage || null;
    const meBillingConfig = res.data?.data?.billingConfig || null;
    setBillingConfig(meBillingConfig);
    setUsage(meUsage);
    setCurrentPlan(normalizePlanId(meUser?.subscription?.plan));
    if (meUser) {
      localStorage.setItem("carpconnect_user", JSON.stringify(meUser));
    }
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams(window.location.search);
        const checkout = params.get("checkout");
        const sessionId = params.get("session_id");

        if (checkout === "success" && sessionId) {
          await api.post("/auth/subscription/sync", { sessionId });
          toast.success("Stripe payment completed successfully.");
          params.delete("checkout");
          params.delete("session_id");
          const nextQuery = params.toString();
          window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
        } else if (checkout === "cancelled") {
          toast.info("Stripe checkout was cancelled.");
          params.delete("checkout");
          const nextQuery = params.toString();
          window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
        }

        await fetchMe();
      } catch (error: any) {
        toast.error(error?.response?.data?.message || "Failed to load billing.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const stripeCheckoutEnabled = Boolean(billingConfig?.stripeAvailable ?? true);
  const bypassUpgradeEnabled = Boolean(billingConfig?.devBypassEnabled) || devBypassEnabled;

  const usageItems = useMemo(
    () => [
      {
        id: "bookings",
        label: "Bookings",
        used: Number(usage?.bookingsUsed || 0),
        limit: Number(usage?.bookingsLimit || PLAN_META[currentPlan].limits.monthlyBookings),
      },
      {
        id: "requests",
        label: "Ride Requests",
        used: Number(usage?.rideRequestsUsed || 0),
        limit: Number(usage?.rideRequestsLimit || PLAN_META[currentPlan].limits.monthlyRideRequests),
      },
      {
        id: "offers",
        label: "Ride Offers",
        used: Number(usage?.rideOffersUsed || 0),
        limit: Number(usage?.rideOffersLimit || PLAN_META[currentPlan].limits.monthlyRideOffers),
      },
    ],
    [usage, currentPlan]
  );

  const handleStripeCheckout = async (plan: PlanId) => {
    if (plan === "free") return;
    setStripePlan(plan);
    try {
      const checkoutRes = await api.post("/auth/subscription/checkout", {
        plan,
        dashboardPath,
      });
      const checkoutUrl = checkoutRes.data?.data?.url;
      if (!checkoutUrl) throw new Error("Missing Stripe checkout URL");
      window.location.href = checkoutUrl;
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || "Stripe checkout failed.");
      setStripePlan(null);
    }
  };

  const handleBypassToPro = async () => {
    setBypassBusy(true);
    try {
      await api.post("/auth/subscription/dev-upgrade", { plan: "pro" });
      await fetchMe();
      toast.success("Test bypass applied. Pro is active now.");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Test bypass failed.");
    } finally {
      setBypassBusy(false);
    }
  };

  const handleDowngrade = async () => {
    setDowngradeBusy(true);
    try {
      await api.post("/auth/subscription/cancel");
      await fetchMe();
      toast.success("Plan changed to Free.");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Unable to change plan.");
    } finally {
      setDowngradeBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Billing</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Current plan: <span className="font-semibold text-foreground">{PLAN_META[currentPlan].name}</span>
            </p>
          </div>
          <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
            {PLAN_META[currentPlan].name}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {usageItems.map((item) => {
            const pct = Math.min(100, Math.round((item.used / Math.max(item.limit, 1)) * 100));
            return (
              <div key={item.id} className="rounded-xl border border-border/50 bg-muted/10 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                  <p className="text-xs font-semibold text-foreground">{item.used}/{item.limit}</p>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(PLAN_META) as PlanId[]).map((id) => {
          const plan = PLAN_META[id];
          const active = currentPlan === id;
          const stripeBusy = stripePlan === id;

          return (
            <div
              key={id}
              className={`rounded-2xl border p-5 ${active ? "border-primary/40 bg-primary/5" : "border-border/50 bg-card"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {plan.monthlyPriceUsd === 0 ? "Free forever" : `$${plan.monthlyPriceUsd}/month`}
                  </p>
                </div>
                {id === "pro" && (
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Crown className="h-4 w-4" />
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {plan.limits.monthlyBookings} bookings / month
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {plan.limits.monthlyRideRequests} ride requests / month
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {plan.limits.monthlyRideOffers} ride offers / month
                </div>
              </div>

              <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                {plan.highlights.slice(0, 3).map((line) => (
                  <div key={line}>- {line}</div>
                ))}
              </div>

              <div className="mt-5 space-y-2">
                {id === "free" ? (
                  <Button
                    className="w-full"
                    variant={active ? "outline" : "secondary"}
                    disabled={active || stripePlan !== null || bypassBusy || downgradeBusy}
                    onClick={handleDowngrade}
                  >
                    {downgradeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? "Current Plan" : "Back to Free"}
                  </Button>
                ) : (
                  <>
                    {stripeCheckoutEnabled && (
                      <Button
                        className="w-full bg-gradient-primary text-white"
                        disabled={active || stripePlan !== null || bypassBusy || downgradeBusy}
                        onClick={() => handleStripeCheckout(id)}
                      >
                        {stripeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Upgrade to ${plan.name} with Stripe`}
                      </Button>
                    )}
                    {id === "pro" && bypassUpgradeEnabled && (
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={active || stripePlan !== null || bypassBusy || downgradeBusy}
                        onClick={handleBypassToPro}
                      >
                        {bypassBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test Bypass"}
                      </Button>
                    )}
                    {active && (
                      <div className="rounded-xl border border-emerald-300/50 bg-emerald-50/40 px-3 py-2 text-sm text-emerald-700">
                        Active on this account
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Zap className="h-4 w-4 text-primary" />
          Billing actions
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Stripe checkout is real and live. The bypass button is only for testing and upgrades the current user straight to Pro from the backend.
        </p>
      </div>
    </div>
  );
};

export default SubscriptionPage;
