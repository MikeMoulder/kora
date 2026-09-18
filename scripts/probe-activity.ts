import { buildActivity } from '../src/lib/account/activity';

const payload = buildActivity([], 'NGN');

console.log('recent rows');
for (const t of payload.transactions) {
  console.log(' ', t.at.slice(0, 16), t.direction, String(t.amount).padStart(10), t.party);
}

for (const range of ['daily', 'weekly', 'yearly'] as const) {
  const s = payload.spend[range];
  const nonZero = s.buckets.filter((b) => b.amount > 0).length;
  console.log(
    `\n${range}: ${s.buckets.length} cols, ${nonZero} non-zero, total ${s.total.toLocaleString()}, peak ${s.peakIndex} (${s.buckets[s.peakIndex].label} ${s.buckets[s.peakIndex].amount.toLocaleString()})`,
  );
  console.log('  first', s.buckets[0].label, '| last', s.buckets[s.buckets.length - 1].label);
}
