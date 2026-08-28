import type { Metadata } from 'next';
import { PageHero } from '@/components/site/PageHero';
import { SITE, PROMO, fullAddress } from '@/lib/site';
import { AYUDA, AVISO_PROMOCIONAL } from '@/lib/juego-responsable';

export const metadata: Metadata = {
  title: 'Términos y Condiciones',
  description: `Bases de la promoción "Gira y Gana" de ${SITE.name} y aviso de privacidad.`,
};

/**
 * Bases de la promoción.
 *
 * PENDIENTE DE REVISIÓN LEGAL antes de salir en vivo. Este texto está redactado
 * para cubrir lo que el sistema hace de verdad, pero quien lo tiene que aprobar
 * es el asesor legal del casino — sobre todo el punto de si una promoción con
 * premio en efectivo requiere notificación previa en Puerto Rico.
 *
 * El límite de un premio por día SÍ va declarado aquí, aunque no se anuncie en
 * la pantalla de la tragamonedas. Que la mecánica sea discreta es diseño normal
 * de promoción; que la limitación material no esté escrita en ninguna parte es
 * lo que se vuelve un problema si alguien reclama.
 */
export default function PaginaTerminos() {
  const actualizado = '16 de agosto de 2026';

  return (
    <>
      <PageHero
        titulo="Términos y Condiciones"
        descripcion={`Bases de la promoción "Gira y Gana" y aviso de privacidad. Última actualización: ${actualizado}.`}
      />

      <section className="contenedor py-10 sm:py-14">
        <div className="tarjeta max-w-3xl space-y-10 p-8 sm:p-10">
          <Aviso />

          <Bloque titulo="1. Organizador">
            <p>
              La promoción &ldquo;Gira y Gana&rdquo; es organizada por {SITE.name},
              con local en {fullAddress()}, teléfono {SITE.phoneDisplay}.
            </p>
          </Bloque>

          <Bloque titulo="2. Quién puede participar">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Personas de {PROMO.minAge} años o más. Se requiere identificación
                con foto vigente al reclamar cualquier premio.
              </li>
              <li>
                No pueden participar empleados de {SITE.name} ni sus familiares
                directos.
              </li>
              <li>
                <strong className="text-tinta">No es necesario comprar ni jugar nada</strong>{' '}
                para participar. La tirada es gratuita.
              </li>
            </ul>
          </Bloque>

          <Bloque titulo="3. Cómo se participa">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Se completa el registro con nombre completo, número de celular y
                pueblo de residencia.
              </li>
              <li>
                Cada participante tiene derecho a{' '}
                <strong className="text-tinta">una (1) tirada gratuita por día natural</strong>,
                contado en hora de Puerto Rico (AST).
              </li>
              <li>
                El resultado de cada tirada lo determina nuestro sistema en el
                momento de la tirada. La animación en pantalla muestra ese
                resultado; no lo decide.
              </li>
            </ul>
          </Bloque>

          <Bloque titulo="4. Premios y disponibilidad">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                El premio consiste en {PROMO.prizeLabel}.00 en efectivo, canjeable
                en el área de Servicio al Cliente.
              </li>
              <li>
                <strong className="text-tinta">
                  Hay un (1) premio disponible por día natural.
                </strong>{' '}
                Una vez adjudicado el premio del día, las tiradas restantes de esa
                jornada no resultan premiadas.
              </li>
              <li>
                <strong className="text-tinta">
                  Un mismo participante puede resultar premiado una (1) sola vez
                  cada treinta (30) días.
                </strong>
              </li>
              <li>
                Los premios no son transferibles, no se acumulan y no tienen
                equivalente en crédito de juego.
              </li>
            </ul>
          </Bloque>

          <Bloque titulo="5. Cupones y canje">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Al resultar premiado se emite un cupón digital con un código
                único.
              </li>
              <li>
                El cupón vence a los {PROMO.voucherDays} días naturales, al final
                del último día de vigencia. Un cupón vencido no se repone.
              </li>
              <li>
                El cupón se canjea una sola vez, en persona, presentando la
                pantalla y una identificación con foto cuyo nombre coincida con el
                del registro.
              </li>
              <li>
                {SITE.name} se reserva el derecho de anular cupones obtenidos
                mediante registros falsos, duplicados o cualquier intento de
                manipulación del sistema.
              </li>
            </ul>
          </Bloque>

          <Bloque titulo="6. Privacidad de tus datos">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Los datos que recogemos —nombre completo, celular y pueblo— se
                usan para administrar la promoción y para enviarte información
                sobre promociones y eventos del casino.
              </li>
              <li>
                <strong className="text-tinta">
                  No vendemos ni cedemos tus datos a terceros.
                </strong>
              </li>
              <li>
                Puedes pedir que borremos tus datos o que dejemos de contactarte
                escribiendo o llamando al {SITE.phoneDisplay}. Lo atendemos sin
                condiciones.
              </li>
              <li>
                Conservamos el registro de tiradas y premios el tiempo necesario
                para administrar la promoción y cumplir con nuestras obligaciones.
              </li>
            </ul>
          </Bloque>

          <Bloque titulo="7. Cambios y cancelación">
            <p>
              {SITE.name} puede modificar o dar por terminada esta promoción en
              cualquier momento. Los cupones ya emitidos y vigentes al momento del
              cambio se honran hasta su fecha de vencimiento.
            </p>
          </Bloque>

          <Bloque titulo="8. Juego responsable">
            <p>
              El juego debe ser entretenimiento, no una forma de resolver
              problemas de dinero. Si sientes que el juego está afectando tu vida
              o la de alguien cercano, hay ayuda gratuita y confidencial.
            </p>
            {/* Recursos con nombre y número, no "habla con nuestro personal".
                Quien se da cuenta a las dos de la mañana no puede hablar con
                nadie del casino, y esa era toda la ayuda que ofrecía esta
                página. */}
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-tinta">{AYUDA.lineaNombre}:</strong>{' '}
                <a className="underline underline-offset-4 hover:text-cian" href={`tel:${AYUDA.lineaTelefono}`}>
                  {AYUDA.lineaDisplay}
                </a>
                . 24 horas, 7 días, libre de costo. Atiende también a familiares.
              </li>
              <li>
                <strong className="text-tinta">Autoexclusión voluntaria.</strong>{' '}
                La Comisión de Juegos del Gobierno de Puerto Rico te puede excluir
                de los casinos de la isla por el tiempo que tú decidas. Es gratis
                y lo pides tú:{' '}
                <a
                  className="underline underline-offset-4 hover:text-cian"
                  href={AYUDA.autoexclusion}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  comjuegos.pr.gov
                </a>{' '}
                o escribiendo a {AYUDA.autoexclusionCorreo}.
              </li>
              <li>
                También puedes hablar con nuestro personal en cualquier momento.
              </li>
            </ul>
          </Bloque>

          <Bloque titulo="9. Esto no es juego de azar en línea">
            <p>{AVISO_PROMOCIONAL}</p>
            <p>
              En Puerto Rico el casino en línea de dinero real no está
              autorizado. La tragamonedas de esta página reparte un premio
              promocional y nada más: no acepta apuestas, no vende créditos y no
              paga en función de lo que juegues. Si ves una página que dice ser
              este casino y te pide dinero para jugar en línea, no es nuestra.
            </p>
          </Bloque>
        </div>
      </section>
    </>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-bold text-tinta">{titulo}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-tenue">{children}</div>
    </section>
  );
}

