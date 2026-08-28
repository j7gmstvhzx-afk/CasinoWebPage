-- =============================================================================
-- Fecha de nacimiento del jugador
--
-- POR QUÉ HACE FALTA
-- ------------------
-- El sitio decía "+18" en el pie, "Solo mayores de 18 años" debajo del botón de
-- registro, y "Personas de 18 años o más" en los términos. Las tres cosas eran
-- DECORATIVAS: no había ni un solo sitio donde se comprobara la edad. Un menor
-- podía registrarse, tirar, ganar $25 y presentarse en el mostrador de un
-- casino con licencia a cobrarlo.
--
-- La edad mínima de 18 años para entrar a una sala de juego en Puerto Rico está
-- en la ley (15 L.P.R.A. § 77, que también prohíbe admitir menores). Un cartel
-- que dice la regla y no la aplica es peor que no tener cartel: deja el papel de
-- guardián en manos de alguien que ya decidió mentir.
--
-- NULABLE, A PROPÓSITO
-- --------------------
-- Las cuentas que ya existen no tienen fecha de nacimiento y no se les puede
-- inventar. Se pide a partir de ahora en el registro; a las viejas se les
-- preguntará cuando toque, no de golpe echando a nadie fuera. Es la misma
-- decisión que se tomó con `password_hash` en 0010 y funcionó.
--
-- LOS TOPES
-- ---------
-- No son adorno: sin ellos, un dedo de más al teclear el año mete un cliente
-- nacido en 1025 o en 2126, y las dos cosas rompen cualquier cuenta de edad y
-- cualquier lista de cumpleaños. 1900 cubre de sobra a cualquier persona viva.
-- El tope de arriba es "hoy" en hora de Puerto Rico, no en UTC: a las 8 de la
-- noche de Puerto Rico ya es el día siguiente en UTC, y un cumpleaños de hoy se
-- rechazaría por venir "del futuro".
-- =============================================================================

alter table app.players
  add column if not exists birth_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'players_nacimiento_cuerdo'
  ) then
    alter table app.players
      add constraint players_nacimiento_cuerdo
      check (
        birth_date is null
        or (
          birth_date >= date '1900-01-01'
          and birth_date <= (now() at time zone 'America/Puerto_Rico')::date
        )
      );
  end if;
end $$;

comment on column app.players.birth_date is
  'Fecha de nacimiento. Nulable: las cuentas anteriores a esta migración no la tienen. Se usa para comprobar los 18 años y para el regalo de cumpleaños.';

-- Índice por mes y día, para la lista de "cumpleaños de este mes" del panel.
-- Sin él, sacarla obliga a recorrer la tabla entera de clientes cada vez.
create index if not exists players_cumple_idx
  on app.players ((extract(month from birth_date)), (extract(day from birth_date)))
  where birth_date is not null;
