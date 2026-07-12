require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { registerJob } = require('./scheduler');
const { db } = require('./db/knex');
const { seed } = require('./db/seed');
const { importAll } = require('./db/import-experts');
const { auditContext, autoAudit } = require('./middleware/audit');
const authRoutes = require('./routes/auth');
const expertRoutes = require('./routes/experts');
const availabilityRoutes = require('./routes/availability');
const auditRoutes = require('./routes/audit');
const searchRoutes = require('./routes/search');
const projectRoutes = require('./routes/projects');
const { runAvailabilityReminders, runConsentJobs } = require('./jobs');
const { startScheduler } = require('./scheduler');

// Ein fehlgeschlagener Mail-Versand o. ä. darf den Server nie mitreißen.
process.on('unhandledRejection', (e) => console.error('UNHANDLED REJECTION:', e?.message || e));
process.on('uncaughtException', (e) => console.error('UNCAUGHT EXCEPTION:', e?.message || e));

const app = express();
app.set('trust proxy', 1); // Railway-Proxy → korrekte req.ip

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
}

// Audit-Prinzip: Kontext + Auto-Logging für ALLE Routen (Grundregel Sprint 0).
app.use(auditContext);
app.use('/api', autoAudit);

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'expertnetwork', sprint: 0 }));
app.use('/api/auth', authRoutes);
app.use('/api/experts', expertRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/projects', projectRoutes);

// Produktion: gebauten Client ausliefern (ein Railway-Service für beides).
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next());
});

const PORT = process.env.PORT || 3001;

async function waitForDb(retries = 15, delayMs = 3000) {
  // Railway: Postgres/Private Networking kann beim Kaltstart einige Sekunden
  // brauchen — statt Crash-Loop warten wir mit klarer Diagnose.
  for (let i = 1; i <= retries; i++) {
    try {
      await db.raw('select 1');
      return;
    } catch (e) {
      console.log(`DB nicht erreichbar (Versuch ${i}/${retries}): ${e.message}`);
      if (i === retries) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error(
      'FEHLER: DATABASE_URL ist nicht gesetzt.\n' +
      'Railway: im App-Service unter "Variables" anlegen mit dem Wert ${{Postgres.DATABASE_URL}}\n' +
      '(Referenz auf den PostgreSQL-Service; Namen ggf. anpassen, siehe README).'
    );
    process.exit(1);
  }
  // Migrationen + idempotentes Seeding bei jedem Start (Lehre aus phalanx-v01).
  await waitForDb();
  await db.migrate.latest();
  await seed();
  await importAll(); // kuratierte Expertenprofile (idempotent)
  registerJob('availability-reminders', runAvailabilityReminders);
  registerJob('consent-jobs', runConsentJobs);
  startScheduler();
  app.listen(PORT, () => console.log(`Phalanx Expert Network Server auf Port ${PORT}`));
}

if (require.main === module) {
  start().catch((e) => { console.error('Startfehler:', e); process.exit(1); });
}

module.exports = { app, start };
