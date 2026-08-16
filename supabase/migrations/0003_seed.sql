-- =============================================================================
-- Datos base
-- =============================================================================

-- Los 78 municipios de Puerto Rico, en orden alfabético.
insert into app.municipalities (id, name) values
  (1,'Adjuntas'),(2,'Aguada'),(3,'Aguadilla'),(4,'Aguas Buenas'),(5,'Aibonito'),
  (6,'Añasco'),(7,'Arecibo'),(8,'Arroyo'),(9,'Barceloneta'),(10,'Barranquitas'),
  (11,'Bayamón'),(12,'Cabo Rojo'),(13,'Caguas'),(14,'Camuy'),(15,'Canóvanas'),
  (16,'Carolina'),(17,'Cataño'),(18,'Cayey'),(19,'Ceiba'),(20,'Ciales'),
  (21,'Cidra'),(22,'Coamo'),(23,'Comerío'),(24,'Corozal'),(25,'Culebra'),
  (26,'Dorado'),(27,'Fajardo'),(28,'Florida'),(29,'Guánica'),(30,'Guayama'),
  (31,'Guayanilla'),(32,'Guaynabo'),(33,'Gurabo'),(34,'Hatillo'),(35,'Hormigueros'),
  (36,'Humacao'),(37,'Isabela'),(38,'Jayuya'),(39,'Juana Díaz'),(40,'Juncos'),
  (41,'Lajas'),(42,'Lares'),(43,'Las Marías'),(44,'Las Piedras'),(45,'Loíza'),
  (46,'Luquillo'),(47,'Manatí'),(48,'Maricao'),(49,'Maunabo'),(50,'Mayagüez'),
  (51,'Moca'),(52,'Morovis'),(53,'Naguabo'),(54,'Naranjito'),(55,'Orocovis'),
  (56,'Patillas'),(57,'Peñuelas'),(58,'Ponce'),(59,'Quebradillas'),(60,'Rincón'),
  (61,'Río Grande'),(62,'Sabana Grande'),(63,'Salinas'),(64,'San Germán'),(65,'San Juan'),
  (66,'San Lorenzo'),(67,'San Sebastián'),(68,'Santa Isabel'),(69,'Toa Alta'),(70,'Toa Baja'),
  (71,'Trujillo Alto'),(72,'Utuado'),(73,'Vega Alta'),(74,'Vega Baja'),(75,'Vieques'),
  (76,'Villalba'),(77,'Yabucoa'),(78,'Yauco')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Curva de tráfico por hora (hora de Puerto Rico)
--
-- Punto de partida razonable para un casino de 8:00 a.m. a 12:00 a.m., con el
-- pico entre las 6 y las 10 de la noche. Las horas cerradas van en 0 para que
-- el instante ganador nunca caiga cuando no hay nadie jugando.
--
-- Se recalcula con datos reales una vez haya un mes de tiradas:
--   update app.traffic_weights w set weight = s.n
--   from (select extract(hour from created_at at time zone 'America/Puerto_Rico')::smallint h,
--                count(*) n from app.spins group by 1) s
--   where w.hour_local = s.h;
-- -----------------------------------------------------------------------------
insert into app.traffic_weights (hour_local, weight) values
  (0, 0.3),
  (1, 0), (2, 0), (3, 0), (4, 0), (5, 0), (6, 0), (7, 0),
  (8, 0.5), (9, 0.7), (10, 1.0), (11, 1.3),
  (12, 1.6), (13, 1.7), (14, 1.8), (15, 2.0),
  (16, 2.2), (17, 2.5), (18, 3.0), (19, 3.4),
  (20, 3.6), (21, 3.3), (22, 2.6), (23, 1.6)
on conflict (hour_local) do update set weight = excluded.weight;
