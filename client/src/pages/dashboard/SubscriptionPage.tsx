import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, CreditCard, ShieldCheck, Headphones, Lock } from "lucide-react";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";
import api from "@/lib/api";
import { PLAN_META, normalizePlanId, type PlanId } from "@/lib/plans";
import { Button } from "@/components/ui/button";

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const devBypassEnabled = String(import.meta.env.VITE_DEV_PLAN_BYPASS || "false").toLowerCase() === "true";

const SubscriptionPage = () => {
  const [loading, setLoading] = useState(true);
  const [actionPlan, setActionPlan] = useState<PlanId | null>(null);
  const [user, setUser] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [currentPlan, setCurrentPlan] = useState<PlanId>("free");

  const fetchMe = async () => {
    const res = await api.get("/auth/me");
    const meUser = res.data?.data?.user || null;
    const meUsage = res.data?.data?.usage || null;
    setUser(meUser);
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
          toast.success("Subscription updated successfully.");
          params.delete("checkout");
          params.delete("session_id");
          window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
        } else if (checkout === "cancelled") {
          toast.info("Checkout was cancelled.");
          params.delete("checkout");
          window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
        }

        await fetchMe();
      } catch (error: any) {
        toast.error(error?.response?.data?.message || "Failed to load subscription.");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const usageItems = useMemo(() => ([
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
  ]), [usage, currentPlan]);

  const handleUpgrade = async (plan: PlanId) => {
    if (plan === "free") return;

    setActionPlan(plan);
    try {
      if (!stripePromise) {
        throw new Error("Stripe publishable key missing. Set VITE_STRIPE_PUBLISHABLE_KEY.");
      }

      const checkoutRes = await api.post("/auth/subscription/checkout", { plan });
      const sessionId = checkoutRes.data?.data?.sessionId;
      if (!sessionId) throw new Error("Missing Stripe session");

      const stripe = await stripePromise;
      if (!stripe) throw new Error("Stripe failed to initialize");

      const { error } = await stripe.redirectToCheckout({ sessionId });
      if (error) throw error;
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || "Checkout failed.");
      setActionPlan(null);
    }
  };

  const handleDevBypassUpgrade = async (plan: PlanId) => {
    if (plan === "free") return;
    setActionPlan(plan);
    try {
      await api.post("/auth/subscription/dev-upgrade", { plan });
      await fetchMe();
      toast.success(`Temporary bypass applied: ${plan.toUpperCase()}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Dev bypass upgrade failed.");
    } finally {
      setActionPlan(null);
    }
  };

  const handleDowngrade = async () => {
    setActionPlan("free");
    try {
      await api.post("/auth/subscription/cancel");
      await fetchMe();
      toast.success("Plan changed to Free.");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Unable to change plan.");
    } finally {
      setActionPlan(null);
    }
  };

  const hasPrioritySupport = currentPlan === "plus" || currentPlan === "pro";
  const handlePrioritySupport = () => {
    const subject = encodeURIComponent(`[Priority Support] ${String(currentPlan).toUpperCase()} account`);
    const body = encodeURIComponent(
      `User: ${user?.email || "unknown"}\nPlan: ${String(currentPlan).toUpperCase()}\nIssue:\n\n`
    );
    window.location.href = `mailto:support@carpconnect.com?subject=${subject}&body=${body}`;
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-card rounded-2xl border border-border/50 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-display font-bold text-foreground">Plans & Usage</h2>
            <p className="text-sm text-muted-foreground">View monthly usage, compare all plans, and upgrade or downgrade from one place.</p>
          </div>
          <div className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary">
            Current: {PLAN_META[currentPlan].name}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3 mt-5">
          {usageItems.map((item) => {
            const pct = Math.min(100, Math.round((item.used / Math.max(item.limit, 1)) * 100));
            return (
              <div key={item.id} className="rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                  <p className="text-xs font-semibold text-foreground">{item.used}/{item.limit}</p>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {(Object.keys(PLAN_META) as PlanId[]).map((id, idx) => {
          const plan = PLAN_META[id];
          const active = id === currentPlan;
          const busy = actionPlan === id;
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className={`rounded-2xl border p-5 ${active ? "border-primary/40 bg-primary/5" : "border-border/50 bg-card"}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-bold">{plan.name}</h3>
                {active && <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-1 rounded-full">Active</span>}
              </div>
              <p className="mt-2 text-3xl font-display font-black">
                {plan.monthlyPriceUsd === 0 ? "$0" : `$${plan.monthlyPriceUsd}`}
                <span className="text-sm font-medium text-muted-foreground">/month</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">PKR {plan.monthlyPricePkr.toLocaleString()} per month</p>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> {plan.limits.monthlyBookings} bookings / month</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> {plan.limits.monthlyRideRequests} requests / month</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> {plan.limits.monthlyRideOffers} offers / month</div>
              </div>

              <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
                {plan.highlights.map((line) => <li key={line}>- {line}</li>)}
              </ul>

              <div className="mt-5">
                {id === "free" ? (
                  <Button
                    className="w-full"
                    variant={currentPlan === "free" ? "outline" : "secondary"}
                    onClick={handleDowngrade}
                    disabled={currentPlan === "free" || actionPlan !== null}
                  >
                    {actionPlan === "free" ? <Loader2 className="w-4 h-4 animate-spin" /> : currentPlan === "free" ? "Current Plan" : "Downgrade to Free"}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button
                      className="w-full bg-gradient-primary text-white"
                      onClick={() => handleUpgrade(id)}
                      disabled={active || actionPlan !== null}
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : active ? "Current Plan" : `Upgrade to ${plan.name}`}
                    </Button>
                    {devBypassEnabled && !active && (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => handleDevBypassUpgrade(id)}
                        disabled={actionPlan !== null}
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Temporary Bypass (${plan.name})`}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-5 text-sm">
        <div className="flex items-center gap-2 font-semibold mb-2">
          <ShieldCheck className="w-4 h-4 text-primary" /> Limit behavior
        </div>
        <p className="text-muted-foreground">
          When your monthly limit is reached, the specific action is blocked server-side (new request, booking, or offer), while existing rides/history/chat stay available.
          Upgrade your plan to continue immediately.
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <CreditCard className="w-4 h-4" />
          {devBypassEnabled
            ? "Dev bypass is enabled: upgrades can be applied locally without Stripe payment."
            : "Stripe runs in test mode until you switch your keys to live mode."}
        </div>
      </div>

      <div className={`rounded-2xl border p-5 text-sm ${hasPrioritySupport ? "border-emerald-300/50 bg-emerald-50/30" : "border-amber-300/60 bg-amber-50/30"}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 font-semibold mb-1">
              <Headphones className="w-4 h-4 text-primary" /> Priority Support
            </div>
            <p className="text-muted-foreground">
              {hasPrioritySupport
                ? "You have priority support access. Your tickets are tagged and routed to faster-response queue."
                : "Priority support is available on Plus and Pro. Free plan uses standard support queue."}
            </p>
          </div>
          {hasPrioritySupport ? (
            <Button className="bg-primary text-white" onClick={handlePrioritySupport}>
              Contact Priority Support
            </Button>
          ) : (
            <Button variant="outline" disabled className="gap-2">
              <Lock className="w-4 h-4" /> Locked on Free
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPage;
