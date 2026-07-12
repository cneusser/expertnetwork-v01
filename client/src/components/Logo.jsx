/** Reines Text-Logo (CSS), keine Bilddatei — Lehre aus phalanx-v01. */
export default function Logo({ inverse = false }) {
  return (
    <div className={`logo${inverse ? ' logo-inverse' : ''}`}>
      <strong>Phalanx</strong> <span>Expert Network</span>
    </div>
  );
}
