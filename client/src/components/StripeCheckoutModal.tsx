import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import api from "@/lib/api";

// Always initialize Stripe outside of a component's render to avoid recreating the Stripe object on every render.
const stripePromise = loadStripe("pk_test_TYooMQauvdEDq54NiTphI7jx");

const CheckoutForm = ({ clientSecret, paymentId, onPaymentSuccess, onCancel }: any) => {
    const stripe = useStripe();
    const elements = useElements();
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setProcessing(true);
        setError(null);

        const cardElement = elements.getElement(CardElement);

        if (!cardElement) {
            setProcessing(false);
            return;
        }

        const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
                card: cardElement,
            },
        });

        if (stripeError) {
            setError(stripeError.message || "Payment failed");
            setProcessing(false);
        } else if (paymentIntent && paymentIntent.status === "succeeded") {
            try {
                if (paymentId) {
                    await api.post("/payments/confirm", { paymentId });
                }
                onPaymentSuccess();
            } catch (confirmError: any) {
                setError(confirmError?.response?.data?.message || "Payment captured, but booking confirmation failed");
            } finally {
                setProcessing(false);
            }
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="p-4 border border-border rounded-xl bg-muted/20">
                <CardElement 
                    options={{
                        style: {
                            base: {
                                fontSize: '16px',
                                color: '#ffffff',
                                '::placeholder': {
                                    color: '#aab7c4',
                                },
                            },
                        },
                    }}
                />
            </div>
            {error && <div className="text-red-500 text-sm font-medium">{error}</div>}
            <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={onCancel} className="flex-1 rounded-xl h-12" disabled={processing}>
                    Cancel
                </Button>
                <Button type="submit" className="flex-1 bg-gradient-primary shadow-glow h-12 rounded-xl text-white font-bold" disabled={!stripe || processing}>
                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Pay Now"}
                </Button>
            </div>
        </form>
    );
};

export const StripeCheckoutModal = ({ clientSecret, paymentId, onClose, onPaymentSuccess, amount }: any) => {
    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-md border border-border/50 rounded-3xl p-6 shadow-xl relative">
                <button onClick={onClose} className="absolute right-4 top-4 p-2 rounded-full hover:bg-muted/50 transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                </button>
                <h3 className="text-xl font-display font-bold mb-2">Complete Payment</h3>
                <p className="text-sm text-muted-foreground mb-6">You will be charged PKR {amount}</p>
                
                <Elements stripe={stripePromise}>
                    <CheckoutForm
                        clientSecret={clientSecret}
                        paymentId={paymentId}
                        onPaymentSuccess={onPaymentSuccess}
                        onCancel={onClose}
                    />
                </Elements>
            </div>
        </div>
    );
};
