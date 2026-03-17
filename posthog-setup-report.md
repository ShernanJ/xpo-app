<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of your project. PostHog is now initialized for the Next.js App Router app through `instrumentation-client.ts`, proxied through `/ingest`, and wired into both client and server flows. The integration adds client-side capture for onboarding, auth, billing, chat prompts, and feedback, server-side capture for auth, checkout, onboarding completion, and Stripe webhook processing, plus identify/reset handling so frontend and backend activity can be correlated with shared distinct-id and session headers.

| Event | Description | File(s) |
| --- | --- | --- |
| `xpo_guest_analysis_requested` | An unauthenticated visitor requested the onboarding analysis preview from the landing flow. | `apps/web/app/onboarding/OnboardingLanding.tsx` |
| `xpo_onboarding_run_requested` | An authenticated user started a full onboarding run from the landing or login setup flow. | `apps/web/app/onboarding/OnboardingLanding.tsx`, `apps/web/app/login/_components/LoginForm.tsx` |
| `xpo_login_submitted` | A user submitted the email/password login form. | `apps/web/app/login/_components/LoginForm.tsx` |
| `xpo_login_verification_submitted` | A user submitted the email verification code during login or signup. | `apps/web/app/login/_components/LoginForm.tsx` |
| `xpo_feedback_submitted` | A signed-in user submitted product feedback or reported an assistant message from chat. | `apps/web/app/chat/_features/feedback/useFeedbackState.ts` |
| `xpo_chat_prompt_submitted` | A signed-in user submitted a prompt to the core creator chat workflow. | `apps/web/app/chat/_features/reply/useAssistantReplyOrchestrator.ts` |
| `xpo_checkout_started` | A user started a billing checkout flow from pricing or chat upsell surfaces. | `apps/web/app/pricing/_components/PricingPageContent.tsx`, `apps/web/app/chat/_features/billing/useBillingState.ts` |
| `xpo_billing_portal_opened` | A user opened the Stripe billing portal from pricing or chat settings. | `apps/web/app/pricing/_components/PricingPageContent.tsx`, `apps/web/app/chat/_features/billing/useBillingState.ts` |
| `xpo_auth_login_succeeded` | The auth login endpoint successfully created an app session for a user. | `apps/web/app/api/auth/login/route.ts` |
| `xpo_auth_email_code_requested` | The auth email-code request endpoint successfully sent a verification code. | `apps/web/app/api/auth/email-code/request/route.ts` |
| `xpo_auth_email_code_verified` | The auth email-code verify endpoint successfully verified a code and created a session. | `apps/web/app/api/auth/email-code/verify/route.ts` |
| `xpo_auth_logout_completed` | The logout endpoint cleared the current app session. | `apps/web/app/api/auth/logout/route.ts` |
| `xpo_checkout_session_created` | The billing checkout endpoint successfully created a Stripe checkout session. | `apps/web/app/api/billing/checkout/route.ts` |
| `xpo_onboarding_run_completed` | The onboarding run endpoint finished and persisted a creator onboarding run. | `apps/web/app/api/onboarding/run/route.ts` |
| `xpo_stripe_webhook_processed` | The Stripe webhook endpoint processed a billing lifecycle event successfully. | `apps/web/app/api/stripe/webhook/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- Dashboard creation was not possible in this session because the PostHog MCP/dashboard tooling was unavailable.
- Once you connect the project to a PostHog workspace, create an "Analytics basics" dashboard using the event names above for onboarding conversion, auth completion, billing starts/completions, and chat engagement funnels.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
