import { parseIntent } from '@/lib/intent/gemini';
import { resolveIntent } from '@/lib/intent/resolve';
import { fail, ok, readJson } from '@/lib/api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { text } = await readJson<{ text?: string }>(request);
    if (!text?.trim()) throw new Error('Say what you want to send, and to whom.');
    if (text.length > 500) throw new Error('That is longer than a payment instruction needs to be.');

    const result = await parseIntent(text.trim());
    return ok({ ...result, resolution: resolveIntent(result.intent) });
  } catch (err) {
    return fail(err);
  }
}
