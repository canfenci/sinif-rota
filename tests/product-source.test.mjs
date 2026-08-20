import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Sınıf Rota marka metadatasını yayımlar", async () => {
  const layout = await read("app/layout.tsx");
  assert.match(layout, /Sınıf Rota — Hızlı sınıf kontrolü/);
  assert.match(layout, /alt: "Sınıf Rota"/);
  assert.doesNotMatch(layout, /Okul Takip/);
});

test("hızlı kontrol bütün öğrencileri Tam durumuyla başlatır", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /schoolClass\.students\.map\(\(person\) => \[person\.id, "complete"\]\)/);
  assert.match(page, /Kontrolü Kaydet/);
});

test("Gelmedi kayıtları başarı paydasına dahil edilmez", async () => {
  const stats = await read("app/lib/stats.ts");
  assert.match(stats, /considered = complete \+ partial \+ missing/);
  assert.match(stats, /Math\.round\(\(complete \/ considered\) \* 100\)/);
});

test("eski yerel veriler marka değişiminden sonra okunabilir", async () => {
  const storage = await read("app/lib/storage.ts");
  assert.match(storage, /sinif-rota-prototype-v1/);
  assert.match(storage, /okul-takip-prototype-v1/);
});
