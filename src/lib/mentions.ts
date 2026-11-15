/** @mentions in chats: pure helpers (people come from the conversation's own server list). */
export type MentionPerson = { user_id: string; full_name: string; label?: string | null };

/** Active "@query" just before the caret (after start/space, same line, ≤ 3 words). */
export function mentionQuery(text: string, caret: number): { start: number; q: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([^\n@]{0,40})$/.exec(before);
  if (!m) return null;
  const q = m[2]!;
  if (q.split(" ").length > 3 || q.endsWith("  ")) return null;
  return { start: before.length - q.length - 1, q: q.trim() };
}

const norm = (s: string) => s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();

export function filterPeople(list: MentionPerson[], q: string, selfId?: string) {
  const n = norm(q);
  return list.filter((p) => p.user_id !== selfId && p.full_name && (!n || norm(p.full_name).includes(n))).slice(0, 8);
}

export function insertMention(body: string, at: { start: number }, caret: number, name: string) {
  const ins = `@${name} `;
  return { body: body.slice(0, at.start) + ins + body.slice(caret), caret: at.start + ins.length };
}

/** Split text into plain / mention pieces for the given known names (longest first). */
export function splitMentions(text: string, names: string[]): { t: string; m: boolean }[] {
  const ns = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!ns.length || !text.includes("@")) return [{ t: text, m: false }];
  const esc = ns.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`@(?:${esc.join("|")})`, "g");
  const out: { t: string; m: boolean }[] = [];
  let last = 0;
  for (const x of text.matchAll(re)) {
    if (x.index! > last) out.push({ t: text.slice(last, x.index), m: false });
    out.push({ t: x[0], m: true });
    last = x.index! + x[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), m: false });
  return out;
}
