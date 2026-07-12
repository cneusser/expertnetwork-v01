require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { db } = require('./db/knex');
const { seed } = require('./db/seed');
const { auditContext, autoAudit } = require('./middleware/audit');
const authRoutes = require('./routes/auth');
const { startScheduler } = require('./scheduler');

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

// Produktion: gebauten Client ausliefern (ein Railway-Service für beides).
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next());
});

const PORT = process.env.PORT || 3001;

async function start() {
  // Migrationen + idempotentes Seeding bei jedem Start (Lehre aus phalanx-v01).
  await db.migrate.latest();
  await seed();
  startScheduler();
  app.listen(PORT, () => console.log(`Phalanx Expert Network Server auf Port ${PORT}`));
}

if (require.main === module) {
  start().catch((e) => { console.error('Startfehler:', e); process.exit(1); });
}

module.exports = { app, start };
