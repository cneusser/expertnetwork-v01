/**
 * Scheduler-Hook (Sprint 0): läuft täglich 06:00, noch ohne Fachjobs.
 * Sprint 2 registriert hier: Verfügbarkeits-Reminder (14 Tage),
 * "nicht bestätigt"-Ableitung (7 Tage), Consent-Ablauf (30-Tage-Vorlauf).
 */
const cron = require('node-cron');

const jobs = [];

/** Fachjobs registrieren: registerJob('name', async () => { ... }) */
function registerJob(name, fn) {
  jobs.push({ name, fn });
}

function startScheduler() {
  cron.schedule('0 6 * * *', async () => {
    console.log(`[SCHEDULER] Tageslauf, ${jobs.length} Job(s)`);
    for (const job of jobs) {
      try {
        await job.fn();
        console.log(`[SCHEDULER] ok: ${job.name}`);
      } catch (e) {
        console.error(`[SCHEDULER] Fehler in ${job.name}:`, e.message);
      }
    }
  });
  console.log('[SCHEDULER] gestartet (täglich 06:00)');
}

module.exports = { startScheduler, registerJob };
