import { ArrowRight, MapPinOff } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950 px-4 py-12 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <section
        aria-labelledby="not-found-title"
        className="relative w-full max-w-xl rounded-3xl border border-white/15 bg-white/10 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-12"
      >
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-400/30 bg-indigo-500/15 text-indigo-300">
          <MapPinOff aria-hidden="true" className="h-7 w-7" />
        </div>

        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300">
          Erro 404
        </p>
        <h1 id="not-found-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
          404 — Página não encontrada
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-slate-300">
          O endereço pode estar incorreto ou a página pode ter sido movida.
        </p>

        <Link
          to="/dashboard"
          className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 font-semibold text-white shadow-lg shadow-indigo-950/30 transition-colors hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          Voltar ao dashboard
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </section>
    </main>
  );
}
