/**
 * Sprint 0 — Fundament-Schema.
 * Prinzipien: jede Tabelle trägt tenant_id; audit_log ist append-only
 * (Trigger verhindert UPDATE/DELETE auch für Superuser der App-Rolle).
 */

exports.up = async function up(knex) {
  await knex.schema.createTable('tenants', (t) => {
    t.increments('id').primary();
    t.string('slug').notNullable().unique(); // z.B. "phalanx"
    t.string('name').notNullable();
    t.jsonb('branding_json').defaultTo('{}');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.string('email').notNullable().unique();
    t.string('password_hash').notNullable();
    t.string('role').notNullable().defaultTo('expert'); // admin | expert (später: tenant_owner, vendor)
    t.timestamp('email_verified_at');
    t.boolean('is_approved').notNullable().defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id']);
  });

  // DSGVO-Einwilligungen: versionierte Records, nie überschreiben.
  // In Sprint 0 an user_id gebunden; ab Sprint 1 zusätzlich expert_id nutzbar.
  await knex.schema.createTable('consents', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('user_id').notNullable().references('users.id');
    t.string('zweck').notNullable(); // z.B. "talentpool"
    t.string('text_version').notNullable(); // Version des Einwilligungstextes
    t.timestamp('granted_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('expires_at').notNullable(); // Befristung (24 Monate)
    t.timestamp('revoked_at');
    t.index(['user_id', 'zweck']);
  });

  // Append-only Audit-Log (Muster aus Capitalmatch activity_log).
  await knex.schema.createTable('audit_log', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable();
    t.integer('actor_id'); // null = System (Scheduler) oder anonymer Vorgang
    t.string('action').notNullable(); // z.B. "user.register", "auth.login"
    t.string('resource').notNullable(); // z.B. "users"
    t.integer('resource_id');
    t.jsonb('old_value_json');
    t.jsonb('new_value_json');
    t.string('ip');
    t.timestamp('ts').notNullable().defaultTo(knex.fn.now());
    t.index(['tenant_id', 'resource', 'ts']);
  });

  // Append-only erzwingen: UPDATE/DELETE auf audit_log hart verbieten.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_log ist append-only (% nicht erlaubt)', TG_OP;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`
    CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log');
  await knex.raw('DROP FUNCTION IF EXISTS audit_log_immutable');
  await knex.schema.dropTableIfExists('audit_log');
  await knex.schema.dropTableIfExists('consents');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('tenants');
};
