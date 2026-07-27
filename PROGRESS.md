# PROGRESS.md — Nhật ký tiến độ dự án

> Đọc file này ĐẦU TIÊN khi bắt đầu một phiên mới. Ghi thêm entry mới lên ĐẦU mục
> "Nhật ký" (không xoá log cũ) sau khi hoàn thành một task, theo quy trình trong `CLAUDE.md`.
> File này được viết lại gọn (2026-07-27) vì bản cũ quá dài (~2500 dòng) gây khó mở trong
> một số editor — bản đầy đủ cũ vẫn còn nguyên trong lịch sử git (`git log -- PROGRESS.md`),
> không mất dữ liệu, chỉ không giữ trong file sống nữa.

## 🔵 Trạng thái hiện tại

- **Phase 0 — Nền tảng**: HOÀN TẤT 100%.
- **Phase 1 — 10 công cụ cốt lõi**: HOÀN TẤT 10/10.
- **Phase 1.5 — Feature Parity 10 công cụ cốt lõi**: HOÀN TẤT 10/10, trừ 1 mục con nhỏ
  chưa làm (nén PDF cho Gộp/Tách PDF — không phải lỗi chặn, chỉ chưa bắt đầu).
- **Phase 2 — SEO & đa ngôn ngữ**: HOÀN TẤT 6/8 mục. 2 mục còn treo (submit sitemap lên
  Google Search Console / Bing Webmaster Tools) bị chặn vì chưa có public domain thật + cần
  đăng nhập thủ công, không phải việc agent tự làm được.
- **Phase 3 — Mở rộng công cụ ngách: 5/10 tool xong** (JWT Decoder, Base64 Encode/Decode,
  Regex Tester, SVG Optimizer, Color Picker & Palette Generator). Task tiếp theo: CSV ↔ JSON
  Converter, JSON → Excel Converter, Markdown Viewer/Editor (đang giao song song cho 3 agent
  — xem log 2026-07-27 bên dưới).
- **Quy ước i18n hiện hành (từ 2026-07-27, theo yêu cầu trực tiếp người dùng)**: các tool
  MỚI trong Phase 3 chỉ cần file dịch `en` + `vi`. Vẫn khai báo đủ slug/tên cho cả 20 ngôn
  ngữ trong `tools.ts` (để routing sẵn sàng), 18 ngôn ngữ còn lại người dùng tự bổ sung sau —
  đây là quyết định chủ động, KHÔNG phải bug fallback âm thầm.

## ⚙️ Ghi chú kỹ thuật quan trọng (áp dụng lâu dài, không phải log)

- **Node.js**: dự án cần Node 22.23.1 (Node hệ thống chỉ là 20.19.0, không đủ cho Astro 7).
  Bản Node đúng nằm sẵn ở `.tools/node-v22.23.1-win-x64/` trong repo — luôn `export PATH`
  trỏ vào đó trước khi chạy `npm`/`node` trong phiên terminal mới.
- **i18n auto-load**: `src/i18n/i18next.ts` dùng `import.meta.glob('./locales/*/*.json', {
  eager: true })` để tự nạp mọi file `{locale}/{namespace}.json` — thêm file JSON tool mới
  KHÔNG cần sửa `i18next.ts`, chỉ cần đặt đúng tên `tool-<id>.json`.
- **Fallback âm thầm khi thiếu file dịch**: nếu 1 locale thiếu file `tool-<id>.json`,
  i18next KHÔNG báo lỗi build — nó tự fallback sang tiếng Anh một cách âm thầm (gặp ở
  `zh-tw` Phase 2, và 7 ngôn ngữ của SVG Optimizer trước khi sửa). Muốn biết chắc 1 ngôn ngữ
  có bản dịch thật hay không, phải mở HTML build ra xem nội dung (`grep '<h1'` trên
  `dist/{locale}/tools/{slug}/index.html`), không chỉ tin vào "build không lỗi".
- **Hydration mismatch với state ngẫu nhiên (React + Astro `client:load`)**: Astro
  pre-render mọi component `client:load` một lần lúc build (chạy trong Node, không có
  `window`/`document`). Nếu `useState(() => ...)` khởi tạo bằng giá trị non-deterministic
  (`Math.random()`, `Date.now()`...), HTML server-render và lúc client hydrate sẽ lệch nhau
  → lỗi console "Minified React error #418" (hydration mismatch), phát hiện được qua
  `page.on('pageerror', ...)` khi test Puppeteer, KHÔNG thấy được chỉ bằng đọc code tĩnh.
  Cách sửa: khởi tạo state bằng giá trị cố định, random hóa thật trong `useEffect` chạy sau
  mount (gặp ở Color Picker, tool ngẫu nhiên hóa bảng màu ban đầu).
