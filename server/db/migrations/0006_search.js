/**
 * Sprint 5 — Volltextsuche (PostgreSQL FTS, deutsche Konfiguration).
 * search_vector wird per Trigger aktuell gehalten: Profilfelder direkt,
 * Skills über einen Trigger auf expert_skills (Neuberechnung).
 * Zusätzlich: gespeicherte Suchen je Admin.
 */

exports.up = async function up(knex) {
  await knex.raw(`ALTER TABLE experts ADD COLUMN search_vector tsvector`);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION expert_search_vector(e experts) RETURNS tsvector AS $$
      SELECT to_tsvector('german', concat_ws(' ',
        e.vorname, e.nachname, e.firma, e.berufsbezeichnung, e.kurzprofil,
        e.ort, e.land, e.reisebereitschaft,
        (SELECT string_agg(s.name, ' ') FROM expert_skills es
           JOIN skills s ON s.id = es.skill_id WHERE es.expert_id = e.id)
      ));
    $$ LANGUAGE sql STABLE;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION trg_experts_search_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector := expert_search_vector(NEW);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`
    CREATE TRIGGER experts_search_update
    BEFORE INSERT OR UPDATE OF vorname, nachname, firma, berufsbezeichnung,
      kurzprofil, ort, land, reisebereitschaft ON experts
    FOR EACH ROW EXECUTE FUNCTION trg_experts_search_update();
  `);

  // Skills ändern sich in expert_skills → Experten-Vektor neu berechnen.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION trg_expert_skills_search_update() RETURNS trigger AS $$
    DECLARE eid integer;
    BEGIN
      eid := COALESCE(NEW.expert_id, OLD.expert_id);
      UPDATE experts e SET search_vector = expert_search_vector(e) WHERE e.id = eid;
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`
    CREATE TRIGGER expert_skills_search_update
    AFTER INSERT OR UPDATE OR DELETE ON expert_skills
    FOR EACH ROW EXECUTE FUNCTION trg_expert_skills_search_update();
  `);

  await knex.raw(`UPDATE experts e SET search_vector = expert_search_vector(e)`); // Backfill
  await knex.raw(`CREATE INDEX idx_experts_search ON experts USING GIN (search_vector)`);

  await knex.schema.createTable('saved_searches', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('tenants.id');
    t.integer('user_id').notNullable().references('users.id');
    t.string('name').notNullable();
    t.jsonb('params_json').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['user_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('saved_searches');
  await knex.raw('DROP INDEX IF EXISTS idx_experts_search');
  await knex.raw('DROP TRIGGER IF EXISTS expert_skills_search_update ON expert_skills');
  await knex.raw('DROP FUNCTION IF EXISTS trg_expert_skills_search_update');
  await knex.raw('DROP TRIGGER IF EXISTS experts_search_update ON experts');
  await knex.raw('DROP FUNCTION IF EXISTS trg_experts_search_update');
  await knex.raw('DROP FUNCTION IF EXISTS expert_search_vector(experts)');
  await knex.raw('ALTER TABLE experts DROP COLUMN IF EXISTS search_vector');
};
