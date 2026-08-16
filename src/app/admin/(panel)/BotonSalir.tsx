'use client';

import { useRouter } from 'next/navigation';

export function BotonSalir() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await fetch('/api/admin/login', { method: 'DELETE' });
        router.replace('/admin/entrar');
        router.refresh();
      }}
      className="rounded-full border border-linea px-4 py-2 text-sm text-tenue transition-colors hover:border-pierde hover:text-pierde"
    >
      Salir
    </button>
  );
}
