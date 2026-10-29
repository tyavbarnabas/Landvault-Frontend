// The sky behind a hero at night (Figma "Marketplace — Night"): a moon and a
// dozen stars that twinkle. Hidden by day; the parent must be `relative` and
// its content `relative` so it sits above.

// Fixed spots, so the sky doesn't move between renders: [left %, top %, delay s].
const STARS: [number, number, number][] = [
  [6, 18, 0], [14, 62, 1.2], [22, 30, 2.1], [31, 12, 0.6], [39, 48, 1.8], [47, 22, 2.6],
  [56, 70, 0.3], [63, 14, 1.5], [71, 40, 2.3], [78, 66, 0.9], [84, 26, 2.8], [93, 52, 1.1],
];

export default function NightSky() {
  return (
    <div className="night-sky" aria-hidden="true">
      <span className="moon" />
      {STARS.map(([left, top, delay]) => (
        <span key={`${left}-${top}`} className="star" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }} />
      ))}
    </div>
  );
}
