export const QUESTION_TYPES: Record<string, string> = { single: "اختيار من متعدد", multiple: "اختيارات متعددة", truefalse: "صح أو خطأ", short: "إجابة قصيرة", essay: "مقالي", fill: "إكمال الفراغ", match: "توصيل", numeric: "إجابة عددية", order: "ترتيب" };
export type ExamQuestion = { type: string; prompt: string; points: number; options: string[]; correct: number[]; answer: string };
export const blankQuestion = (): ExamQuestion => ({ type: "single", prompt: "", points: 1, options: ["", "", "", ""], correct: [0], answer: "" });
export const EXAM_DELIVERY = { online: "اختبار إلكتروني", paper: "اختبار ورقي", bubble: "اختبار تظليل" };
export type ExamDelivery = keyof typeof EXAM_DELIVERY;
export type ExamForm = { id: string; questions: ExamQuestion[] };
export function validateQuestions(questions: ExamQuestion[], delivery: ExamDelivery): string | null {
  if (!questions.length) return "أضف سؤالًا واحدًا على الأقل";
  if (delivery === "bubble" && questions.length > 35) return "ورقة التظليل تستوعب 35 سؤالًا كحد أقصى";
  for (const [i, q] of questions.entries()) {
    if (!q.prompt.trim() || !Number.isFinite(q.points) || q.points <= 0) return `أكمل نص ودرجة السؤال ${i + 1}`;
    if (delivery === "bubble" && !["single", "truefalse"].includes(q.type)) return "التظليل يحتاج إجابة واحدة لكل سؤال";
    if (["single", "multiple", "truefalse"].includes(q.type)) {
      if (q.options.length < 2 || q.options.length > 6 || q.options.some(o => !o.trim())) return `أكمل بدائل السؤال ${i + 1}`;
      if (!q.correct.length || new Set(q.correct).size !== q.correct.length || q.correct.some(n => !Number.isInteger(n) || n < 0 || n >= q.options.length) || (q.type !== "multiple" && q.correct.length !== 1)) return `حدد الإجابة الصحيحة للسؤال ${i + 1}`;
    } else if (!q.answer.trim()) return `أكمل الإجابة النموذجية للسؤال ${i + 1}`;
  }
  return null;
}
export function rotateForm(questions: ExamQuestion[], shift: number): ExamQuestion[] {
  return questions.map((_, i) => {
    const q = questions[(i + shift) % questions.length];
    if (!q) return blankQuestion();
    if (!["single", "multiple"].includes(q.type)) return { ...q, options: [...q.options], correct: [...q.correct] };
    return { ...q, options: q.options.map((_, j) => q.options[(j + shift) % q.options.length] ?? ""), correct: q.correct.map(j => (j - shift % q.options.length + q.options.length) % q.options.length) };
  });
}
export function scoreChoices(questions: ExamQuestion[], answers: (number | null)[]) { return questions.reduce((total, q, i) => total + (answers[i] !== null && answers[i] !== undefined && q.correct.length === 1 && q.correct[0] === answers[i] ? q.points : 0), 0); }
export function sheetIdentity(text: string, hw: string, roster: { id: string }[], form?: string) { try { const p = JSON.parse(text); return p.v === 1 && p.hw === hw && (!form || p.form === form) && typeof p.student === "string" && roster.some((r) => r.id === p.student) ? p.student as string : null; } catch { return null; } }
export const BUBBLE_SHEET = { width: 1000, height: 1400, left: 70, right: 930, top: 320, bottom: 1300, firstX: 270, stepX: 110, firstY: 380, stepY: 25, radius: 8 };
export type Point = { x: number; y: number };
/** Dark, disconnected square fiducials surrounding the answer area; QR/header are outside it. */
export function findSheetCorners(image: ImageData): Point[] {
  const { width: w, height: h, data } = image; const mask = new Uint8Array(w * h); const seen = new Uint8Array(w * h); const squares: Point[] = [];
  for (let i = 0; i < mask.length; i++) mask[i] = (data[i * 4] ?? 255) + (data[i * 4 + 1] ?? 255) + (data[i * 4 + 2] ?? 255) < 270 ? 1 : 0;
  for (let i = 0; i < mask.length; i++) { if (!mask[i] || seen[i]) continue; const stack = [i]; seen[i] = 1; let count = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    while (stack.length) { const p = stack.pop(); if (p === undefined) break; const x = p % w, y = Math.floor(p / w); count++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (n >= 0 && mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bw >= w * .014 && bh >= h * .009 && bw < w * .09 && bh < h * .09 && bw / bh > .65 && bw / bh < 1.5 && count / (bw * bh) > .8) squares.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
  }
  // Only fiducials in the lower answer area (the topmost quarter holds identity/QR).
  const candidates = squares.filter((p) => p.y > h * .2); if (candidates.length !== 4) throw new Error("تعذر تحديد علامات الورقة الأربع؛ صوّر الورقة كاملة وبإضاءة واضحة");
  const sorted = candidates.sort((a, b) => a.y - b.y); const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x); const bottom = sorted.slice(2).sort((a, b) => a.x - b.x); return [...top, ...bottom];
}
export function readBubbles(image: ImageData, corners: Point[], questions: ExamQuestion[]): (number | null)[] {
  const [tl, tr, bl, br] = corners; if (!tl || !tr || !bl || !br) throw new Error("علامات الورقة غير مكتملة"); const t = BUBBLE_SHEET;
  return questions.map((q, i) => {
    const densities = q.options.map((_, j) => { const u = (t.firstX + j * t.stepX - t.left) / (t.right - t.left), v = (t.firstY + i * t.stepY - t.top) / (t.bottom - t.top); const x = tl.x * (1-u)*(1-v)+tr.x*u*(1-v)+bl.x*(1-u)*v+br.x*u*v, y = tl.y*(1-u)*(1-v)+tr.y*u*(1-v)+bl.y*(1-u)*v+br.y*u*v;
      const radius = Math.max(2, (tr.x - tl.x) / (t.right - t.left) * 5); let dark = 0, pixels = 0;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) { if (dx*dx+dy*dy>radius*radius) continue; const px = Math.round(x+dx), py = Math.round(y+dy); if(px<0||py<0||px>=image.width||py>=image.height) continue; const n=(py*image.width+px)*4; pixels++; if ((image.data[n] ?? 255)+(image.data[n+1] ?? 255)+(image.data[n+2] ?? 255)<450) dark++; } return pixels ? dark/pixels : 0;
    });
    const marked = densities.map((d,j) => d > .55 ? j : -1).filter((j) => j >= 0); return marked.length === 1 ? marked[0] ?? null : null;
  });
}
/** Readable text for a stored test attempt ({form, answers}); other bodies are returned unchanged. */
export function examAnswersText(body: string): string {
  try {
    const v = JSON.parse(body) as { form?: unknown; answers?: unknown };
    if (typeof v?.form !== "string" || !Array.isArray(v.answers)) return body;
    const one = (a: unknown) => Array.isArray(a) ? (a.length ? a.map((j) => String.fromCharCode(65 + Number(j))).join("، ") : "بدون إجابة") : a === null ? "غير محسومة" : String(a);
    return `النموذج ${v.form}\n` + v.answers.map((a, i) => `${i + 1}: ${one(a)}`).join("\n");
  } catch { return body; }
}