/**
 * Recordatorio visible en la propia página, para que no se publique sin pasar
 * por revisión legal. Se borra este bloque cuando el casino apruebe el texto.
 */
/**
 * El aviso de "pendiente de revisión legal".
 *
 * ESTE AVISO NO ES PARA EL CLIENTE, Y SE ESTABA VIENDO EN VIVO.
 * ---------------------------------------------------------------
 * La condición era "ocultar solo si producción Y aprobado", así que en
 * producción sin aprobar salía el recuadro entero — incluida la frase «para
 * ocultar este aviso, define TERMINOS_APROBADOS=si». Comprobado contra la
 * página en producción: ahí estaba, a la vista de cualquiera.
 *
 * Dos cosas mal a la vez. Una, se le enseñaba a un cliente una instrucción de
 * configuración que no significa nada para él. Y dos, más grave: se anunciaba
 * en público que las bases de la promoción no están revisadas, que es una
 * invitación a discutirlas justo cuando alguien reclama un premio.
 *
 * El recordatorio hace falta, pero LE HACE FALTA A QUIEN PUEDE ACTUAR. Así que
 * en producción no se le dice nada al cliente y el aviso sale en el panel del
 * casino, junto al resto de lo que el dueño tiene pendiente. En desarrollo
 * sigue saliendo aquí, bien grande, que es donde sirve.
 */
function Aviso() {
  if (process.env.NODE_ENV === 'production') return null;
  return (
    // El texto va en `tinta`, no en `dorado`: el dorado de la marca da 3.63:1
    // sobre blanco, suficiente para un monto grande (piden 3:1) pero NO para
    // texto de 14px, que pide 4.5:1. El borde y el fondo dorados se quedan, así
    // que el aviso sigue leyéndose como advertencia sin castigar la lectura.
    <div className="rounded-2xl border border-dorado/40 bg-dorado/10 p-5 text-sm text-tinta">
      <p className="font-semibold">Borrador — pendiente de revisión legal</p>
      <p className="mt-1.5">
        Este texto describe con exactitud lo que el sistema hace, pero debe
        aprobarlo el asesor legal del casino. Este recuadro solo sale en
        desarrollo; en el sitio en vivo el recordatorio va en el panel.
      </p>
    </div>
  );
}
