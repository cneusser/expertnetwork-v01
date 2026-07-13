/**
 * StorageProvider-Interface: { save(relPath, buffer), createReadStream(relPath), exists(relPath) }
 * Default: lokales Dateisystem unter STORAGE_DIR.
 * Railway: Volume anlegen und auf /data mounten, dann STORAGE_DIR=/data setzen —
 * sonst gehen Uploads bei jedem Deploy verloren (ephemeres Dateisystem).
 * Später austauschbar gegen S3/R2 (gleiche drei Methoden).
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.STORAGE_DIR || path.join(__dirname, '..', '..', 'data', 'uploads');

function absolute(relPath) {
  const p = path.normalize(path.join(BASE, relPath));
  if (!p.startsWith(path.normalize(BASE))) throw new Error('Ungültiger Pfad'); // Path-Traversal-Schutz
  return p;
}

async function save(relPath, buffer) {
  const p = absolute(relPath);
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, buffer);
  return relPath;
}

function createReadStream(relPath) {
  return fs.createReadStream(absolute(relPath));
}

function exists(relPath) {
  return fs.existsSync(absolute(relPath));
}

async function remove(relPath) {
  const p = absolute(relPath);
  if (fs.existsSync(p)) await fs.promises.unlink(p);
}

module.exports = { save, createReadStream, exists, remove, BASE };
