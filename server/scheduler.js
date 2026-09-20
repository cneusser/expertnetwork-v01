/**
 * Scheduler-Hook (Sprint 0): läuft täglich 06:00, noch ohne Fachjobs.
 * Sprint 2 registriert hier: Verfügbarkeits-Reminder (14 Tage),
 * "nicht bestätigt"-Ableitung (7 Tage), Consent-Ablauf (30-Tage-Vorlauf).
 */
const cron = require('node-cron');

const jobs = [];
const intervallJobs = [];

/** Fachjobs registrieren: registerJob('name', async () => { ... }) */
function registerJob(name, fn) {
  jobs.push({ name, fn });
}

/**
 * v1.32.0 — Jobs, die öfter laufen müssen als einmal am Tag.
 *
 * Der Tageslauf um 06:00 reicht für Erinnerungen und Fristen. Ein Abgleich mit
 * einem fremden System soll dagegen zeitnah sein, sonst arbeitet man einen
 * halben Tag mit veralteten Kontakten. `minuten` kommt aus der Umgebung,
 * 0 schaltet den Job ab, ohne dass man Code anfassen muss.
 */
function registerIntervallJob(name, minuten, fn) {
  const takt = Number(minuten);
  if (!Number.isFinite(takt) || takt <= 0) {
    console.log(`[SCHEDULER] ${name} ist abgeschaltet (Intervall ${minuten})`);
    return;
  }
  intervallJobs.push({ name, minuten: Math.min(Math.max(Math.round(takt), 1), 1440), fn });
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

  for (const job of intervallJobs) {
    // Ein laufender Durchgang darf sich nicht selbst überholen, wenn die
    // Gegenstelle einmal langsam ist.
    let laeuft = false;
    cron.schedule(`*/${job.minuten} * * * *`, async () => {
      if (laeuft) return console.warn(`[SCHEDULER] ${job.name} läuft noch, Takt übersprungen`);
      laeuft = true;
      try {
        await job.fn();
        console.log(`[SCHEDULER] ok: ${job.name}`);
      } catch (e) {
        console.error(`[SCHEDULER] Fehler in ${job.name}:`, e.message);
      } finally { laeuft = false; }
    });
    console.log(`[SCHEDULER] ${job.name} alle ${job.minuten} Minuten`);
  }

  console.log('[SCHEDULER] gestartet (täglich 06:00)');
}

module.exports = { startScheduler, registerJob, registerIntervallJob };
