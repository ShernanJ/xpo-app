import { LoginForm } from "../login/login-form";

export default function SigninPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
      <div className="flex flex-col items-center w-full">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Stanley for X</h1>
        <p className="text-zinc-500 text-sm">Growth intelligence engine</p>

        <LoginForm />
      </div>
    </div>
  );
}
