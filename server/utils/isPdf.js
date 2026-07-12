/** Upload-Härtung: echte PDF-Signatur prüfen (Magic Bytes), nicht nur den Mimetype. */
function isPdfBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 4 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}
module.exports = { isPdfBuffer };
