# Casino Atlántico Manatí

Sitio web del Casino Atlántico Manatí, con la promoción **"Gira y Gana $25"**.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Postgres/Supabase · Vercel

---

## Qué hace

**Para el cliente**

- Tragamonedas de 3 rolos: una tirada gratis al día. Tres símbolos iguales = **$25** en efectivo.
- Al ganar se emite un cupón digital con QR que se presenta en Servicio al Cliente.
- Tablero de jackpots con el **número de banco** de cada máquina, buscador y badge de premio caliente.
- Máquinas recién llegadas, eventos y promociones, galería, menú y contacto.

**Para el personal** (`/admin`)

- Importar el Excel *Tabla Premios App* tal como está, con vista previa antes de publicar.
- Canjear cupones (escaneando el QR o tecleando el código).
- Ver clientes registrados y exportarlos a Excel para mercadeo.

---

## Cómo funciona la promoción

El punto de todo el diseño: **la garantía de un solo ganador por día vive en la
base de datos, no en el código de la aplicación.**

- `spins_one_winner_per_day` — índice único parcial sobre `(gaming_date) where is_winner`.
  Guardar dos ganadores el mismo día es *imposible*, no importa lo que haga la
  aplicación, un cron, una migración o alguien desde la consola de Supabase.
- `wins_no_repeat_within_30d` — restricción `EXCLUDE` sobre rangos de tiempo.
  Impone el límite de un premio por persona cada 30 días.
- `unique (player_id, gaming_date)` — una tirada por persona al día, y a la vez
  la llave de idempotencia: doble clic, recargar o volver atrás devuelven la
  misma tirada y el mismo cupón.

Cada madrugada, un cron escoge en secreto un **instante ganador** al azar dentro
del día, ponderado por las horas en que la gente de verdad juega. La primera
tirada elegible en o después de ese instante se lleva el premio. Todo el proceso
corre como **una sola función de Postgres** (`app.execute_spin`) porque el
pooler de Supabase opera en modo transacción y no garantiza que consultas
sucesivas caigan en la misma conexión.

Los rolos del navegador son presentación: el servidor decide el resultado y la
animación solo aterriza en él. Manipular el JavaScript deja dibujar tres coronas
en pantalla, pero no genera un cupón — el cupón solo existe si lo creó Postgres.

---

## Levantarlo

```bash
npm install
cp .env.example .env.local     # y llenar los valores
npm run dev
```

### Base de datos

Aplicar las migraciones en orden:

```bash
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```

Datos de demostración para desarrollo (usa las máquinas reales de la hoja del casino):

```bash
psql "$DATABASE_URL" -f scripts/seed-demo.sql
```

### En Supabase, además

1. **Settings → API → Exposed schemas**: dejar solo `public`. El esquema `app`
   **no** se expone.
2. Usar la cadena del **pooler en modo transacción (puerto 6543)** en
   `DATABASE_POOL_URL`, no la conexión directa.

> La llave `anon` de Supabase viaja dentro del JavaScript que descarga
> cualquier visitante. Si `app.daily_winner_slots` quedara accesible, cualquiera
> podría leer el instante ganador y **ganar todos los días**. `0004_rls.sql`
> activa RLS sin políticas en todas las tablas como segunda barrera; las dos
> medidas son necesarias, no una sola.

### El cron es obligatorio

`vercel.json` programa `/api/cron/seed-slots` a las 00:05 de Puerto Rico, y
siembra 7 días por adelantado.

**No es opcional.** Si los días se sembraran al vuelo en la primera tirada, el
instante ganador se sortearía sobre las 24 horas completas y para cuando alguien
tira a las 3 de la tarde ya habría pasado en ~62% de los casos — esa persona
ganaría casi todos los días. Hay una siembra de emergencia dentro de
`execute_spin` que solo sortea sobre las horas que quedan, pero deja un registro
en `app.risk_events` porque significa que el cron no corrió.

---

## Pruebas

```bash
./scripts/test-concurrency.sh 60 240
```

Dispara 240 tiradas **realmente simultáneas** con `pgbench` y verifica 14
invariantes: exactamente un ganador, un cupón, idempotencia ante doble envío, la
regla de 30 días, que un jugador no elegible no consuma el premio del día, que
ningún perdedor muestre tres símbolos iguales, y que un cupón no se canjee dos
veces.

Es la única prueba que sirve para esto: un test secuencial nunca reproduce la
condición de carrera que se quiere descartar.

```bash
npx tsc --noEmit && npx eslint . && npm run build
```

---

## Estructura

```
src/
  app/
    page.tsx                    Inicio, con la tragamonedas embebida
    jackpots/                   Tablero de premios
    maquinas-nuevas/            Máquinas recién llegadas
    eventos/ galeria/ menu/ contacto/ terminos/
    premio/[codigo]/            Cupón digital (SOLO LECTURA — nunca canjea)
    admin/
      entrar/                   Login del personal
      (panel)/                  Todo lo protegido: layout.tsx es el guardia
    api/
      spin/                     La tirada
      admin/                    Login, canje, importador, exportar clientes
      cron/seed-slots/          Siembra de los premios diarios
  components/
    slot/                       Tragamonedas, modal, símbolos
    jackpots/ site/
  lib/
    db.ts                       Cliente de Postgres (prepare:false, max:1)
    reels.ts                    Símbolos y combinaciones
    voucher.ts                  Códigos con dígito verificador
    importar-jackpots.ts        Lector del Excel del casino
    queries.ts                  Consultas de las páginas públicas
supabase/migrations/            Esquema, funciones, RLS
scripts/                        Pruebas y datos de demostración
```

---

## Pendiente antes de salir en vivo

- **Imágenes reales**: logo en alta resolución, fotos del local, flyers de
  eventos, fotos de las máquinas. Hoy hay marcadores de posición con los colores
  de la marca; el logo en `components/site/Logo.tsx` es una reconstrucción.
- **Confirmar** dirección, teléfono y horario en `lib/site.ts` — salen de
  directorios públicos, no de una fuente del casino.
- **Revisión legal de `/terminos`.** La página muestra un aviso de borrador
  hasta que se defina `TERMINOS_APROBADOS=si`. Conviene confirmar con el asesor
  legal si una promoción con premio en efectivo requiere notificación previa en
  Puerto Rico.
- **Cuentas por empleado.** Hoy el panel usa una contraseña compartida, que es
  lo apropiado para una tablet de mostrador, pero `redeemed_by` solo dice "fue
  alguien del personal". El esquema (`app.staff`) ya está listo para pasar a
  Supabase Auth cuando haga falta saber quién entregó cada premio.
- **Verificación por SMS.** No está activada, por decisión de negocio. Sin ella
  alguien decidido puede inventar números; como hay un solo premio al día y tope
  de 30 días por persona, la exposición máxima es **$25 al día** pase lo que
  pase. Si aparece abuso, se activa OTP sin rehacer nada.
