import 'server-only';
import { randomUUID } from 'node:crypto';

/**
 * Subida de imágenes a Supabase Storage.
 *
 * Se habla con la API REST de Storage directamente en vez de traer
 * @supabase/supabase-js: son dos llamadas fetch, y la librería completa pesa
 * bastante para lo poco que se usa aquí.
 *
 * Hace falta crear el bucket una sola vez, PÚBLICO, desde el panel de Supabase
 * (Storage -> New bucket -> nombre "medios", marcar "Public bucket"). Público
 * es lo correcto: son flyers de promociones y fotos de máquinas, hechos para
 * que los vea todo el mundo. Los datos de los clientes NO viven aquí.
 */

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'medios';

/** Solo formatos que el navegador muestra sin plugins. */
const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

export const MAX_BYTES = 8 * 1024 * 1024;

export type Subida =
  | { ok: true; ruta: string; url: string }
  | { ok: false; error: string };

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export const almacenamientoListo = () => config() !== null;

export async function subirImagen(archivo: File, carpeta: string): Promise<Subida> {
  const cfg = config();
  if (!cfg) {
    return {
      ok: false,
      error:
        'Falta configurar el almacenamiento. Define SUPABASE_URL y ' +
        'SUPABASE_SERVICE_ROLE_KEY, y crea el bucket público "medios".',
    };
  }

  const ext = TIPOS[archivo.type];
  if (!ext) return { ok: false, error: 'Solo se aceptan imágenes JPG, PNG, WEBP, AVIF o GIF.' };
  if (archivo.size > MAX_BYTES) return { ok: false, error: 'La imagen no puede pasar de 8 MB.' };

  // Nombre nuevo siempre. Si se conservara el del archivo, dos flyers llamados
  // "promo.jpg" se pisarían entre sí, y el nombre original puede traer acentos
  // y espacios que rompen la URL.
  const ruta = `${carpeta}/${new Date().toISOString().slice(0, 10)}-${randomUUID()}.${ext}`;

  const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${ruta}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.key}`,
      'content-type': archivo.type,
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body: await archivo.arrayBuffer(),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    console.error('[storage] fallo al subir', res.status, detalle);
    return {
      ok: false,
      error:
        res.status === 404
          ? `No existe el bucket "${BUCKET}". Créalo en Supabase (Storage → New bucket, público).`
          : 'No pudimos subir la imagen. Intenta de nuevo.',
    };
  }

  return { ok: true, ruta, url: urlPublica(ruta) };
}

export function urlPublica(ruta: string): string {
  const cfg = config();
  if (!cfg) return ruta;
  // Las rutas que ya son URL completas (por si alguien pega un enlace externo)
  // se dejan tal cual.
  if (/^https?:\/\//i.test(ruta)) return ruta;
  return `${cfg.url}/storage/v1/object/public/${BUCKET}/${ruta}`;
}

export async function borrarImagen(ruta: string): Promise<void> {
  const cfg = config();
  if (!cfg || /^https?:\/\//i.test(ruta)) return;

  // Si falla, se ignora: dejar un archivo huérfano en el bucket es mucho menos
  // grave que impedirle al personal borrar una promoción vencida.
  await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${ruta}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${cfg.key}` },
  }).catch(() => {});
}
