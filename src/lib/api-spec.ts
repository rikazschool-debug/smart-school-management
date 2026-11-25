/** OpenAPI 3.0 + Postman 2.1 documents generated from the same API catalog the gateway enforces. Never contains a key: auth is a placeholder. */
export type SpecField = { k: string; l: string; s?: boolean; c?: boolean; r?: boolean; u?: boolean };
export type SpecRes = {
  key: string; label: string; area?: string; menu?: string; sub?: string; note?: string; approval?: string; create_mode?: string;
  ops: { read?: boolean; create?: boolean; update?: boolean; cancel?: boolean }; actions?: string[]; fields: SpecField[];
  filters?: string[]; sortable?: string[]; search?: string; date?: string;
};

const ERR = { description: "خطأ", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
const listParams = (r: SpecRes) => [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
  { name: "per_page", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
  { name: "fields", in: "query", description: "حقول مفصولة بفواصل ضمن الحقول الممنوحة للمفتاح", schema: { type: "string" } },
  { name: "school_id", in: "query", schema: { type: "string", format: "uuid" } },
  ...(r.sortable?.length ? [{ name: "sort", in: "query", schema: { type: "string", enum: r.sortable } }, { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } }] : []),
  ...(r.search ? [{ name: "q", in: "query", description: `بحث في ${r.search}`, schema: { type: "string", maxLength: 100 } }] : []),
  ...(r.date ? [{ name: "date_from", in: "query", schema: { type: "string", format: "date" } }, { name: "date_to", in: "query", schema: { type: "string", format: "date" } }] : []),
  ...(r.fields.some((f) => f.k === "updated_at") ? [{ name: "updated_since", in: "query", schema: { type: "string", format: "date-time" } }] : []),
  ...(r.filters ?? []).filter((f) => f !== "school_id").map((f) => ({ name: f, in: "query", schema: { type: "string" } })),
];
const schemaOf = (fields: SpecField[]) => ({ type: "object", properties: Object.fromEntries(fields.map((f) => [f.k, { description: f.l + (f.s ? " (حساس: يُمنح صراحة)" : "") }])) });

export function buildOpenApi(cat: SpecRes[], base: string) {
  const paths: Record<string, Record<string, unknown>> = {
    "/me": { get: { summary: "بيانات المفتاح وصلاحياته", responses: { "200": { description: "نجاح" }, "401": ERR } } },
  };
  for (const r of cat) {
    const tag = [r.area === "central" ? "الإدارة المركزية" : "المدارس", r.menu].filter(Boolean).join(" — ");
    const desc = [r.sub, r.note, r.approval].filter(Boolean).join(" · ");
    const coll: Record<string, unknown> = {};
    const item: Record<string, unknown> = {};
    if (r.ops.read) {
      coll["get"] = { tags: [tag], summary: `قائمة ${r.label}`, description: desc, parameters: listParams(r), responses: { "200": { description: "نجاح", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: `#/components/schemas/${r.key}` } }, meta: { type: "object" } } } } } }, "403": ERR } };
      item["get"] = { tags: [tag], summary: `سجل من ${r.label}`, responses: { "200": { description: "نجاح" }, "404": ERR } };
    }
    if (r.ops.create) {
      const body = r.fields.filter((f) => f.c);
      coll["post"] = { tags: [tag], summary: r.create_mode === "approval" ? `إرسال طلب إلى ${r.label} (ينتظر الاعتماد)` : `إضافة إلى ${r.label}`, description: desc,
        parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { ...schemaOf(body), required: body.filter((f) => f.r).map((f) => f.k) } } } },
        responses: { "201": { description: "أُنشئ" }, "202": { description: "استُلم وينتظر الاعتماد" }, "403": ERR, "422": ERR } };
    }
    if (r.ops.update) item["patch"] = { tags: [tag], summary: `تعديل ${r.label}`, requestBody: { content: { "application/json": { schema: schemaOf([...r.fields.filter((f) => f.u), { k: "rev", l: "رقم النسخة" }]) } } }, responses: { "200": { description: "نجاح" }, "409": ERR } };
    if (Object.keys(coll).length) paths[`/${r.key}`] = coll;
    if (Object.keys(item).length) paths[`/${r.key}/{id}`] = { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], ...item };
    for (const a of r.actions ?? []) paths[`/${r.key}/{id}/${a}`] = { post: { tags: [tag], summary: a === "cancel" ? `إلغاء طلب معلّق في ${r.label}` : a, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "نجاح" }, "409": ERR } } };
  }
  return {
    openapi: "3.0.3",
    info: { title: "Rikaz API", version: "1.0", description: "الحذف غير متاح. مفاتيح rk_test_ تتحقق دون حفظ. كل مفتاح يرى الموارد والحقول الممنوحة له فقط." },
    servers: [{ url: base }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "rk_live_… أو rk_test_…" } },
      schemas: { Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } } }, ...Object.fromEntries(cat.map((r) => [r.key, schemaOf(r.fields)])) },
    },
    paths,
  };
}

export function buildPostman(cat: SpecRes[], base: string) {
  const req = (name: string, method: string, path: string, body?: Record<string, string>) => ({
    name, request: {
      method, url: { raw: `{{base_url}}${path}`, host: ["{{base_url}}"], path: path.split("/").filter(Boolean) },
      header: method === "POST" ? [{ key: "Idempotency-Key", value: "{{$guid}}" }, { key: "Content-Type", value: "application/json" }] : [],
      ...(body ? { body: { mode: "raw", raw: JSON.stringify(body, null, 2) } } : {}),
    },
  });
  const groups = new Map<string, unknown[]>();
  for (const r of cat) {
    const g = `${r.area === "central" ? "الإدارة المركزية" : "المدارس"} — ${r.menu ?? ""}`;
    const items: unknown[] = [];
    if (r.ops.read) { items.push(req(`قائمة ${r.label}`, "GET", `/${r.key}?per_page=25`)); items.push(req(`سجل من ${r.label}`, "GET", `/${r.key}/{{id}}`)); }
    if (r.ops.create) items.push(req(`إضافة: ${r.label}`, "POST", `/${r.key}`, Object.fromEntries(r.fields.filter((f) => f.c).map((f) => [f.k, ""]))));
    for (const a of r.actions ?? []) items.push(req(`${a === "cancel" ? "إلغاء" : a}: ${r.label}`, "POST", `/${r.key}/{{id}}/${a}`));
    groups.set(g, [...(groups.get(g) ?? []), { name: r.label, item: items }]);
  }
  return {
    info: { name: "Rikaz API", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    auth: { type: "bearer", bearer: [{ key: "token", value: "{{api_key}}", type: "string" }] },
    variable: [{ key: "base_url", value: base }, { key: "api_key", value: "" }, { key: "id", value: "" }],
    item: [{ name: "المفتاح", item: [req("بيانات المفتاح", "GET", "/me")] }, ...[...groups.entries()].map(([name, item]) => ({ name, item }))],
  };
}
