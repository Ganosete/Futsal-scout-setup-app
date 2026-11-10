import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Las mismas migraciones que se aplican en produccion. Aplicarlas otra vez no
// hace nada: se apuntan en la tabla d1_migrations.
await applyD1Migrations(env.BD, env.MIGRACIONES);
