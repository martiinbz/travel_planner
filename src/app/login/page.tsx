"use client";

import { Lock, MapPinned } from "lucide-react";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions";

function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={formAction} className="mt-8 grid gap-4">
      <label className="grid gap-2 text-sm font-semibold text-slate-700">
        Contraseña privada
        <input
          className="h-12 rounded-md border border-slate-200 bg-white px-4 text-base text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Solo para nosotros dos"
          required
        />
      </label>
      {state.error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {state.error}
        </p>
      ) : null}
      <button
        className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-emerald-700 px-5 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-70"
        disabled={pending}
        type="submit"
      >
        <Lock size={18} />
        {pending ? "Entrando..." : "Entrar al viaje"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#f3efe7] text-slate-950">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1.05fr_0.95fr]">
        <section>
          <div className="inline-flex items-center gap-2 rounded-md bg-white/70 px-3 py-2 text-sm font-semibold text-emerald-800 shadow-sm">
            <MapPinned size={17} />
            Travel Planner privado
          </div>
          <h1 className="mt-8 max-w-2xl text-5xl font-black leading-tight text-slate-950">
            Vuestro viaje, ordenado sin hacerlo aburrido.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-700">
            Entra para ver el mapa, rutas diarias, reservas, presupuesto,
            checklist y notas compartidas.
          </p>
        </section>
        <section className="rounded-lg border border-white/70 bg-white/85 p-6 shadow-2xl shadow-emerald-950/10 backdrop-blur">
          <div className="rounded-md bg-slate-950 p-4 text-white">
            <p className="text-sm font-semibold text-emerald-200">
              Acceso protegido
            </p>
            <p className="mt-2 text-2xl font-black">Solo vosotros dos.</p>
          </div>
          <LoginForm />
          <p className="mt-5 text-xs leading-5 text-slate-500">
            En local, si no configuras variables de entorno, la contraseña por
            defecto es <strong>viaje2026</strong>. En Vercel conviene cambiarla.
          </p>
        </section>
      </div>
    </main>
  );
}
