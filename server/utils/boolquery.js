/**
 * Boolean-Suchsyntax (wie LinkedIn) → PostgreSQL tsquery.
 * Unterstützt: AND/UND, OR/ODER, NOT/NICHT, Klammern; ohne Operator gilt AND.
 * Begriffe werden mit Präfix-Matching (:*) übersetzt.
 * Beispiel: 'SAP AND (Interim OR CRO) NOT Automotive'
 *        →  'SAP:* & (Interim:* | CRO:*) & !Automotive:*'
 */
function toTsQuery(input) {
  if (!input || !input.trim()) return null;
  const raw = input.match(/\(|\)|[A-Za-zÄÖÜäöüß0-9][A-Za-zÄÖÜäöüß0-9._-]*/g) || [];
  const out = [];
  const isTermOrClose = (t) => t && t !== '&' && t !== '|' && t !== '!' && t !== '(';

  for (const tok of raw) {
    const upper = tok.toUpperCase();
    let piece;
    if (upper === 'AND' || upper === 'UND') piece = '&';
    else if (upper === 'OR' || upper === 'ODER') piece = '|';
    else if (upper === 'NOT' || upper === 'NICHT') piece = '!';
    else if (tok === '(' || tok === ')') piece = tok;
    else piece = `${tok.replace(/[':&|!()]/g, '')}:*`;

    const prev = out[out.length - 1];
    // Implizites AND zwischen zwei Begriffen, vor '(' und vor '!'
    if ((piece.endsWith(':*') || piece === '(' || piece === '!') && isTermOrClose(prev)) {
      out.push('&');
    }
    out.push(piece);
  }
  // '!' direkt nach Operator ok; '& !' korrekt. Klammerbalance grob prüfen:
  const open = out.filter((t) => t === '(').length;
  const close = out.filter((t) => t === ')').length;
  if (open !== close) throw new Error('Klammern in der Suchanfrage sind unausgeglichen');
  return out.join(' ');
}

module.exports = { toTsQuery };
