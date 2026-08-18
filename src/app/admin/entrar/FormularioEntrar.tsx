'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function FormularioEntrar() {
  const router = useRouter();
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contrasena }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, mensaje: 'No hay conexión.' }));

    setEnviando(false);
    if (!res.ok) return setError(res.mensaje ?? 'No pudimos entrar.');

    router.replace('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="tarjeta mt-8 space-y-4 p-6">
      <div>
        <label htmlFor="contrasena" className="mb-1.5 block text-sm font-medium">
          Contraseña
        </label>
        <input
          id="contrasena"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          className="w-full rounded-xl border border-linea bg-superficie px-4 py-3 text-base focus:border-cian focus:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-pierde">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-xl bg-cian px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