- **Thư viện vanilla-JS chạm global browser-only ở module scope** (`self`/`window`/
  `document` ngay khi import tĩnh) sẽ crash `npm run build` vì lý do tương tự ở trên (gặp ở
  `jsoneditor`, tool #8). Sửa bằng `await import(...)` động bên trong `useEffect` thay vì
  `import` tĩnh đầu file.
- **Kiến trúc trang tool**: `src/pages/[locale]/tools/[slug].astro` rẽ nhánh theo `toolId`
  (so sánh chuỗi) sang component riêng `src/components/tools/<Ten>Page.astro`. Tool mới =
  thêm 1 nhánh mới, KHÔNG sửa nhánh tool đã xong.
- **i18n namespace**: mỗi tool có file riêng `src/i18n/locales/{lang}/tool-<id>.json`, gọi
  bằng `getFixedT(lang, 'tool-<id>')`.
- **`@imgly/background-removal`** cần cài thêm `onnxruntime-web` thủ công (peerDependency,
  npm không tự cài) — nếu thiếu, build lỗi "Rolldown failed to resolve import
  onnxruntime-web/webgpu".
- **Deploy**: repo tại GitHub `DDM123455/devhub`, nhánh `main`. Deploy qua Cloudflare Git
  integration (Workers static assets) tại `https://devhub.duongdangmanh01.workers.dev`, tự
  deploy mỗi lần push `main`, không cần GitHub Actions/wrangler riêng trong repo.
- **URL routing**: `/{lang}/...` cho MỌI ngôn ngữ kể cả `en` (`prefixDefaultLocale: true`).
  `src/pages/index.astro` phải luôn tồn tại (dù rỗng) để Astro sinh redirect `/` → `/en/`,
  xoá file này sẽ lỗi `MissingIndexForInternationalizationError`.
- **Layout dùng chung**: `Header`/`Sidebar`/`Footer` ở `src/components/layout/`, tự nhận
  `lang` + tự gọi `getFixedT` — mọi trang bọc trong `Layout.astro` tự động có đủ 3 phần,
  không cần import lại thủ công.
- **Test tương tác**: dùng Puppeteer (không phải dependency chính thức của repo, chạy qua
  bản cài sẵn trong npx cache của máy). Luôn `npm run build` + `npm run preview` rồi test
  trên bundle production thật, không test trên dev server.

## Nhật ký (mới nhất ở trên cùng, rút gọn)

- **2026-07-27** — SVG Optimizer (Phase 3 #4) và Color Picker & Palette Generator
  (Phase 3 #5) hoàn tất, mỗi tool đã build sạch + test Puppeteer tương tác + commit riêng.
  Color Picker phát hiện & sửa bug hydration mismatch (xem ghi chú kỹ thuật ở trên). Từ tool
  này trở đi chỉ làm i18n `en`/`vi` theo yêu cầu người dùng.
- **2026-07-26** — Phase 3 #1–3 (JWT Decoder, Base64 Encode/Decode, Regex Tester) hoàn tất.
  Regex Tester từng bị gián đoạn giữa chừng ở 1 phiên trước, đã hoàn tất dứt điểm ở phiên
  sau đó (kèm sửa 1 bug logic thật: highlight sai vị trí với match độ dài 0, ví dụ pattern
  `\b` hoặc `x*`).
- **2026-07-26** — Mở rộng i18n từ 8 lên 20 ngôn ngữ, viết lại meta title/description SEO,
  soát JSON-LD, viết nội dung SEO 300–500 từ/tool/ngôn ngữ, dựng internal linking map, audit
  Core Web Vitals toàn site (Phase 2, 6/8 mục — 2 mục submit sitemap còn treo vì thiếu domain
  thật). Phát hiện & sửa 1 bug hạ tầng thật: thiếu `lowerCaseLng: true` khiến toàn bộ trang
  `zh-tw` render nhầm sang nội dung `zh`.
- **2026-07-25** — QA audit toàn site theo yêu cầu trực tiếp người dùng (không phải task
  ROADMAP): kiểm tra layout dùng chung + cả 10 tool + responsive/dark mode. Tìm và sửa 9
  bug/gap thật (1 Critical, còn lại High/Medium), mỗi phần build + test Puppeteer + commit
  riêng.
- **2026-07-25** — Redesign giao diện toàn site theo yêu cầu trực tiếp người dùng (không
  phải task ROADMAP): font Space Grotesk + JetBrains Mono tự host, bảng màu emerald đạt
  WCAG AA, privacy bar, sidebar badge hue-rotate, trang chủ có tìm kiếm lọc tool bằng JS
  thuần.
- **2026-07-24 → 2026-07-25** — Phase 1 (10 công cụ cốt lõi) và Phase 1.5 (nâng cấp feature
  parity so với đối thủ đầu ngành mỗi tool) hoàn tất. Tool #8 (JSON Formatter) chọn
  `jsoneditor` bản minimalist thay vì Monaco (nhẹ hơn, đủ dùng). Còn treo: nén PDF cho
  Gộp/Tách PDF (chưa làm, không phải lỗi chặn).
- **Trước đó** — Phase 0: khởi tạo Astro + Tailwind + Shadcn/UI, đổi từ `astro-i18next`
  sang i18n routing native + i18next thuần, dựng layout chung, sitemap/robots.txt, CI/CD
  Cloudflare Pages.

> Muốn xem chi tiết đầy đủ (từng bug, từng bước test, từng quyết định nhỏ) của bất kỳ mốc
> nào ở trên: `git log --oneline -- PROGRESS.md` rồi `git show <commit>:PROGRESS.md` để lấy
> lại bản đầy đủ tại thời điểm đó.
