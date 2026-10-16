import { useCountUp } from '../hooks/useApp';

const AR = '٠١٢٣٤٥٦٧٨٩';
const NUM = /[0-9٠-٩][0-9٠-٩,٬.٫]*/;

function parse(token: string): { n: number; decimals: number; arab: boolean } {
  const arab = /[٠-٩]/.test(token);
  let t = token.replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));
  t = t.replace(/[٬,]/g, '').replace(/٫/g, '.');
  const dot = t.indexOf('.');
  return { n: Number(t), decimals: dot >= 0 ? t.length - dot - 1 : 0, arab };
}

/** Renders a pre-formatted amount ("1,250.00 ج.م") with its number counting up. */
export function CountUp({ text }: { text: string }) {
  const m = NUM.exec(text);
  const info = m ? parse(m[0]) : null;
  const target = info && Number.isFinite(info.n) ? info.n : 0;
  const v = useCountUp(target);
  if (!m || !info || !Number.isFinite(info.n)) return <>{text}</>;
  const fmt = new Intl.NumberFormat(info.arab ? 'ar-EG' : 'en-US', {
    minimumFractionDigits: info.decimals,
    maximumFractionDigits: info.decimals,
  }).format(v);
  return (
    <span aria-label={text}>
      {text.slice(0, m.index)}
      {fmt}
      {text.slice((m.index ?? 0) + m[0].length)}
    </span>
  );
}
