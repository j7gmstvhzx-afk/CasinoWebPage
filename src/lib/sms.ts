import 'server-only';
import { randomInt } from 'node:crypto';

/**
 * Envío de SMS — MONTADO PERO APAGADO.
 *
 * El dueño decidió empezar solo con contraseña. La razón, con números: cada
 * mensaje cuesta ~$0.01, y con 300 entradas al día son ~$3 diarios en SMS para
 * proteger un premio de $25 — además de la fricción de un código en el paso
 * donde más gente abandona.
 *
 * Este archivo existe igualmente para que encenderlo el día de mañana sea
 * poner tres variables de entorno y no reescribir el login. Mientras
 * `SMS_PROVEEDOR` no esté puesta, `smsActivo()` devuelve false y NADIE llama a
 * nada: no hay cuenta que abrir, ni dependencia que instalar, ni código muerto
 * que pueda enviar un mensaje por accidente.
 *
 * PARA ENCENDERLO (Twilio)
 * ------------------------
 *   1. Abrir cuenta en twilio.com y comprar un número de EE. UU.
 *   2. En Vercel → Settings → Environment Variables:
 *        SMS_PROVEEDOR      = twilio
 *        TWILIO_ACCOUNT_SID = AC...
 *        TWILIO_AUTH_TOKEN  = ...
 *        TWILIO_FROM        = +1787...
 *      NUNCA en el repositorio: es público.
 *   3. Volver a desplegar.
 *
 * Se habla con la API REST por `fetch` a propósito, sin el SDK de Twilio: son
 * dos campos en un formulario, y el SDK son varios megas y un árbol de
 * dependencias que hay que ir actualizando.
 */

export type ResultadoSms = { ok: true } | { ok: false; motivo: string };

export function smsActivo(): boolean {
  return (process.env.SMS_PROVEEDOR ?? '').trim().toLowerCase() === 'twilio';
}

export async function enviarSms(a: string, texto: string): Promise<ResultadoSms> {
  if (!smsActivo()) return { ok: false, motivo: 'SMS_APAGADO' };

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const desde = process.env.TWILIO_FROM;
  if (!sid || !token || !desde) return { ok: false, motivo: 'SMS_MAL_CONFIGURADO' };

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: a, From: desde, Body: texto }),
      // Sin esto, un Twilio lento cuelga la función hasta el techo de Vercel y
      // el cliente se queda mirando una pantalla parada. Mejor fallar rápido.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // El cuerpo del error de Twilio puede traer el número de teléfono. No se
      // registra: son datos personales y los logs de Vercel los ve más gente de
      // la que debería.
      console.error('[sms] Twilio respondió', res.status);
      return { ok: false, motivo: 'SMS_RECHAZADO' };
    }
    return { ok: true };
  } catch {
    return { ok: false, motivo: 'SMS_SIN_RESPUESTA' };
  }
}

/** Código de 6 dígitos, con azar criptográfico. */
export function generarCodigoSms(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
