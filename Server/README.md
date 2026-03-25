## Stripe Setup

1. Install Stripe SDK:
   npm install stripe

2. Add your Stripe secret key to your environment variables:
   STRIPE_SECRET_KEY=sk_test_your_secret_key

3. Payment endpoints are available in PaymentRoutes.js:
   - POST /api/payments/split (create payment intent)
   - POST /api/payments/confirm (confirm payment)
   - POST /api/webhooks/stripe (Stripe webhook)
   - POST /api/payments/account (create connected account)
   - POST /api/payments/payout (driver payout)

4. See PaymentController.js for implementation details.
