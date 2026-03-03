import OnboardingLanding from "./onboarding/OnboardingLanding";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    redirect("/chat");
  }

  return <OnboardingLanding />;
}
