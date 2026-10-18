/**
 * v1.49.0 — Die Reaktion des Kunden auf ein Profil.
 *
 * Drei Antworten, die ein Kunde geben kann:
 *
 *   gemerkt    interessant, aber noch keine Entscheidung
 *   einladen   möchte sprechen
 *   abgelehnt  passt nicht
 *
 * "gemerkt" gibt es, weil die Wirklichkeit so aussieht: Ein Kunde liest drei
 * Profile, findet zwei brauchbar und will erst mit dem Dritten vergleichen.
 * Ohne diese Stufe klickt er gar nichts, und dann weißt du nichts.
 *
 * Eine Absage wird NICHT sofort weitergereicht. Zwischen der Entscheidung
 * des Kunden und der Nachricht an den Kandidaten liegt ein Gespräch, das du
 * vielleicht noch führst. Eine Absage, die du nicht kommen sahst, lässt sich
 * schwer zurückholen.
 */

const REAKTIONEN = ['gemerkt', 'einladen', 'abgelehnt'];

/**
 * Welcher Pipeline-Status zu welcher Reaktion gehört.
 *
 * "gemerkt" ändert nichts: Der Kandidat liegt weiter beim Kunden, und das
 * ist genau der Zustand. Eine eigene Stufe dafür wäre eine Stufe, die nichts
 * bedeutet.
 */
const STATUS_ZU = {
  einladen: 'im_gespraech',
  abgelehnt: 'abgelehnt',
};

/**
 * Eine Reaktion verbuchen.
 *
 * Gibt zurück, was sich geändert hat, damit der Aufrufer weiß, ob er dich
 * benachrichtigen muss. Eine Reaktion, die dieselbe bleibt, ist keine
 * Nachricht wert.
 */
async function reagiere(db, { token, positionId, reaktion, notiz = null }) {
  if (!REAKTIONEN.includes(reaktion)) return { ok: false, grund: 'unbekannt' };

  const v = await db('vorlagen').where({ token }).first();
  if (!v) return { ok: false, grund: 'nicht_gefunden' };
  if (v.status === 'entwurf') return { ok: false, grund: 'entwurf' };
  if (v.gueltig_bis && new Date(v.gueltig_bis) < new Date()) return { ok: false, grund: 'abgelaufen' };

  const p = await db('vorlage_positionen').where({ id: positionId, vorlage_id: v.id }).first();
  if (!p) return { ok: false, grund: 'position_nicht_gefunden' };

  // Ist die Absage schon unterwegs, lässt sie sich nicht mehr zurücknehmen.
  // Dem Kandidaten wurde abgesagt; das wieder einzusammeln geht nur von Hand.
  if (p.absage_verschickt_am && reaktion !== 'abgelehnt') {
    return { ok: false, grund: 'absage_schon_draussen' };
  }

  const vorher = p.reaktion;
  const jetzt = new Date();

  await db('vorlage_positionen').where({ id: p.id }).update({
    reaktion,
    reaktion_am: jetzt,
    reaktion_notiz: notiz ? String(notiz).slice(0, 2000) : p.reaktion_notiz,
    absage_grund_kunde: reaktion === 'abgelehnt' && notiz ? String(notiz).slice(0, 2000) : p.absage_grund_kunde,
  });
  await db('vorlagen').where({ id: v.id }).update({ letzte_reaktion_am: jetzt });

  // Die Pipeline zieht mit, damit der Stand an einer Stelle steht.
  const neuerStatus = STATUS_ZU[reaktion];
  if (neuerStatus) {
    const a = await db('applications')
      .where({ project_id: v.project_id, expert_id: p.expert_id }).first();
    if (a && !['besetzt', 'angeboten'].includes(a.status)) {
      await db('applications').where({ id: a.id }).update({
        status: neuerStatus, updated_at: jetzt, stage_changed_at: jetzt,
      });
    }
  }

  return {
    ok: true,
    geaendert: vorher !== reaktion,
    vorher,
    reaktion,
    vorlage: v,
    position: await db('vorlage_positionen').where({ id: p.id }).first(),
  };
}

/** Der Stand einer Vorlage auf einen Blick, für Mail und Übersicht. */
async function stand(db, vorlageId) {
  const positionen = await db('vorlage_positionen').where({ vorlage_id: vorlageId }).orderBy('sortierung');
  return {
    gesamt: positionen.length,
    gemerkt: positionen.filter((p) => p.reaktion === 'gemerkt').length,
    einladen: positionen.filter((p) => p.reaktion === 'einladen').length,
    abgelehnt: positionen.filter((p) => p.reaktion === 'abgelehnt').length,
    offen: positionen.filter((p) => !p.reaktion).length,
    // Absagen, die noch auf deine Freigabe warten.
    absagen_offen: positionen.filter((p) => p.reaktion === 'abgelehnt' && !p.absage_verschickt_am).length,
  };
}

/**
 * Die Absagen, die noch an Kandidaten hinausgehen müssen.
 *
 * Über alle Vorlagen hinweg, denn die Frage "wem muss ich noch absagen" hat
 * mit der einzelnen Vorlage nichts zu tun.
 */
async function offeneAbsagen(db, tenantId) {
  return db('vorlage_positionen as p')
    .join('vorlagen as v', 'v.id', 'p.vorlage_id')
    .join('experts as e', 'e.id', 'p.expert_id')
    .join('projects as pr', 'pr.id', 'v.project_id')
    .where('v.tenant_id', tenantId)
    .andWhere('p.reaktion', 'abgelehnt')
    .whereNull('p.absage_verschickt_am')
    .select('p.id', 'p.kennung', 'p.reaktion_am', 'p.absage_grund_kunde', 'p.absage_freigegeben_am',
      'e.id as expert_id', 'e.vorname', 'e.nachname', 'e.email',
      'pr.id as projekt_id', 'pr.name as projekt_name',
      'v.id as vorlage_id', 'v.empfaenger_firma')
    .orderBy('p.reaktion_am', 'asc');
}

module.exports = { REAKTIONEN, STATUS_ZU, reagiere, stand, offeneAbsagen };
