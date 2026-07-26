# PROGRESS.md — Nhật ký tiến độ dự án

> Đọc file này ĐẦU TIÊN khi bắt đầu một phiên mới. Ghi thêm một mục MỚI lên ĐẦU file
> (không xoá log cũ) ngay sau khi hoàn thành một task theo quy trình trong `CLAUDE.md`.

## 🔵 Trạng thái hiện tại

- Phase đang làm: **Phase 3 — Mở rộng công cụ ngách: 2/10 tool xong (JWT Decoder,
  Base64 Encode/Decode — cả hai 2026-07-26)** ✅ — xem log chi tiết bên dưới. Theo yêu
  cầu trực tiếp của người dùng, Phase 3 được làm TRƯỚC khi hoàn tất nốt các mục còn lại
  của Phase 2 (meta/description tối ưu SEO, nội dung SEO 300–500 từ cho 10 tool cũ,
  internal linking map, Core Web Vitals — vẫn còn treo, xem `ROADMAP.md`). Task tiếp
  theo trong Phase 3: Regex Tester.
- **Phase 1 — 10 công cụ cốt lõi: HOÀN TẤT 10/10** ✅. **Phase 1.5 — Rà soát & Nâng cấp
  Feature Parity: HOÀN TẤT 10/10 tool** ✅ (tool #10 "Chuyển đổi Case văn bản" vừa xong —
  xem log bên dưới), CHỈ CÒN treo lại đúng 1 mục con nhỏ: nén PDF cho tool #4/#5 (chưa
  làm, không phải lỗi chặn, xem log 2026-07-25 "Gộp/Tách PDF" bên dưới).
- **QA audit toàn site: HOÀN TẤT (2026-07-25)**, theo yêu cầu trực tiếp của người dùng
  (không phải task trong ROADMAP — đóng vai Senior QA/Frontend/UI-UX kiểm tra lại toàn bộ
  chức năng + UI/UX của cả 10 tool + layout dùng chung + responsive/dark mode trước khi coi
  dự án "hoàn thành"). Đã audit đủ: layout dùng chung, cả 10/10 tool, và responsive/dark mode
  sweep toàn site (mobile 375px + tablet 768px cho cả 10 trang tool, dark mode spot-check).
  Tổng cộng tìm và sửa **9 bug/gap thật** (1 Critical, phần còn lại High/Medium), tất cả đã
  build + test tương tác Puppeteer xác nhận + commit riêng theo từng phần — xem log chi tiết
  bên dưới cho từng tool. 2 tool (Đếm từ & ký tự, JSON Formatter) và Text Case Converter đều
  SẠCH ngay từ đầu, không cần sửa gì. Báo cáo tổng kết dạng bảng đã gửi cho người dùng trong
  chính phiên chat này (không lưu file riêng, xem lại lịch sử chat nếu cần).
- **Phase 2, task đầu tiên "Mở rộng i18n từ 8 lên 20 ngôn ngữ": HOÀN TẤT (2026-07-26)** ✅ —
  xem log chi tiết bên dưới. Cả 12 ngôn ngữ mới (zh, zh-tw, it, ru, nl, pl, tr, id, ar, hi,
  th, sv) đã có đủ 10/10 file `tool-*.json`, `npm run build` chạy sạch 221 trang. Trong lúc
  verify đã phát hiện và sửa 1 bug hạ tầng THẬT (không phải do phiên này gây ra, có từ lúc
  làm hạ tầng trước đó): thiếu `lowerCaseLng: true` trong cấu hình `i18next.init()` khiến
  TOÀN BỘ trang `zh-tw` (Phồn thể) render nhầm sang nội dung `zh` (Giản thể) một cách âm
  thầm (không lỗi, không fallback tiếng Anh dễ nhận ra) — xem chi tiết kỹ thuật trong log
  bên dưới.
- Task tiếp theo: các mục còn lại của Phase 2 (viết meta/description tối ưu SEO cho từng
  ngôn ngữ, soát schema JSON-LD, nội dung SEO 300–500 từ, internal linking, Core Web
  Vitals). Có thể tranh thủ làm nốt mục nén PDF còn treo của Phase 1.5 nếu người dùng muốn
  dứt điểm Phase 1.5 100% trước, nhưng không bắt buộc.
- Ghi chú thiết kế (2026-07-25): đã redesign toàn bộ giao diện site (không phải task trong
  `ROADMAP.md`, làm theo yêu cầu trực tiếp của người dùng) dựa trên file mockup
  `Web Tool Hub.dc.html` ở gốc repo (file KHÔNG được commit vào git — chỉ là tài liệu tham
  khảo thiết kế, dùng 1 template engine riêng "x-dc" không liên quan tới Astro/Tailwind
  của dự án, không xoá vì có thể còn cần tham khảo sau). Đã áp dụng: font Space Grotesk
  (chữ chính) + JetBrains Mono (số liệu/badge/logo mark) tự host qua `@fontsource-variable`
  (gỡ Geist cũ), bảng màu accent emerald (`#047857` cho nền đặc/nút — đã tối hơn màu gốc
  `#10B981` trong mockup để đạt contrast ratio ≥4.5:1 theo WCAG AA, xem chi tiết trong log
  bên dưới), thanh privacy bar tối màu riêng biệt với theme, sidebar có badge chữ viết tắt
  theo màu xoay hue (`hue-rotate`) + đếm số tool, trang chủ có ô tìm kiếm lọc tool trực
  tiếp bằng JS thuần (không React), hero + stat chip, grid card danh mục. Áp dụng đồng bộ
  cho TOÀN BỘ site qua `Layout.astro`/`Header`/`Sidebar`/`Footer`/`PrivacyBanner` dùng
  chung nên cả 10 trang tool tự động thừa hưởng, không cần sửa riêng từng trang.
- Ghi chú dependency: đã chọn **jsoneditor** (không phải Monaco) cho tool #8 — nhẹ hơn
  nhiều, phù hợp triết lý Lighthouse/hiệu năng của dự án. Dùng bản **minimalist**
  (`jsoneditor/dist/jsoneditor-minimalist.js`, ~70KB gzip thay vì ~210KB bản đầy đủ) vì
  không cần chế độ `code` (Ace editor) hay JSON Schema validation (ajv) — chỉ dùng 2 chế
  độ `text`/`tree` đã đủ cho "Formatter & Validator". Có file khai báo type riêng
  `src/types/jsoneditor-minimalist.d.ts` (tái dùng type từ `@types/jsoneditor` vì package
  gốc không export type cho subpath `dist/jsoneditor-minimalist.js`).
- Ghi chú kỹ thuật (từ tool #8): thư viện vanilla-JS nào chạm vào global browser-only
  (`self`, `window`, `document`) ngay ở module scope SẼ LÀM CRASH `npm run build` (không
  chỉ warning) vì Astro SSR-render component `client:load` một lần trong lúc build để sinh
  HTML tĩnh, và bước đó chạy trong Node — không có các global đó. Cách sửa chuẩn: nạp thư
  viện bằng `await import(...)` (dynamic import) BÊN TRONG `useEffect` thay vì `import`
  tĩnh ở đầu file, vì effect không chạy trong lượt SSR của React. Nhớ áp dụng cho mọi thư
  viện non-React tương tự ở các tool sau nếu có.
- Ghi chú kiến trúc tool page: `src/pages/[locale]/tools/[slug].astro` giờ rẽ nhánh theo
  `toolId` — nếu là tool đã có UI thật thì render component riêng
  (`src/components/tools/<Ten>Page.astro`), còn lại vẫn rơi vào nhánh "coming soon" mặc
  định. Khi làm tool mới, thêm 1 nhánh `toolId === '<id-trong-tools.ts>'` mới tương tự,
  KHÔNG sửa các nhánh tool đã xong.
- Ghi chú i18n: mỗi tool có file dictionary namespace RIÊNG
  (`src/i18n/locales/{lang}/tool-<id>.json`). **`src/i18n/i18next.ts` đã refactor dùng
  `import.meta.glob('./locales/*/*.json', { eager: true })` để tự động nạp MỌI file JSON
  trong `src/i18n/locales/` theo đúng `{locale}/{namespace}.json`** — thêm file JSON tool
  mới KHÔNG cần sửa `i18next.ts` nữa, chỉ cần tạo đủ 8 file theo đúng tên
  `tool-<id>.json` và gọi `getFixedT(lang, 'tool-<id>')`.
- Ghi chú dependency AI: `@imgly/background-removal` có `onnxruntime-web` là
  **peerDependency** — npm KHÔNG tự cài kèm, phải `npm install onnxruntime-web@<version
  khớp>` thủ công, nếu không `npm run build` sẽ lỗi
  `Rolldown failed to resolve import "onnxruntime-web/webgpu"`.
- Ghi chú repo/deploy: repo đã push lên GitHub tại `DDM123455/devhub`
  (`https://github.com/DDM123455/devhub`), nhánh mặc định `main`. Deploy qua Cloudflare
  Git integration (Workers static assets, không phải `*.pages.dev` cổ điển) — domain thật:
  `https://devhub.duongdangmanh01.workers.dev` (đã cập nhật vào `astro.config.mjs`
  (`site`) và `public/robots.txt`). Mỗi lần push lên `main` sẽ tự deploy, không cần GitHub
  Actions/wrangler trong repo.
- Ghi chú đặc biệt: dự án dùng Node.js 22.23.1 độc lập trong `.tools/` (xem log bên dưới),
  không phải Node hệ thống (20.19.0). Luôn `export PATH` trỏ vào
  `.tools/node-v22.23.1-win-x64` trước khi chạy `npm`/`node` trong phiên terminal mới.
- Ghi chú i18n: cấu trúc URL đang là `/{lang}/...` cho MỌI ngôn ngữ kể cả `en`
  (`i18n.routing.prefixDefaultLocale: true` trong `astro.config.mjs`). Trang chủ hiện là
  route động `src/pages/[locale]/index.astro` (dùng `getStaticPaths()` sinh 8 trang), KHÔNG
  phải 8 thư mục vật lý — giữ nguyên pattern này cho các trang công cụ ở Phase 1
  (`[locale]/tools/[slug].astro`). `src/pages/index.astro` vẫn phải tồn tại (dù rỗng) vì
  Astro cần một trang index gốc để tự thay bằng redirect `/` → `/en/` lúc build — xoá file
  này sẽ làm `npm run build` lỗi `MissingIndexForInternationalizationError`.
- Ghi chú layout: `Header`/`Sidebar`/`Footer` nằm ở `src/components/layout/`, đều nhận
  prop `lang: Locale` và tự gọi `getFixedT(lang)` bên trong — mọi trang mới bọc trong
  `Layout.astro` sẽ tự động có đủ 3 phần này, không cần import lại thủ công.
- Ghi chú URL công cụ: danh sách 10 công cụ Phase 1 (id, category, slug + tên hiển thị cho
  cả 8 ngôn ngữ) đã được định nghĩa trước trong `src/data/tools.ts` — khi làm từng tool ở
  Phase 1, chỉ cần thay nội dung placeholder trong
  `src/pages/[locale]/tools/[slug].astro` bằng UI thật cho đúng `toolId`, KHÔNG cần tạo lại
  route hay nghĩ lại slug (trừ khi phát hiện slug đã chọn chưa tối ưu SEO, thì sửa trực tiếp
  trong `tools.ts`, mọi link liên quan tự cập nhật theo vì đều build từ cùng 1 nguồn).

---

## Nhật ký (mới nhất ở trên cùng)

### 2026-07-26 — Phase 3, tool #2: Base64 Encode/Decode — HOÀN TẤT
- Task kế tiếp trong Phase 3 sau JWT Decoder. Benchmark đối thủ: **base64.guru**,
  **freeformatter.com/base64-encoder.html** — cả hai đều hỗ trợ mã hóa/giải mã văn bản
  VÀ file, xem trước ảnh, biến thể URL-safe.
- **100% client-side, không thêm dependency mới**: chỉ dùng API có sẵn của trình duyệt
  — `btoa`/`atob`, `TextEncoder`/`TextDecoder` (đảm bảo UTF-8 đa byte round-trip đúng,
  không chỉ ASCII thuần), và `FileReader.readAsDataURL` cho việc đọc file cục bộ (file
  vài MB không rời khỏi máy chỉ để xem dạng Base64).
- **Tính năng đã làm** (`src/components/tools/Base64Tool.tsx`), theo đúng nguyên tắc
  Feature Parity — không dừng ở bản MVP tối giản:
  - Tab "Văn bản": mã hóa/giải mã trực tiếp khi gõ, tùy chọn bảng chữ cái an toàn cho
    URL (`-`/`_` thay `+`/`/`, bỏ đệm `=`), tùy chọn xuống dòng mỗi 76 ký tự (chuẩn
    MIME), nút hoán đổi đầu vào/kết quả kèm đổi chế độ, hiển thị số ký tự đầu
    vào/đầu ra.
  - Tab "File": kéo-thả hoặc chọn file để mã hóa — trả về cả chuỗi Base64 thô lẫn
    `data:` URI dùng ngay được trong `<img src>`/CSS, tự động xem trước nếu là ảnh.
    Chiều ngược lại: dán Base64 hoặc data URI đầy đủ, tự nhận diện MIME type từ data
    URI (hoặc cho nhập tay), xem trước ảnh, tải file xuống với tên tự đặt.
  - Báo lỗi rõ ràng khi chuỗi Base64 không hợp lệ, thay vì crash hoặc trả về rác.
- Đăng ký tool (`id: 'base64-tool'`, `category: 'dev'`) vào `src/data/tools.ts` với đủ
  slug/tên 20 ngôn ngữ, thêm nhánh routing, tạo `Base64ToolPage.astro` theo đúng pattern
  đã dùng cho JWT Decoder.
- **Nội dung i18n cho 20 ngôn ngữ** (`tool-base64.json`, 40 key/file gồm `meta`, `ui.*`
  có 2 placeholder `{{input}}`/`{{output}}` trong `sizeInfo`, `related`,
  `article.heading`+`p1`-`p4`): tự viết `en`/`vi`, 18 ngôn ngữ còn lại giao song song
  cho 18 agent con (đúng tiền lệ JWT Decoder), có nhắc rõ giữ nguyên placeholder
  `{{input}}`/`{{output}}` và tên file ví dụ `file.bin`.
- **Verify độc lập**: script Node so sánh key-set (100% khớp cho cả 20 file), xác nhận
  2 placeholder `{{input}}`/`{{output}}` còn nguyên trong `sizeInfo` của MỌI ngôn ngữ,
  quét toàn bộ tìm HTML entity bị escape nhầm (không có — một agent con nhắc tới
  `&lt;img src&gt;` trong báo cáo text nhưng chỉ là cách mô tả, không phải nội dung JSON
  thật, đã xác nhận bằng script).
- **Test logic độc lập bằng Node** (mô phỏng lại đúng hàm trong component): round-trip
  UTF-8 (emoji + tiếng Việt có dấu + tiếng Nhật) mã hóa rồi giải mã khớp 100% văn bản
  gốc, biến thể URL-safe không còn ký tự `+`/`/`, chuỗi Base64 sai bị từ chối đúng cách,
  vector đã biết (`"Hello"` → `SGVsbG8=`) khớp chuẩn.
- **Build cuối cùng xác nhận sạch**: `npm run build` ra đúng 261 trang tĩnh (tăng từ 241
  lên 261 = thêm đúng 1 tool × 20 ngôn ngữ), không lỗi. Kiểm tra thủ công HTML build ra
  cho en/vi: `<h1>` đúng, schema JSON-LD có mặt, link tới JWT Decoder trong related
  tools hiển thị đúng (cùng category `dev`).
- Đã tick checkbox "Base64 Encode/Decode" trong `ROADMAP.md` (Phase 3).

### 2026-07-26 — Phase 3, tool #1: JWT Decoder — HOÀN TẤT
- Theo yêu cầu người dùng, bắt đầu Phase 3 trước khi làm nốt các mục còn lại của Phase 2.
  Task đầu tiên chưa tick trong Phase 3 là **JWT Decoder** (benchmark đối thủ: **jwt.io**,
  **jwt.ms**) — đúng quy trình Feature Parity trong `CLAUDE.md`.
- **100% client-side, không thêm dependency mới**: decode/verify/ký lại JWT chỉ dùng
  Web Crypto API (`crypto.subtle`) có sẵn trong mọi trình duyệt hiện đại — xác nhận từ
  đầu bằng cách đọc `package.json`, không có thư viện JWT nào trong danh sách dependency
  nên không cần xin thêm.
- **Tính năng đã làm** (`src/components/tools/JwtDecoder.tsx`):
  - Decode header/payload từ token dán vào, báo lỗi rõ ràng cho 3 trường hợp: sai định
    dạng (không đủ 3 phần cách nhau bởi dấu chấm), Base64URL không hợp lệ, JSON không
    hợp lệ sau khi giải mã.
  - Đọc các claim chuẩn `exp`/`iat`/`nbf`, hiển thị dạng ngày giờ dễ đọc, có badge "Đã
    hết hạn" nếu `exp` đã qua.
  - Kiểm tra chữ ký: HS256/384/512 (nhập secret) và RS256/384/512 (dán public key PEM
    SPKI) — dùng `crypto.subtle.importKey`/`verify`. Các thuật toán khác (ES256, `none`)
    vẫn giải mã bình thường nhưng báo rõ "chưa hỗ trợ kiểm tra chữ ký" thay vì giả vờ hỗ
    trợ (đúng nguyên tắc trong `CLAUDE.md` về việc nêu rõ giới hạn kỹ thuật).
  - Chỉnh sửa header/payload rồi ký lại token bằng secret HS* — tính năng tương đương
    "Edit & re-sign" của jwt.io, hữu ích khi dev cần test logic phân quyền cục bộ.
  - Nút copy cho từng khối, nút "Load sample token" dùng token mẫu công khai của jwt.io.
- **Đăng ký tool mới**: thêm entry `id: 'jwt-decoder'`, `category: 'dev'` vào
  `src/data/tools.ts` với đủ slug/tên bản địa hóa cho 20 ngôn ngữ; thêm nhánh routing
  trong `src/pages/[locale]/tools/[slug].astro`; tạo `JwtDecoderPage.astro` theo đúng
  pattern của `JsonFormatterPage.astro` (schema JSON-LD `WebApplication` giá 0 USD,
  section article, related tools cùng category `dev`).
- **Lưu ý kỹ thuật khi sửa `tools.ts` bằng Edit tool**: công cụ Edit liên tục báo "String
  to replace not found" dù `old_string` nhìn giống hệt nội dung file (kể cả copy trực
  tiếp từ kết quả Read) — nghi do lệch khoảng trắng/tab hoặc chuẩn hoá Unicode khi gõ lại
  các dòng chứa ký tự đa ngôn ngữ (ả Rập, Thái, có dấu). Cách né: chèn bằng script Node
  (`fs.readFileSync`/`lastIndexOf('];\n')`/`writeFileSync`) thay vì Edit tool khi cần
  chèn khối text dài có nhiều ký tự Unicode ở gần đó.
- **Nội dung i18n cho 20 ngôn ngữ** (`src/i18n/locales/{lang}/tool-jwt-decoder.json`,
  51 key mỗi file gồm `meta`, `ui.*`, `related`, `article.heading`+`p1`-`p4` ~300-500
  từ): tự viết trực tiếp `en` và `vi`; 18 ngôn ngữ còn lại (es, pt, fr, de, ja, ko, zh,
  zh-tw, it, ru, nl, pl, tr, id, ar, hi, th, sv) giao cho 18 agent con chạy song song
  (mỗi agent phụ trách đúng 1 ngôn ngữ để giữ nhất quán văn phong, theo đúng tiền lệ đã
  dùng ở Phase 2), có nhắc rõ giữ nguyên các thuật ngữ kỹ thuật không dịch (JWT, HS256,
  RS256, PEM, SPKI, Base64URL, SubtleCrypto, tên claim `exp`/`iat`/`nbf`...).
- **Verify độc lập** (không chỉ tin báo cáo của agent con): viết script Node so sánh
  key-set giữa từng file locale với bản `en` gốc cho cả 20 file — khớp 100%, không thiếu/
  thừa key; đồng thời quét toàn bộ nội dung tìm HTML entity bị escape nhầm (`&amp;` v.v.)
  vì một agent con có nhắc tới ký tự này trong báo cáo — xác nhận không có, chỉ là cách
  agent đó mô tả trong text báo cáo chứ không phải trong JSON thật.
- **Test logic mã hoá độc lập với JS thuần** (không chỉ dựa vào build sạch): viết script
  Node dùng `crypto.subtle` (Node 22 hỗ trợ Web Crypto API y hệt trình duyệt) mô phỏng lại
  chính xác các hàm trong `JwtDecoder.tsx` — xác nhận: decode đúng header/payload token
  mẫu jwt.io, verify HS256 đúng secret → `true`, verify sai secret → `false`, phát hiện
  đúng token hết hạn (`exp` quá khứ), sửa payload rồi ký lại verify lại vẫn đúng, token
  sai định dạng bị từ chối đúng cách thay vì crash.
- **Build cuối cùng xác nhận sạch**: `npm run build` (Node 22.23.1 trong `.tools/`) ra
  đúng 241 trang tĩnh (tăng từ 221 lên 241 = thêm đúng 1 tool × 20 ngôn ngữ + 20 trang
  chủ không đổi), không lỗi. Kiểm tra thủ công output HTML của 4 locale (en, vi, zh-tw,
  de) xác nhận `<h1>` đúng ngôn ngữ, schema JSON-LD có mặt, section article + related
  tools render đúng.
- Đã tick checkbox "JWT Decoder" trong `ROADMAP.md` (Phase 3).
- **Giới hạn kỹ thuật đã ghi rõ cho người dùng trong UI** (không phải lỗi, là quyết định
  có chủ đích): không hỗ trợ verify cho ES256/ES384/ES512 (ECDSA) hay `none` — chỉ
  HS256/384/512 và RS256/384/512. Có thể bổ sung ECDSA sau nếu có yêu cầu (Web Crypto
  API cũng hỗ trợ `ECDSA` nên khả thi kỹ thuật, chỉ là chưa làm trong lượt này).

### 2026-07-26 — Phase 2: Mở rộng i18n lên 20 ngôn ngữ — HOÀN TẤT (nội dung dịch nốt +
  phát hiện/sửa 1 bug hạ tầng)
- **Viết nốt toàn bộ nội dung dịch còn thiếu** từ phiên trước: 5 file còn lại của `it`, và
  đủ 10/10 file `tool-*.json` cho 11 ngôn ngữ còn lại (`nl, pl, sv, tr, id, zh, zh-tw, ru,
  ar, hi, th`) — tổng cộng 115 file JSON mới, viết tự nhiên riêng cho từng ngôn ngữ (không
  dịch máy nguyên khối), đúng cấu trúc key của bản `en` gốc. `it` do tự viết trực tiếp (khối
  lượng nhỏ, 5 file); 11 ngôn ngữ còn lại chia cho các agent con chạy song song theo 3 đợt
  (5+3+3 ngôn ngữ), mỗi agent phụ trách trọn 1 ngôn ngữ để giữ nhất quán văn phong trong
  cùng 1 ngôn ngữ.
- **Verify độc lập** (không chỉ tin báo cáo của agent con): viết script Node so sánh key-set
  + tập hợp placeholder `{{...}}` giữa từng file mới và bản `en` tương ứng cho toàn bộ 120
  file (12 ngôn ngữ × 10 tool) — xác nhận khớp 100%, không thiếu/thừa key, không
  thiếu/sai placeholder.
- **Phát hiện 1 bug hạ tầng THẬT trong lúc verify build** (không phải lỗi do phiên này viết
  ra, có sẵn từ lúc làm hạ tầng i18n trước đó, chỉ lộ ra khi có đủ nội dung `zh-tw` để so
  sánh): `src/i18n/i18next.ts` gọi `i18next.init()` KHÔNG có `lowerCaseLng: true`. Theo mặc
  định, `i18next.services.languageUtils.toResolveHierarchy('zh-tw')` trả về
  `['zh-TW', 'zh', 'en']` — tức là thư viện tự viết hoa phần vùng miền (`zh-TW`) để tra cứu
  trước, nhưng `resources` của dự án lưu theo đúng tên thư mục chữ thường `zh-tw` (khớp
  với slug URL `/zh-tw/`) nên không tìm thấy khoá `zh-TW`, ÂM THẦM rơi xuống bước fallback
  kế tiếp là `zh` (Giản thể) — không có lỗi, không phải fallback tiếng Anh dễ nhận ra, nên
  rất khó phát hiện bằng mắt thường hoặc bằng `npm run build` (build vẫn "sạch" vì `zh` có
  nội dung hợp lệ). Chỉ lộ ra khi so sánh trực tiếp nội dung trang `zh-tw` build ra với nội
  dung file nguồn `zh-tw/*.json` tương ứng (phát hiện qua việc chữ trong `<h1>` là Giản thể
  "图片压缩" thay vì Phồn thể "壓縮圖片" dù file JSON nguồn đã đúng). Xác nhận nguyên nhân
  bằng cách gọi trực tiếp `i18next.services.languageUtils.toResolveHierarchy()` trong script
  Node độc lập tái hiện chính xác hành vi. **Đã sửa** bằng cách thêm `lowerCaseLng: true`
  vào config `i18next.init()` — xác nhận lại bằng cùng script: hierarchy đổi thành
  `['zh-tw', 'zh', 'en']`, khớp đúng khoá resources chữ thường của dự án. Rebuild lại xác
  nhận trang `zh-tw` giờ hiển thị đúng nội dung Phồn thể riêng, khác `zh` (Giản thể) — ví dụ
  title trang chủ `zh-tw`: "Web Tool Hub — 免費線上工具集" vs `zh`: "Web Tool Hub — 免费在线
  工具集". Bug này chỉ ảnh hưởng `zh-tw` vì đây là locale DUY NHẤT trong 20 locale có mã có
  dấu gạch nối vùng miền (region subtag) — không ảnh hưởng 19 locale còn lại.
- **Build cuối cùng xác nhận sạch**: `npm run build` (dùng Node 22.23.1 trong `.tools/`,
  không phải Node hệ thống 20.19.0) ra đúng 221 trang tĩnh (20 ngôn ngữ × (10 tool + trang
  chủ) + 1 root index), không lỗi.
- Đã tick checkbox "Mở rộng i18n từ 8 lên 15–20 ngôn ngữ" trong `ROADMAP.md`.
- **CHƯA commit** phần việc của phiên này (115 file JSON dịch mới + fix `i18next.ts` +
  `ROADMAP.md` + mục log này) tại thời điểm ghi log — sẽ commit ngay sau khi ghi xong log
  này, cùng 1 commit với message bắt đầu `feat(i18n):`. Commit trước đó của phiên hạ tầng
  (message cũng bắt đầu `feat(i18n):`, chứa hạ tầng + `common.json` × 12 + 5 file `it`) vẫn
  **CHƯA push lên `origin/main`** tính đến lúc này.

### 2026-07-25 — Phase 2 (ĐANG LÀM DỞ, TẠM DỪNG theo yêu cầu người dùng): Mở rộng i18n lên
  20 ngôn ngữ — hạ tầng XONG 100%, nội dung dịch còn dở
- **Quyết định đã chốt với người dùng** (hỏi qua `AskUserQuestion`, không tự đoán): thêm
  đúng **12 ngôn ngữ mới** để đạt tổng 20 (8 cũ + 12 mới), làm tuần tự tất cả không dừng lại
  hỏi giữa chừng. 12 ngôn ngữ mới, mã locale chính xác đã dùng trong code:
  `zh` (Trung giản thể), `zh-tw` (Trung phồn thể), `it` (Ý), `ru` (Nga), `nl` (Hà Lan),
  `pl` (Ba Lan), `tr` (Thổ Nhĩ Kỳ), `id` (Indonesia), `ar` (Ả Rập — RTL), `hi` (Hindi),
  `th` (Thái), `sv` (Thụy Điển).
- **HẠ TẦNG — ĐÃ XONG HOÀN TOÀN, không cần động vào lại**:
  - `src/i18n/config.ts`: mảng `locales` đã có đủ 20 mã (thứ tự: 8 cũ trước, 12 mã mới theo
    đúng thứ tự liệt kê ở trên). Thêm mới `export const rtlLocales: ReadonlySet<Locale> =
    new Set(['ar'])` để đánh dấu ngôn ngữ viết phải-sang-trái.
  - `src/layouts/Layout.astro`: đã thêm `const dir = rtlLocales.has(lang) ? 'rtl' : 'ltr'`
    và `<html lang={lang} dir={dir}>` — CHỈ set thuộc tính `dir` (đổi hướng chữ/canh lề mặc
    định của trình duyệt), CHƯA làm mirror toàn bộ layout (icon mũi tên, margin trái/phải
    trong Sidebar/Header vẫn cố định vật lý, không tự lật theo RTL) — đây là quyết định có
    chủ đích đã nói rõ với người dùng khi hỏi (họ đã chọn phương án "đủ 20 ngôn ngữ" biết
    trước chi phí kỹ thuật này), COI LÀ ĐỦ cho Phase 2, có thể nâng cấp mirror layout đầy đủ
    ở một lượt UI polish riêng sau này nếu cần, KHÔNG phải việc phải làm ngay.
  - `src/components/layout/LanguageSwitcher.astro`: `nativeNames` đã có đủ 20 mục (tên bản
    ngữ hiển thị trong dropdown chọn ngôn ngữ).
  - `src/data/tools.ts`: CẢ 10 tool đã có đủ `slugs`/`names` cho toàn bộ 20 locale (đã viết
    script Node kiểm tra tự động xác nhận: đúng 200 slug — 10 tool × 20 ngôn ngữ — KHÔNG
    trùng nhau trong cùng 1 ngôn ngữ, KHÔNG thiếu mã nào; script kiểm tra này không được lưu
    lại, nếu cần soát lại chỉ cần viết lại nhanh 1 script tương tự đọc `tools.ts` bằng regex
    theo mốc `id: '...'` của từng tool). Slug cho ngôn ngữ dùng chữ Latin (it/ru dùng ký tự
    Cyrillic giữ nguyên, nl/pl/tr/id/sv) đều dùng dạng ASCII-hoá/kebab-case; slug cho ngôn
    ngữ script riêng (zh/zh-tw/ar/hi/th) dùng THẲNG ký tự bản ngữ trong URL — giống pattern
    đã có sẵn từ trước với `ja`/`ko`.
  - `src/i18n/i18next.ts` KHÔNG cần sửa gì — tự động glob-load mọi file JSON mới thêm vào
    `src/i18n/locales/*/*.json`, và có `fallbackLng: defaultLocale` nên NGAY CẢ TRƯỚC khi
    file `tool-*.json` của 1 ngôn ngữ mới tồn tại, trang tool vẫn build được (tự fallback
    hiện text tiếng Anh) — đã xác nhận qua `npm run build` chạy sạch 221 trang (20 ngôn ngữ
    × (10 tool + trang chủ) + 1 root index) ngay sau khi CHỈ MỚI thêm hạ tầng + `common.json`
    cho 12 ngôn ngữ, TRƯỚC KHI viết bất kỳ file `tool-*.json` nào — nghĩa là an toàn tuyệt
    đối, không có rủi ro "build gãy giữa chừng" khi làm dở phần nội dung dịch.
  - `common.json` (namespace dùng chung: nav/search/footer/banner/home...) đã viết ĐẦY ĐỦ,
    tự nhiên (không dịch máy) cho **CẢ 12 NGÔN NGỮ MỚI** — không cần động vào lại các file
    này: `src/i18n/locales/{zh,zh-tw,it,ru,nl,pl,tr,id,ar,hi,th,sv}/common.json`.
- **NỘI DUNG DỊCH TỪNG TOOL (`tool-*.json`, 10 file mỗi ngôn ngữ) — ĐANG LÀM DỞ, đây là phần
  còn thiếu, chiếm phần lớn khối lượng công việc còn lại**:
  - **`it` (Ý) — 5/10 XONG**: đã viết `tool-image-compress.json`, `tool-image-convert.json`,
    `tool-background-remover.json`, `tool-pdf-merge.json`, `tool-pdf-split.json`. **CÒN
    THIẾU đúng 5 file**: `tool-text-diff.json`, `tool-word-counter.json`,
    `tool-json-formatter.json`, `tool-qr-generator.json`, `tool-text-case-converter.json`.
  - **11 ngôn ngữ còn lại (`nl`, `pl`, `sv`, `tr`, `id`, `zh`, `zh-tw`, `ru`, `ar`, `hi`,
    `th`) — CHƯA VIẾT FILE `tool-*.json` NÀO CẢ**, chỉ mới có `common.json`. Mỗi ngôn ngữ
    cần đủ 10 file y hệt danh sách trên.
  - Tổng khối lượng còn lại: 5 file (nốt `it`) + 11 × 10 = 110 file = **115 file JSON** cần
    viết, mỗi file gồm `meta.title`/`meta.description`, `heading`, `tagline`, khối `ui.*`
    (15–30 chuỗi ngắn tuỳ tool), và `article.heading` + 4-5 đoạn văn (`p1`...`p4`/`p5`,
    tổng ~300–500 từ) viết TỰ NHIÊN riêng cho từng ngôn ngữ (không dịch máy nguyên khối,
    đúng quy tắc SEO trong `CLAUDE.md`).
- **NGUỒN THAM CHIẾU DUY NHẤT dùng để dịch** (đã đọc đầy đủ nội dung trong phiên này, xem
  lại nếu cần bằng Read tool, không cần đoán lại cấu trúc key): 10 file tiếng Anh tại
  `src/i18n/locales/en/tool-{image-compress,image-convert,background-remover,pdf-merge,
  pdf-split,text-diff,word-counter,json-formatter,qr-generator,text-case-converter}.json`
  — SAO CHÉP ĐÚNG CẤU TRÚC KEY (không thêm/bớt key nào), chỉ dịch GIÁ TRỊ. Đối chiếu thêm
  1 ngôn ngữ Latin đã có sẵn nếu cần ví dụ văn phong (ví dụ bản `es`/`fr` cùng tool) để thấy
  cách các phiên trước đã "viết lại tự nhiên" chứ không dịch nguyên văn.
- **Task tiếp theo khi mở phiên mới, THEO ĐÚNG THỨ TỰ**: (1) làm nốt 5 file còn thiếu của
  `it`, (2) rồi lần lượt từng ngôn ngữ trong danh sách 11 ngôn ngữ trên (thứ tự không quan
  trọng, có thể theo đúng thứ tự liệt kê để dễ theo dõi), mỗi ngôn ngữ viết đủ 10 file
  `tool-*.json`, (3) sau khi XONG CẢ 12 ngôn ngữ mới (đủ 10/10 file mỗi ngôn ngữ), chạy
  `npm run build` xác nhận sạch, test nhanh vài trang mẫu (đặc biệt `ar` để xác nhận
  `dir="rtl"` hiển thị đúng), rồi tick checkbox "Mở rộng i18n từ 8 lên 15–20 ngôn ngữ" trong
  `ROADMAP.md`, ghi log hoàn tất, và commit. Danh sách task chi tiết (mỗi ngôn ngữ 1 task
  riêng) đã được tạo trong task tracker của phiên này (task #14 "it" đang `in_progress`,
  #15-#25 mỗi ngôn ngữ 1 task còn `pending`, #26 là task tổng kết cuối cùng) — nếu task
  tracker của phiên mới không còn giữ các task này, cứ tạo lại tương tự hoặc bỏ qua và làm
  thẳng theo danh sách ở log này, không bắt buộc phải dùng task tracker.
- Đã commit hạ tầng + `common.json` × 12 + 5 file `it` đã xong (xem commit gần nhất trên
  `main`, message bắt đầu bằng `feat(i18n):`) — **CHƯA push lên `origin/main`**.

### 2026-07-25 — QA Audit toàn site (hoàn tất): Text Case Converter + responsive/dark mode
  sweep + báo cáo tổng kết — XONG
- **Tool #10 Text Case Converter**: audit đầy đủ lại (dù vừa build ở phiên trước cùng ngày)
  — chạy lại toàn bộ bộ test cũ (`test-textcase.mjs`, vẫn pass 100%) + thêm test hiệu năng
  với input ~900.000 ký tự (UPPERCASE: 340ms) và 20.000 dòng (Sort lines: 281ms) — **SẠCH,
  không tìm thấy bug, không cần sửa gì**.
- **Responsive + dark mode sweep toàn site**: chụp + kiểm tra `scrollWidth` thật (không chỉ
  nhìn ảnh) ở mobile (375px) và tablet (768px) cho cả 10 trang tool, cộng dark mode spot-check
  3 tool phức tạp (QR Generator, Text Diff, Merge PDF).
  - Phát hiện 1 bug thật: **So sánh văn bản** tràn lề ~4px ở đúng breakpoint tablet (768px) —
    hàng tiêu đề mỗi khung nhập (nhãn + nút Clear/Swap/Upload .txt) không tự xuống dòng, chen
    nhau vượt quá chiều rộng cột trong grid 2 cột tại `md:`. Sửa bằng cách thêm `flex-wrap`
    cho cả 4 hàng toolbar liên quan (2 khung nhập chính + 2 cột Merge Tool) — verify lại
    bằng `getBoundingClientRect()` xác nhận hết tràn lề, chạy lại toàn bộ
    `test-textdiff.mjs` xác nhận không có hồi quy.
  - 9 tool còn lại: không phát hiện tràn lề nào ở cả 2 mốc kích thước.
- **Tổng kết toàn bộ đợt audit** (từ đầu phiên tới giờ): tìm và sửa tổng cộng **9 bug/gap
  thật** trên layout dùng chung + 6/10 tool, đã build + test tương tác Puppeteer xác nhận +
  commit riêng từng phần trong suốt quá trình (không dồn tới cuối), đúng yêu cầu của người
  dùng. Danh sách đầy đủ + phân loại mức độ đã gửi trực tiếp cho người dùng dưới dạng bảng
  trong chat (không tạo file báo cáo riêng vì đây là nội dung nhất thời của 1 lần audit, theo
  đúng nguyên tắc không lưu tài liệu trung gian khi không được yêu cầu).

### 2026-07-25 — QA Audit toàn site (tiếp tục): tool #6-#9 — XONG, đã build + test + commit
  riêng từng phần
- **Tool #6 So sánh văn bản**: sửa đúng 1 bug UX đã phát hiện ở log trước — Merge Tool bấm
  mũi tên ←/→ giờ cột xem trước ĐÃ đổi nội dung hiển thị thật (mã màu nền xanh dương riêng
  cho dòng "được merge từ phía kia", phân biệt với đỏ/xanh lá/cam của diff gốc), khớp đúng
  nội dung sẽ Copy/Save. Test Puppeteer đầy đủ (`test-textdiff.mjs`): tất cả chế độ granularity,
  ignoreCase/ignoreWhitespace, prev/next change, swap, clear, upload file, merge tool cả 2
  chiều + toggle-off, fullscreen không lỗi, hiệu năng diff 5000 dòng (~1.3s, chấp nhận
  được), refresh sạch — tất cả pass.
- **Tool #7 Đếm từ & ký tự**: audit đầy đủ (đếm từ/câu/đoạn văn với case biết trước, whitespace-only
  input, từ đơn không dấu câu, bảng keyword density giới hạn đúng 10 dòng, hiệu năng với văn
  bản ~225.000 ký tự chỉ mất 68ms) — **SẠCH, không tìm thấy bug, không cần sửa gì**.
- **Tool #8 JSON Formatter & Validator**: audit đầy đủ (Beautify/Compact, chuyển Tree mode,
  báo lỗi cú pháp kèm số dòng + Go to error line thật sự bôi chọn đúng dòng, export XML/YAML/CSV
  với JSON lồng nhau xác nhận đúng nội dung, export khi JSON lỗi hiện thông báo rõ ràng thay
  vì crash) — **SẠCH, không tìm thấy bug, không cần sửa gì**.
- **Tool #9 QR Code Generator**: phát hiện 1 bug **🔴 Critical** — khi nội dung (URL/text/
  vCard/WiFi/...) vượt quá sức chứa QR code ở mức sửa lỗi hiện tại, `qrcode.react` ném
  `RangeError: Data too long` KHÔNG ĐƯỢC BẮT, khiến React unmount toàn bộ component (xác
  nhận qua `hasCanvas/hasTextarea/hasSelect` đều `false` sau lỗi — không chỉ canvas mà CẢ
  form chọn loại nội dung cũng biến mất khỏi DOM), không có thông báo lỗi, người dùng chỉ
  còn cách refresh trang. Tái hiện bằng cách nhập 5000 ký tự vào ô Text.
  - Sửa bằng React Error Boundary (`QrErrorBoundary`) bọc quanh cả 3 nơi render QR (canvas
    hiển thị + canvas/SVG ẩn dùng để xuất file) — khi lỗi xảy ra, hiện thông báo rõ ràng
    ("This content is too long...") thay vì crash, đồng thời khóa 2 nút Download.
  - **Gặp 1 race condition trong chính lần sửa đầu tiên**: dùng `useEffect` riêng để reset
    trạng thái lỗi mỗi khi giá trị thay đổi — nhưng effect này chạy SAU `componentDidCatch`
    trong cùng 1 chu kỳ commit, nên vô tình GHI ĐÈ lại trạng thái lỗi vừa được set thành
    `false`, khiến thông báo lỗi không bao giờ hiện ra dù DOM đã không còn canvas (tự phát
    hiện qua test thực tế báo "error message shown: false" dù biết chắc boundary đã bắt được
    lỗi). Sửa triệt để bằng cách bỏ hẳn `useEffect`, chuyển sang **tính toán trực tiếp trong
    lúc render**: so sánh khóa của lần render hiện tại (`renderValue-level`) với khóa đã từng
    lỗi lưu trong state — nếu trùng thì coi là đang lỗi, không trùng thì tự động "thử lại"
    mà không cần effect nào cả. Đây là bài học kỹ thuật đáng ghi nhớ: hai state update từ
    2 nguồn khác nhau nhắm cùng 1 biến trong cùng 1 chu kỳ render/commit rất dễ đua nhau,
    nên ưu tiên suy ra (derive) giá trị từ dữ liệu đã có sẵn thay vì đồng bộ 2 state riêng
    biệt bằng effect.
  - Test Puppeteer (`test-qrgenerator.mjs`): xác nhận không còn `pageerror` nào bắn ra (trước
    đây bắt được `RangeError: Data too long` ở mức window), form vẫn còn nguyên vẹn và
    tương tác được sau lỗi, thông báo lỗi hiện đúng, cả 2 nút Download bị khóa đúng lúc,
    phục hồi bình thường khi rút ngắn nội dung; đồng thời hồi quy đầy đủ WiFi ký tự đặc biệt,
    vCard, chuyển đổi loại nội dung giữ nguyên dữ liệu từng loại, tự nâng mức sửa lỗi khi
    thêm logo, nút xóa logo — tất cả pass.
- Ghi chú kỹ thuật jsoneditor (tool #8, để phiên sau khỏi mất công dò lại DOM): nút chuyển
  mode Text/Tree là `<button class="jsoneditor-modes">` (không phải `<select>`), bấm vào nó
  mới hiện ra `<ul class="jsoneditor-menu">` chứa các `<button class="jsoneditor-type-modes">`
  cho từng lựa chọn — không thể chọn mode bằng CSS selector đơn giản như `select`.

### 2026-07-25 — QA Audit toàn site (đang làm dở): Layout dùng chung + 5 tool đầu — XONG,
  đã build + test + commit riêng từng phần
- **Bối cảnh**: người dùng yêu cầu trực tiếp đóng vai Senior QA/Frontend/UI-UX kiểm tra lại
  TOÀN BỘ website (không giả định gì đang hoạt động đúng) — test từng chức năng, từng nút
  bấm, UI, UX, rồi xuất báo cáo phân loại mức độ. Không phải task trong `ROADMAP.md`, nhưng
  là yêu cầu hợp lệ chen ngang theo đúng tinh thần `CLAUDE.md`. Người dùng dặn thêm: xong
  phần nào phải commit + ghi tiến trình phần đó ngay, không dồn tới cuối.
- Phương pháp: với mỗi phần, đọc source thật (không đoán), viết test Puppeteer tương tác
  thật (upload/drag-drop/click/refresh/dữ liệu rỗng/dữ liệu lỗi/dữ liệu lớn), chạy trên
  bundle production (`npm run build` + `npm run preview`), sửa bug tìm được, rồi chạy lại
  test để xác nhận trước khi coi là xong. Ảnh test tạo bằng canvas trong trình duyệt (không
  cần fixture có sẵn), PDF test tạo bằng `pdf-lib` cài tạm trong scratchpad.
- **Layout dùng chung** (`Header.astro`, `Sidebar.astro`, `Layout.astro`) — phát hiện 2 bug
  UI thật ảnh hưởng MỌI trang trên mobile:
  1. Bấm nút hamburger mở sidebar trên mobile làm sidebar chèn ép nội dung chính xuống còn
     ~157px (do sidebar vẫn nằm trong flex-row cùng `<main>`, chỉ toggle class `hidden`
     chứ không tách khỏi luồng layout) — xác nhận bằng cách đọc `getBoundingClientRect()`
     thật của sidebar/main sau khi bấm nút, không chỉ nhìn ảnh chụp. Sửa: đổi sidebar sang
     mô hình "drawer" overlay đúng chuẩn (`fixed` + `-translate-x-full`/`translate-x-0` có
     transition, kèm backdrop mờ, khóa scroll body, đóng khi click ra ngoài/Esc/click vào
     link) — chỉ áp dụng dưới `md`, giữ nguyên `md:sticky` cũ ở desktop.
  2. Header bị vỡ trên mobile: chữ "Web Tool Hub" bị ép xuống 3 dòng vì phải chia chỗ với ô
     tìm kiếm trên CÙNG 1 hàng ở màn hình hẹp. Sửa: ô tìm kiếm tự động xuống hàng riêng dưới
     `md` (dùng `flex-wrap` + `order-*` để giữ đúng thứ tự logo → tìm kiếm → nút phải ở
     desktop nhưng logo+nút ở hàng 1, tìm kiếm full-width ở hàng 2 trên mobile), ẩn chữ
     "Web Tool Hub" (chỉ giữ logomark `>_`) dưới `sm` để tránh chật chội hơn nữa.
  - Test Puppeteer (`test-layout.mjs`): search trang chủ, dark mode + persist qua refresh,
    language switcher, mobile sidebar mở/đóng không còn chèn ép + không tràn ngang, tất cả
    pass sau khi sửa.
  - Commit riêng: `fix(layout): mobile sidebar drawer overlay + responsive header search row`.
- **Tool #1 Nén ảnh** — phát hiện 3 bug/gap thật:
  1. Nút "Nén ảnh" bị khóa vĩnh viễn sau khi TẤT CẢ ảnh đã nén xong (`canCompress` yêu cầu
     có ít nhất 1 ảnh chưa `done`), user không thể chỉnh lại thanh trượt chất lượng rồi nén
     lại — MÂU THUẪN với chính nội dung SEO của trang ("If a result doesn't look right, just
     adjust the slider and compress again — there's no limit on how many times you try").
     Sửa: bỏ điều kiện gating theo status, nén lại LUÔN áp dụng cho mọi ảnh hiện có, đồng
     thời revoke URL preview nén cũ trước khi tạo URL mới (tránh rò rỉ object URL khi nén
     lại nhiều lần).
  2. Không có cách xóa từng ảnh hoặc xóa tất cả trước khi nén — thêm nút ✕ mỗi ảnh + "Clear
     all".
  3. File không phải ảnh bị lọc ÂM THẦM khi kéo-thả (input click qua dialog thì trình duyệt
     tự chặn theo `accept`, nhưng kéo-thả bỏ qua hoàn toàn thuộc tính `accept`) — không có
     phản hồi gì cho người dùng. Thêm cảnh báo "N file(s) were skipped...".
  - Test Puppeteer (`test-imagecompress.mjs`): upload nhiều ảnh thật (tạo bằng canvas), nén,
    đổi chất lượng rồi nén lại xác nhận dung lượng đổi thật, xóa từng ảnh, Clear all, kéo-thả
    file .txt xác nhận cảnh báo hiện đúng, ảnh cực lớn (3500×2500) không crash, refresh sạch
    state. Tất cả pass. Cập nhật i18n 8 ngôn ngữ (`remove`/`clearAll`/`skippedFiles`).
  - Commit riêng: `fix(image-compress): allow re-compress + remove/clear-all + skipped-file warning`.
- **Tool #2 Chuyển đổi định dạng ảnh** — cùng 3 bug/gap y hệt tool #1 (canConvert bị khóa
  sau khi done, thiếu remove/clear-all, thiếu cảnh báo file bị bỏ qua) — sửa tương tự. Thêm
  phát hiện riêng: danh sách file bị lệch layout — nút ✕ đôi khi rớt xuống dòng riêng không
  đều giữa các item (do `<li>` dùng `flex-wrap` phẳng thay vì nhóm khối info/khối action
  riêng) — sửa bằng cách bọc khối info trong `min-w-0 flex-1` và khối nút trong `shrink-0`,
  giống pattern đã đúng sẵn ở tool Nén ảnh. Test Puppeteer (`test-imageconvert.mjs`) xác
  nhận: BMP/ICO tự viết tay encode vẫn đúng, chuyển đổi lại sang định dạng khác sau khi đã
  xong không bị khóa, AVIF chạy được trên Chrome hiện tại, remove/clear-all/skipped-file đều
  đúng, không lỗi console. Commit riêng: `fix(image-convert): allow re-convert + remove/clear-all + list layout consistency`.
- **Tool #3 Xóa nền ảnh** — khác 2 tool trên: nút "Remove Background" bị khóa sau khi done
  là ĐÚNG THIẾT KẾ (AI cutout là tất định, đổi màu nền/độ mềm viền đã tự cập nhật LIVE qua
  `useEffect` riêng không cần bấm lại nút, nên không sửa phần này). Chỉ thêm remove/clear-all
  + cảnh báo file bị bỏ qua (kéo-thả) cho nhất quán với 2 tool ảnh kia. Test Puppeteer
  (`test-bgremove.mjs`) chạy được CẢ luồng AI thật (tải model ONNX từ CDN của imgly — cần
  mạng, đã ghi chú rõ trong test rằng đây là hành vi đã được công bố sẵn trong UI "The first
  click downloads a small AI model... after that it works fully offline", không phải lỗi
  riêng tư dữ liệu vì model là public asset, không phải ảnh người dùng): xóa ảnh trước khi
  xử lý, đổi nền màu/ảnh, so sánh trước/sau, làm mềm viền sau khi xong không vỡ, tải xuống
  đúng file. Commit riêng: `fix(background-remover): add remove/clear-all + skipped-file warning`.
- **Tool #4 & #5 Gộp/Tách PDF** — 2 gap thật:
  1. `PdfMerger`: file không phải PDF bị lọc âm thầm khi kéo-thả, không có cảnh báo — thêm
     giống các tool ảnh.
  2. `PdfSplitter`: khi tách ra 3+ file (đặc biệt chế độ "Mỗi N trang" trên file nhiều
     trang), không có cách tải tất cả cùng lúc, phải bấm Download từng file một — thêm nút
     "Download All (.zip)" khi có >1 kết quả, dùng lại `jszip` đã có sẵn trong dự án (dynamic
     import, không thêm dependency mới).
  - Test Puppeteer (`test-pdf.mjs`) dùng file PDF thật tạo bằng `pdf-lib` (cài tạm trong
    scratchpad): gộp 2 file giữ đúng thứ tự trang, xoay/di chuyển/xóa trang trước khi gộp,
    TẢI FILE GỘP THẬT VỀ ĐĨA rồi mở lại bằng `pdf-lib` trong Node xác nhận đúng số trang
    (không chỉ tin UI); tách theo range hợp lệ/không hợp lệ, chế độ Every-N, tải từng file
    và tải zip đều xác nhận đúng nội dung thật. Tất cả pass. Commit riêng:
    `fix(pdf-merge,pdf-split): skipped-file warning + download-all zip for split results`.
- Ghi chú kỹ thuật rút ra được trong lúc audit (để phiên sau khỏi mất công điều tra lại):
  - Dev server Vite dài lâu qua nhiều trang có thể báo lỗi giả `504 Outdated Optimize Dep`
    khiến React hydrate lỗi — không phải bug ứng dụng, chỉ cần xóa `node_modules/.vite` và
    dùng bundle production (`npm run build` + `npm run preview`) để test đáng tin cậy hơn.
  - `document.querySelectorAll('li')`/text-match kiểu "body.innerText.includes(...)" trong
    test rất dễ cho kết quả DƯƠNG TÍNH GIẢ vì khớp nhầm với phần "Related tools"/bài viết SEO
    ở cuối mỗi trang tool — luôn scope selector chặt (theo class/id riêng của khu vực đang
    test) thay vì query toàn `<body>`.
  - Input `accept="image/*"` chỉ chặn được khi chọn file qua dialog click — kéo-thả (drag &
    drop) BỎ QUA hoàn toàn thuộc tính này, nên logic lọc file phía client (và cảnh báo khi
    lọc) phải test bằng cách giả lập sự kiện `drop` thật (dispatch `Event('drop')` kèm
    `dataTransfer.files` giả), không thể test qua `input.uploadFile()` của Puppeteer (vốn đại
    diện cho luồng chọn-qua-dialog, đã tự bị trình duyệt lọc trước).
- **CÒN DANG DỞ**: đang audit tool #6 "So sánh văn bản" — đã đọc xong source, PHÁT HIỆN 1
  bug UX đáng kể CHƯA SỬA: trong khu vực "Merge Tool", bấm mũi tên ←/→ để chấp nhận 1 phía
  chỉ âm thầm đổi text sẽ được Copy/Save (`mergedLeftText`/`mergedRightText` qua
  `renderMergedColumn()`) — HAI CỘT XEM TRƯỚC không hề đổi nội dung hiển thị (`DiffRowContent`
  chỉ đọc thẳng `entry.leftText`/`entry.rightText`, không biết gì về `hunkOverrides`), khiến
  người dùng bấm mũi tên nhưng không thấy gì thay đổi trên màn hình — chỉ có nút mũi tên tự
  đổi màu active. Cần sửa để cột xem trước phản ánh đúng lựa chọn merge trước khi tick tool
  #6 là xong. Task tiếp theo khi mở phiên mới: sửa bug này trước, rồi tiếp tục test tương
  tác đầy đủ cho tool #6, sau đó qua tool #7-#10 + trang chủ + responsive/dark mode + báo
  cáo tổng kết, theo đúng thứ tự đã liệt kê ở mục "Trạng thái hiện tại" phía trên.

### 2026-07-25 — Phase 1.5, tool #10 (CUỐI CÙNG): Nâng cấp "Chuyển đổi Case văn bản" lên
  Feature Parity — XONG, HOÀN TẤT PHASE 1.5
- Benchmark: ConvertCase.net.
- Trạng thái trước khi nâng cấp: `TextCaseConverter.tsx` chỉ có 5 kiểu case
  (UPPERCASE/lowercase/Title Case/camelCase/snake_case), kiến trúc 2 khung (nhập → xuất)
  riêng biệt với nút chọn `mode`, khác thiết kế 1-khung-sửa-tại-chỗ của ConvertCase.net —
  đây là quyết định kiến trúc CŨ từ Phase 1, giữ nguyên không đổi lại ở lượt nâng cấp này.
- Đã làm: mở rộng union `CaseMode` và switch `convertCase()` thêm 6 mode mới (3 kiểu case +
  3 tiện ích), tái dùng ĐÚNG kiến trúc cũ (mode → tính lại `output` qua `useMemo`) thay vì
  đổi sang kiểu "sửa tại chỗ trên 1 khung" của đối thủ — quyết định có chủ đích giữ tối
  thiểu diff, không đổi UX đã chốt từ Phase 1 nếu không được yêu cầu:
  - `sentence`: lowercase toàn bộ rồi viết hoa chữ đầu văn bản + chữ đầu sau mỗi `. `/`! `/
    `? `.
  - `alternating` (aLtErNaTiNg CaSe) và `inverse` (iNVERSE cASE): dùng phép thử
    `char.toUpperCase() !== char.toLowerCase()` để xác định "có phải chữ cái có phân biệt
    hoa/thường" thay vì regex ASCII `[a-zA-Z]` — Unicode-aware nên chữ có dấu (é, ñ, ü...)
    cũng được xử lý đúng, phù hợp site 8 ngôn ngữ hơn là chỉ xử lý đúng ASCII. Bộ đếm xen kẽ
    của `alternating` CHỈ tăng khi gặp ký tự có phân biệt hoa/thường (dấu cách/dấu câu không
    làm lệch nhịp xen kẽ) — xác nhận khớp ví dụ kinh điển "Hello World" → "hElLo WoRlD".
  - `removeSpaces`: gộp các khoảng trắng/tab liên tiếp thành 1 khoảng trắng, cắt khoảng
    trắng đầu/cuối MỖI DÒNG (dùng cờ `gm`), giữ nguyên dấu xuống dòng.
  - `removeLineBreaks`: coi CẢ dòng chỉ toàn khoảng trắng/tab (không chỉ dòng rỗng tuyệt
    đối) là "dòng trống" khi gộp — dùng regex `[ \t]*\n(?:[ \t]*\n)+` gộp mọi cụm 2+ dòng
    trống liên tiếp (kể cả dòng có vài dấu cách/tab bên trong) về đúng 1 dấu xuống dòng, rồi
    cắt bỏ toàn bộ dòng trống ở đầu/cuối văn bản — quyết định chủ động rộng hơn cách hiểu
    "chỉ dòng rỗng tuyệt đối", vì khớp đúng tinh thần "xóa xuống dòng THỪA" hơn.
  - Cả `removeSpaces`/`removeLineBreaks` đều chuẩn hóa `\r\n` → `\n` trước khi xử lý (phòng
    hờ văn bản dán vào có xuống dòng kiểu Windows).
  - `sortLines`: tách theo `\n`, sắp xếp bằng `localeCompare`, nối lại.
  - JSX: tách 1 hàng nút `modes` cũ thành 2 hàng có tiêu đề riêng (`caseModes`/
    `utilityModes`), mỗi hàng có `<h3>` tiêu đề (`caseOptionsHeading`/`utilitiesHeading`) —
    COPY nguyên logic style nút cũ cho cả 2 hàng thay vì tách thành sub-component dùng
    chung, vì chỉ có 2 nơi gọi, tránh trừu tượng hóa sớm không cần thiết cho 1 file nhỏ.
  - Thêm 8 key i18n mới (`caseSentence`, `caseAlternating`, `caseInverse`,
    `caseOptionsHeading`, `utilRemoveSpaces`, `utilRemoveLineBreaks`, `utilSortLines`,
    `utilitiesHeading`) cho đủ 8 ngôn ngữ. 3 label case mới (`caseSentence`/
    `caseAlternating`/`caseInverse`) giữ NGUYÊN VĂN tiếng Anh ở cả 8 file — khớp quy ước có
    sẵn của tool này (`caseUpper`/`caseTitle`... vốn đã luôn là token tiếng Anh chưa dịch kể
    cả ở bản vi/es/pt/fr/de/ja/ko). 2 tiêu đề + 3 nhãn tiện ích thì dịch riêng theo từng
    ngôn ngữ. Thêm `article.p5` mới (không nhét vào p3/p4 cũ) ở cả 8 ngôn ngữ giới thiệu 3
    kiểu case mới + 3 tiện ích, viết riêng theo giọng văn từng ngôn ngữ, không dịch máy
    nguyên khối từ bản tiếng Anh. Cập nhật `meta.description`/`tagline` thêm 1 câu ngắn nhắc
    tới tính năng mới, có kiểm soát không để `meta.description` vượt quá xa ngưỡng SEO
    ~155-160 ký tự.
- Test tương tác qua Puppeteer (`test-textcase.mjs` trong scratchpad, không commit, cài tạm
  `puppeteer-core` CHỈ trong scratchpad để chạy Chrome thật đã có sẵn trên máy) — chạy đủ cả
  trên dev server LẪN bundle production thật (`npm run build` + `npm run preview`), bao phủ:
  - Hồi quy 5 mode cũ (upper/lower/title/camel/snake) vẫn đúng sau khi tách lại JSX thành 2
    mảng/2 hàng nút.
  - Sentence case: `"hello world. this is great! are you SURE?"` → đúng
    `"Hello world. This is great! Are you sure?"`.
  - Alternating case: `"Hello World"` → đúng `"hElLo WoRlD"`; thêm input bắt đầu bằng dấu
    cách/dấu câu (`"  hi!"`) → đúng `"  hI!"`, xác nhận bộ đếm không lệch nhịp vì ký tự
    không phân biệt hoa/thường.
  - Inverse case: `"Hello World"` → đúng `"hELLO wORLD"`.
  - Remove extra spaces: input nhiều dòng có khoảng trắng/tab thừa cả giữa dòng lẫn đầu/cuối
    dòng → gộp đúng còn 1 khoảng trắng mỗi chỗ, số dòng/dấu xuống dòng giữ nguyên.
  - Remove extra line breaks: input có nhiều dòng trống liên tiếp XEN LẪN 1 dòng chỉ có
    khoảng trắng (`"   "`) ở giữa, cộng dòng trống đầu/cuối văn bản → gộp về đúng 1 dấu
    xuống dòng, cắt sạch dòng trống đầu/cuối — xác nhận đúng cách hiểu "dòng chỉ có khoảng
    trắng cũng tính là dòng trống" đã chọn.
  - Sort lines: `"banana\napple\ncherry"` → đúng `"apple\nbanana\ncherry"`.
  - Nút Copy/Clear vẫn hoạt động đúng (enable/disable theo nội dung, Clear xóa sạch khung
    nhập) sau khi thêm 6 mode mới.
  - Kiểm tra i18n trên bản `vi`: 2 tiêu đề mới + 3 nhãn tiện ích hiện đúng bản dịch tiếng
    Việt, 3 nhãn case mới hiện ĐÚNG nguyên văn tiếng Anh như thiết kế (không bị dịch nhầm).
  - Không có console error nào trong suốt luồng test.
- `npm run build` sạch cả trước và sau khi test (89 trang tĩnh, đủ 8 ngôn ngữ × 10 tool +
  trang chủ). Đã tick đủ 2/2 checkbox con + dòng cha "10. Chuyển đổi Case văn bản" trong
  `ROADMAP.md` Phase 1.5 — đây là tool cuối cùng, Phase 1.5 coi như HOÀN TẤT (trừ mục nén
  PDF còn treo riêng của tool #4/#5, đã ghi chú từ trước, không phải lỗi mới).
- CHƯA hỏi người dùng về việc push commit này lên `origin/main` (chỉ mới commit local).

### 2026-07-25 — Nâng cấp lần 2 "So sánh văn bản" theo yêu cầu trực tiếp của người dùng
  (vượt checklist gốc của Phase 1.5, tool #6) — XONG
- **Bối cảnh**: tool #6 đã được tick 4/4 trong `ROADMAP.md` Phase 1.5 ở một lượt trước đó
  trong cùng phiên (xem log "tool #6" bên dưới). Người dùng sau đó yêu cầu TRỰC TIẾP một
  danh sách nâng cấp lớn hơn nhiều, KHÔNG có trong `ROADMAP.md` — coi đây là yêu cầu chen
  ngang hợp lệ (đúng như `CLAUDE.md` cho phép: "không nhảy cóc sang task khác... trừ khi
  người dùng yêu cầu"), không phải một task mới trong checklist nên không thêm checkbox
  ROADMAP nào cho việc này.
- Yêu cầu gốc của người dùng: số dòng đồng bộ cuộn ở 2 khung nhập; thanh công cụ mỗi khung
  (Xóa/Hoán đổi/Tải file .txt); bảng thống kê 3 badge xanh/đỏ/cam; 3 chế độ so sánh Ký tự/
  Từ/Dòng; khu vực so sánh song song có highlight cam/đỏ/xanh + icon nhảy tới thay đổi kế
  tiếp/trước + nút toàn màn hình; và một "Công cụ hợp nhất" (Merge Tool) riêng bên dưới với
  2 cột + nút mũi tên ←/→ theo từng đoạn thay đổi + Sao chép/Lưu/toàn màn hình mỗi cột.
- **Kiến trúc**: viết lại gần như toàn bộ, tách phần lõi thuật toán ra file dùng chung mới
  `src/lib/text-diff.ts` (không đặt trong component vì cả khu "so sánh song song" lẫn "công
  cụ hợp nhất" đều cần dùng chung 1 kết quả diff):
  - `buildLineDiff()`: xây mô hình diff theo TỪNG DÒNG một — mỗi dòng nguồn thành đúng 1
    "entry" loại `unchanged`/`added`/`removed`/`modified`. Điểm mấu chốt: một khối dòng bị
    xóa đứng NGAY TRƯỚC một khối dòng được thêm (`diffLines` trả về 2 phần liên tiếp
    removed→added) được ghép cặp theo chỉ số (dòng xóa thứ i ghép với dòng thêm thứ i) và
    phân loại là `modified` — đúng cách các công cụ diff lớn (GitHub split view, Beyond
    Compare, WinMerge) phân biệt "dòng bị SỬA" với "1 dòng xóa không liên quan + 1 dòng
    thêm không liên quan". Trong từng cặp `modified`, chạy thêm 1 lượt `diffChars`/
    `diffWords` (tùy chế độ Ký tự/Từ đang chọn; chế độ Dòng thì bỏ qua bước này) để tô đậm
    đúng phần từ/ký tự đã đổi bên trong dòng.
  - `getHunkStartRows()`: gom các entry liền kề khác `unchanged` thành từng "hunk" (cụm
    thay đổi), dùng chung cho cả nút nhảy tới thay đổi kế tiếp/trước VÀ vị trí đặt nút mũi
    tên của Merge Tool.
  - `renderMergedColumn()`: tính văn bản thực tế của 1 cột trong Merge Tool từ dữ liệu diff
    GỐC + một Map "hunk nào đã được người dùng bấm mũi tên đổi bên" — KHÔNG sửa trực tiếp
    vào text rồi diff lại từ đầu, vì làm vậy sẽ khiến ranh giới các hunk bị xê dịch liên tục
    sau mỗi lần bấm (trải nghiệm rất khó chịu khi đang xử lý merge từng cụm một) — quyết
    định kiến trúc quan trọng nhất của phần này.
- **UI/UX** (`src/components/tools/TextDiffChecker.tsx`, viết lại hoàn toàn):
  - Bỏ nút "So sánh" — so sánh giờ chạy LIVE ngay khi gõ (có debounce 150ms tránh tính lại
    diff trên từng phím gõ với văn bản dài), khớp UX hiện đại hơn (giống Diffchecker.com).
  - `LineNumberedTextarea`: component dùng chung cho cả 2 khung nhập — gutter số dòng đồng
    bộ cuộn với chính khung nhập đó qua `onScroll`, ĐỔI 2 khung nhập sang font-mono +
    line-height cố định (24px, khớp `leading-6`) để số dòng luôn thẳng hàng chính xác với
    nội dung — trước đó dùng font thường co giãn không đảm bảo được điều này.
  - 2 khung nhập ("Văn bản gốc"/"Văn bản đã sửa") giờ CŨNG cuộn đồng bộ với NHAU (không chỉ
    số dòng với nội dung riêng khung đó) — suy luận hợp lý từ yêu cầu dù câu gốc hơi mơ hồ,
    khớp hành vi công cụ diff chuyên nghiệp thường thấy.
  - Thanh công cụ mỗi khung: Xóa (clear state), Hoán đổi (swap 2 state cho nhau), Tải tệp
    .txt (input file ẩn + `FileReader.readAsText`).
  - Bảng thống kê tái dùng lại 3 badge `statsAdded/statsRemoved/statsModified` đã có sẵn từ
    lần nâng cấp trước, đổi màu modified từ amber sang đúng cam (`bg-orange-500/15`) theo
    yêu cầu.
  - 3 nút chuyển granularity Ký tự/Từ/Dòng (thêm mới "Ký tự" dùng `diffChars`, trước đây
    chỉ có Từ/Dòng).
  - Khung so sánh song song: 2 cột cuộn đồng bộ (kỹ thuật `isSyncingRef` chặn vòng lặp
    feedback, tái dùng ý tưởng từ lần nâng cấp trước nhưng viết lại thành hook
    `useSyncedScroll()` tái sử dụng được cho cả cặp khung nhập lẫn cặp cột kết quả), số
    dòng riêng từng cột (chỉ tăng khi cột đó thực sự có dòng ở vị trí đó), nút ↑/↓ +
    counter "X / Y changes" nhảy tới từng hunk bằng `scrollIntoView`, nút Toàn màn hình
    dùng Fullscreen API chuẩn (`requestFullscreen`/`exitFullscreen`, hook `useFullscreen()`
    theo dõi qua sự kiện `fullscreenchange`).
  - **Công cụ hợp nhất** (khu vực mới hoàn toàn): 3 cột dạng grid (trái | gutter mũi tên |
    phải) — gutter chỉ hiện cặp nút ←/→ ở DÒNG ĐẦU TIÊN của mỗi hunk (không phải mỗi dòng,
    để tránh rối mắt với hunk nhiều dòng); bấm → = cột trái mượn nội dung cột phải cho hunk
    đó (dùng để "chèn thêm"/"chấp nhận xóa"/"thay thế" tùy loại hunk), bấm ← ngược lại;
    click lại lần 2 vào cùng 1 mũi tên sẽ HỦY lựa chọn đó (toggle, không phải chỉ 1 chiều).
    Mỗi cột có nút Sao chép (Clipboard API) + Lưu (tải file .txt) + Toàn màn hình riêng.
  - Giới hạn đã biết, ghi lại minh bạch: gutter mũi tên của Merge Tool ẩn hoàn toàn trên
    mobile (`hidden md:flex`) vì bố cục 3-cột-cạnh-nhau không hợp lý trên màn hình hẹp —
    người dùng mobile vẫn xem được nội dung 2 cột merge (xếp dọc) nhưng không thao tác được
    nút ←/→; đây là đánh đổi có chủ đích cho một công cụ vốn thiên về desktop, không phải
    lỗi bỏ sót.
- Test tương tác qua Puppeteer (3 file `test-textdiff.mjs`/`test-textdiff2.mjs`/
  `test-textdiff3.mjs` trong scratchpad, không commit) — chạy đủ cả trên dev server LẪN
  bundle production thật (`npm run build` + `npm run preview`), bao phủ:
  - Số dòng hiển thị đúng số lượng dòng thực tế.
  - Nút Xóa/Hoán đổi/Tải file hoạt động đúng (test Tải file bằng cách tạo file `.txt` thật
    trên đĩa rồi dùng `elementHandle.uploadFile()`, không giả lập).
  - So sánh chạy live không cần bấm nút.
  - Phân loại added/removed/modified ĐÚNG với 1 kịch bản dựng có chủ đích tách biệt rõ 3
    loại thay đổi bằng các dòng neo không đổi — bài test ban đầu tự đoán sai kết quả phân
    loại cho 1 kịch bản mơ hồ hơn (2 dòng xóa/3 dòng thêm cạnh nhau), tự phát hiện qua lỗi
    test thật rồi sửa lại kịch bản test cho rõ ràng, không hạ thấp tiêu chuẩn kiểm tra.
  - Cả 3 nút granularity tồn tại; **quan trọng nhất**: xác nhận chuyển Từ→Ký tự thực sự đổi
    ĐỘ MỊN của highlight (chế độ Từ tô cả từ "brown"/"brwon", chế độ Ký tự chỉ tô đúng ký tự
    "o" bị hoán đổi vị trí) — không chỉ kiểm tra nút bấm được mà xác nhận thuật toán con
    thực sự chạy khác nhau theo chế độ. Chế độ Dòng xác nhận KHÔNG có highlight con nào.
  - Cả 3 màu xanh/đỏ/cam đều xuất hiện đúng trong DOM thật.
  - Điều hướng ↑/↓ đổi đúng counter.
  - Nút Toàn màn hình không throw lỗi (dù Chrome headless thường từ chối cấp quyền
    fullscreen do thiếu user-activation thật — chấp nhận không thể test chính event
    fullscreenchange có bắn ra hay không trong môi trường headless, chỉ xác nhận không có
    lỗi JS không bắt được).
  - **Merge Tool cả 2 chiều ←/→**: bấm → rồi TẢI FILE THẬT qua nút Lưu, đọc lại nội dung
    file từ đĩa để xác nhận cột trái đã đổi đúng nội dung — không chỉ tin vào việc UI hiện
    đúng chữ. Tương tự chiều ←. Xác nhận bấm lại cùng 1 mũi tên sẽ hủy lựa chọn (revert).
  - Cuộn đồng bộ: cả cặp khung nhập VÀ cặp cột kết quả, xác nhận scrollTop thực sự đồng bộ
    hai chiều bằng cách đọc giá trị `scrollTop` thật sau khi bắn sự kiện scroll.
  - `ignoreCase`/`ignoreWhitespace` (tính năng cũ) vẫn hoạt động đúng sau khi viết lại toàn
    bộ engine.
- `npm run build` sạch cả trước và sau khi test. Đã cập nhật lại toàn bộ nội dung SEO (bài
  viết p3/p4 + meta description) ở cả 8 ngôn ngữ để mô tả đúng bộ tính năng mới (không còn
  nhắc tới nút "So sánh" đã bị bỏ) — viết lại tay cho từng ngôn ngữ, không dịch máy nguyên
  khối. Đã bỏ key i18n `compare` không còn dùng ở cả 8 file.


### 2026-07-25 — Phase 1.5, tool #9: Nâng cấp "QR Code Generator" lên Feature Parity — XONG
- Benchmark: qr-code-generator.com.
- Trạng thái trước khi nâng cấp: chỉ có 1 ô nhập văn bản/URL đơn, màu sắc + logo đã có sẵn
  từ Phase 1, mức sửa lỗi (error correction) bị hard-code cứng ở `level="H"` luôn luôn
  (không cho chọn), chỉ export được PNG (qua `canvas.toDataURL`), không có SVG.
- Đã làm (viết lại gần như toàn bộ `QrCodeGenerator.tsx`):
  - Thêm dropdown chọn **loại nội dung**: URL, văn bản thường, Wi-Fi, danh thiếp (vCard),
    email, SMS — mỗi loại có bộ field riêng, đổi loại nội dung KHÔNG làm mất màu sắc/logo
    đã chọn (state riêng biệt cho từng loại, không dùng chung 1 ô input).
  - Tự viết 4 hàm tạo payload theo đúng định dạng chuẩn mà hầu hết máy quét QR hỗ trợ
    (không có thư viện nào trong `qrcode.react` làm việc này, phải tự implement theo spec
    de-facto):
    - Wi-Fi: `WIFI:T:<WPA|WEP|nopass>;S:<ssid>;P:<password>;H:<true>;;` — có escape các ký
      tự đặc biệt `\;,":` bằng backslash theo đúng quy ước mọi máy quét đều hiểu ngầm (Wi-Fi
      QR không có spec chính thức, nhưng quy ước escape này thống nhất giữa Android/iOS).
    - vCard: chuẩn `BEGIN:VCARD...VERSION:3.0...N:/FN:/TEL:/EMAIL:/ORG:/URL:...END:VCARD`,
      chỉ thêm dòng nào có dữ liệu.
    - Email: `mailto:<to>?subject=...&body=...` dùng `URLSearchParams` để tự động encode
      đúng chuẩn URI.
    - SMS: `SMSTO:<phone>:<message>` — định dạng được hầu hết máy quét nhận diện rộng rãi
      hơn `sms:` URI scheme hiện đại.
  - Thêm dropdown chọn **mức sửa lỗi L/M/Q/H** (trước đó hard-code H). Giữ lại hành vi tiện
    lợi cũ (tự nâng lên H khi có logo) nhưng CHỈ khi mức hiện tại đang thấp hơn H — không
    ghi đè lựa chọn thủ công của người dùng nếu họ đã tự chọn Q/H từ trước, và vẫn cho phép
    hạ mức lại bằng tay sau khi tự động nâng.
  - Thêm **export SVG**: dùng component `QRCodeSVG` có sẵn trong `qrcode.react` (trước đó
    chỉ dùng `QRCodeCanvas`), render ẩn (`aria-hidden`, `h-0 w-0 overflow-hidden`) song
    song với canvas hiển thị, lấy `outerHTML` qua `XMLSerializer`, thêm khai báo XML rồi
    tải xuống dạng `.svg`.
  - Thêm **chọn độ phân giải PNG khi tải xuống** (256/512/1024/2048px), TÁCH RIÊNG khỏi
    thanh trượt kích thước xem trước (preview vẫn 128–512px để không làm chậm re-render khi
    kéo trượt) — render thêm 1 `QRCodeCanvas` ẩn ở đúng độ phân giải đã chọn, tải xuống từ
    canvas ẩn đó thay vì canvas hiển thị.
- Test tương tác qua Puppeteer (`test-qr.mjs`, `test-qr-export.mjs` trong scratchpad, không
  commit) — **quan trọng: không chỉ kiểm tra chuỗi payload bằng mắt, mà GIẢI MÃ THẬT lại
  ảnh QR đã render** bằng thư viện `jsqr` (cài tạm trong scratchpad, không phải dependency
  dự án) đọc `canvas.getImageData()` rồi decode ngược — cách duy nhất xác nhận chắc chắn
  rằng ảnh QR sinh ra thực sự quét được đúng nội dung, không chỉ "state React đúng":
  - URL mặc định giải mã đúng y hệt.
  - Wi-Fi: giải mã lại đúng `WIFI:T:WPA;S:MyHome Network;P:sup3r\;secret\"pass;;` — xác
    nhận việc escape `;` và `"` trong mật khẩu hoạt động thật qua 1 vòng encode→quét ảnh→
    decode thật, không chỉ so sánh chuỗi JS. Test thêm chế độ "nopass" xác nhận field `P:`
    biến mất hoàn toàn.
  - vCard: giải mã đúng đủ 6 dòng `BEGIN/VERSION/N/FN/TEL/EMAIL/END`.
  - Email: giải mã đúng `mailto:...?subject=Hi+there&body=This+is+a+test+%26+more` — xác
    nhận ký tự `&` trong nội dung body được `URLSearchParams` tự encode đúng thành `%26`
    (không làm hỏng cấu trúc query string).
  - SMS: giải mã đúng `SMSTO:+15550100:Hello from QR`.
  - Đổi loại nội dung qua lại xác nhận màu FG đã chọn (`#ff0000`) không bị mất.
  - Test xuất file thật: chọn độ phân giải PNG 2048px, tải xuống, **đọc trực tiếp 4 byte
    IHDR chunk của file PNG thật** (offset 16-23, big-endian) để xác nhận kích thước ảnh
    đúng 2048×2048 — không tin vào việc UI "trông đúng", đọc thẳng byte nhị phân của file
    kết quả. Tải SVG, xác nhận có khai báo `<?xml...?>` và thẻ `<svg>` hợp lệ.
  - Test hành vi tự nâng mức sửa lỗi: đặt mức về L, giả lập upload logo thật bằng
    `DataTransfer` + `File` API thật trong context trang (không gọi thẳng hàm xử lý bằng
    tay) để đảm bảo đúng luồng sự kiện `input[type=file].onchange` thật của React, xác nhận
    mức tự nhảy lên H.
- `npm run build` sạch. Đã tick đủ 3/3 checkbox con + dòng cha "9. QR Code Generator" trong
  `ROADMAP.md` Phase 1.5.
- Cập nhật đoạn nội dung SEO (bài viết p3/p4 + meta description) ở cả 8 ngôn ngữ để mô tả
  đủ các loại nội dung mới, mức sửa lỗi chọn được, và export SVG/độ phân giải PNG — viết
  thêm/sửa câu bằng tay cho từng ngôn ngữ, không dịch máy nguyên khối.

### 2026-07-25 — Phase 1.5, tool #8: Nâng cấp "JSON Formatter & Validator" lên Feature
  Parity — XONG
- Benchmark: JSONFormatter.org, JSONLint.
- Khảo sát trước khi sửa: đọc thẳng mã nguồn đã biên dịch của `jsoneditor-minimalist.js`
  (không chỉ dựa vào tài liệu) để biết chính xác bản "minimalist" (đã chọn ở Phase 1 để
  tránh Ace editor, xem log cũ) hỗ trợ sẵn những gì:
  - **Tree view thu gọn/mở rộng**: có sẵn 100% (tính năng gốc của jsoneditor ở `mode:
    'tree'`) — không cần code gì thêm, chỉ cần xác nhận bằng test tương tác.
  - **Toggle Beautify/Minify**: có sẵn 100% — `mainMenuBar: true` ở `mode: 'text'` tự hiện
    2 nút `.jsoneditor-format` ("Format JSON data...") và `.jsoneditor-compact` ("Compact
    JSON data..."). Cũng không cần code thêm.
  - **Báo lỗi kèm số dòng + highlight dòng lỗi**: đây là phần thật sự thiếu. Bản minimalist
    dùng `<textarea>` thuần cho mode text (không phải Ace hay contenteditable) — xác nhận
    qua dòng "load a plain text textarea ... plain text editor (fallback when Ace is not
    available)" trong mã nguồn. Một `<textarea>` thuần KHÔNG thể tô màu nền riêng cho 1
    dòng cụ thể bằng CSS (không có khái niệm "dòng" trong DOM của nó). Quyết định KHÔNG
    đổi sang bản jsoneditor đầy đủ kèm Ace (sẽ vi phạm quyết định giảm bundle size đã chốt
    trước đó) và cũng không thêm CodeMirror/Monaco (vi phạm "không thêm dependency mới nếu
    không thực sự cần thiết"). Giải pháp chọn: dùng callback có sẵn `onValidationError` của
    jsoneditor (đã tự tính sẵn `line` từ lỗi parse của jsonlint nội bộ, xác nhận qua đọc mã
    nguồn hàm `validate()` — `_this5.options.onValidationError` nhận mảng lỗi có field
    `line`) để hiện 1 banner đỏ rõ ràng "Syntax error on line X: <message>" — rõ hơn hẳn
    icon nhỏ có sẵn của jsoneditor. Cho "highlight dòng lỗi", thay vì cố overlay pixel lên
    textarea (rủi ro cao, dễ vỡ khi cuộn/resize), dùng API chuẩn `textarea.setSelectionRange()`
    để BÔI CHỌN (native browser selection highlight) đúng dòng lỗi khi người dùng bấm nút
    "Go to error line" — an toàn hơn nhiều so với tự động tô mỗi lần gõ phím (sẽ cướp mất
    con trỏ/selection liên tục trong lúc gõ), đồng thời trình duyệt tự cuộn tới dòng đó.
  - **Convert JSON → XML/YAML/CSV**: không có trong ROADMAP.md danh sách thư viện được phép
    dùng sẵn cho tool này. Tự viết 3 hàm chuyển đổi thuần JS (không thêm dependency mới):
    `convertJsonToXml` (đệ quy, escape `&<>`, tên tag không hợp lệ tự thay ký tự lạ bằng
    `_`, mảng bọc trong nhiều `<item>`), `convertJsonToYaml` (block style chuẩn, tự quote
    chuỗi khi cần theo các quy tắc dễ gây nhầm lẫn: giống true/false/null, giống số, có dấu
    `: `, khoảng trắng đầu/cuối...), `convertJsonToCsv` (JSON là mảng object → mỗi object 1
    dòng, object lồng nhau được làm phẳng theo dot-notation, mảng trong 1 ô thì
    `JSON.stringify` lại vì CSV không biểu diễn được list trong 1 ô).
- Test tương tác qua Puppeteer (`test-json.mjs`, `test-yaml-roundtrip.mjs` trong scratchpad,
  không commit):
  - Xác nhận nút Format/Compact hoạt động thật (so sánh có/không có `\n` trong nội dung
    textarea trước/sau khi bấm).
  - Chuyển sang tree mode, đếm số nút thu gọn/mở rộng có mặt, bấm thu gọn node gốc và xác
    nhận số field hiển thị giảm về 0 (đúng hành vi thu gọn).
  - Nhập JSON lỗi cú pháp cố ý (thiếu dấu phẩy khiến parser bối rối ở dòng 4) → xác nhận
    banner hiện đúng "line 4", bấm "Go to error line" → xác nhận `textarea.selectionStart
    !== selectionEnd` (có bôi chọn thật, không phải chỉ đặt con trỏ) và
    `document.activeElement` đúng là textarea đó. Sửa lại JSON hợp lệ → xác nhận banner tự
    biến mất.
  - Xuất thử cả 3 định dạng XML/YAML/CSV với 1 JSON có object lồng nhau + mảng, so khớp nội
    dung mong đợi. Xuất khi JSON đang lỗi → xác nhận hiện thông báo `exportInvalidJson`
    thay vì crash.
  - **Kiểm tra bổ sung riêng cho YAML** (rủi ro cao nhất vì tự viết serializer thủ công,
    không dùng thư viện): cài tạm `js-yaml` CHỈ trong thư mục scratchpad (không phải
    dependency của dự án, chỉ dùng để kiểm chứng, không commit) để PARSE NGƯỢC lại kết quả
    YAML do tool sinh ra và so sánh bằng `JSON.stringify` với JSON gốc — chạy qua 3 case:
    object lồng nhau + mảng object + mảng rỗng + chuỗi khó (chứa dấu `"`, dấu `:`, số dạng
    chuỗi, khoảng trắng đầu dòng), mảng ở cấp gốc, và lồng sâu 3-4 cấp có mảng-trong-mảng —
    cả 3 case round-trip CHÍNH XÁC tuyệt đối, xác nhận serializer tự viết đúng cú pháp YAML
    thật chứ không chỉ "nhìn giống đúng".
- `npm run build` sạch. Đã tick đủ 4/4 checkbox con + dòng cha "8. JSON Formatter &
  Validator" trong `ROADMAP.md` Phase 1.5.
- Cập nhật đoạn nội dung SEO (bài viết p3/p4) ở cả 8 ngôn ngữ để nhắc tới "Go to error
  line" và tính năng export XML/YAML/CSV — viết thêm câu mới bằng tay cho từng ngôn ngữ,
  không dịch máy nguyên khối.

### 2026-07-25 — Phase 1.5, tool #7: Nâng cấp "Đếm từ & ký tự" lên Feature Parity — XONG
- Benchmark: WordCounter.net.
- Trạng thái trước khi nâng cấp: component `WordCounter.tsx` hoá ra ĐÃ có sẵn "thời gian
  đọc ước tính", "đếm số câu", "đếm số đoạn văn" từ trước (không rõ từ Phase 1 hay một lượt
  nâng cấp Phase 1.5 chưa ghi log) — 2/3 mục con coi như đã xong sẵn, chỉ thật sự còn thiếu
  "thời gian nói ước tính" và "bảng tần suất từ khóa (keyword density)".
- Đã làm:
  - Thêm `speakingMinutes` vào `countStats()`: dùng tốc độ thuyết trình trung bình 130
    từ/phút (khác với 200 từ/phút của tốc độ đọc) — cùng công thức làm tròn lên tối thiểu 1
    phút như thời gian đọc đã có, hiển thị thành 1 ô số liệu mới cạnh "Thời gian đọc".
  - Thêm `computeTopWords()`: tách từ bằng regex Unicode-aware `[\p{L}\p{N}']+` (chuyển
    thường trước khi đếm), đếm tần suất bằng `Map`, sắp xếp giảm dần, lấy top 10, tính %
    trên tổng số từ. Quyết định KHÔNG lọc bỏ "stop word" (the/and/là/và...) — kiểm tra thực
    tế cách WordCounter.net làm: họ cũng đếm tất cả các từ kể cả từ phổ biến, vì mục đích
    thật của "keyword density" là phát hiện một từ khóa SEO có bị lặp quá dày hay không,
    bao gồm cả trường hợp từ khóa đó vô tình trùng với từ thông dụng.
  - Thêm bảng hiển thị top từ khóa (từ / số lần / % trên tổng) ngay dưới lưới số liệu, chỉ
    hiện khi có ít nhất 1 từ (ẩn hoàn toàn khi ô nhập trống).
  - Thêm 7 key i18n mới (`speakingTimeLabel`, `speakingTimeValue`, `keywordDensityHeading`,
    `keywordDensityWordColumn`, `keywordDensityCountColumn`, `keywordDensityPercentColumn`)
    cho đủ 8 ngôn ngữ + cập nhật `WordCounterPage.astro` truyền các key này vào component.
  - Cập nhật đoạn nội dung SEO (bài viết p3/p4) ở cả 8 ngôn ngữ để nhắc tới 2 tính năng mới
    (thời gian nói, bảng tần suất từ khóa) — viết thêm câu mới bằng tay cho từng ngôn ngữ
    (không dịch máy nguyên khối), giữ đúng văn phong đoạn văn gốc của từng bản.
- Test tương tác qua Puppeteer (`test-wordcounter.mjs` trong scratchpad, không commit):
  nhập 208 từ có tần suất biết trước ("apple" × 20, "banana" × 10, còn lại là từ duy nhất)
  → xác nhận số liệu cập nhật TRỰC TIẾP không cần nút bấm (đúng UX gốc của tool này), thời
  gian nói (130 wpm) LUÔN ≥ thời gian đọc (200 wpm) với cùng số từ — đúng quan hệ toán học
  kỳ vọng, bảng tần suất xếp đúng "apple" hạng 1 (20 lần, đúng %), "banana" hạng 2 (10
  lần), giới hạn đúng tối đa 10 dòng, bảng biến mất khi xóa hết văn bản. Test ban đầu viết
  sai kỳ vọng số câu (đếm nhầm 3 thay vì 4 vì quên rằng đoạn cuối cùng "New paragraph
  starts." cũng kết thúc bằng dấu chấm) — đã tự phát hiện qua lỗi test thật (không phải lỗi
  ứng dụng) và sửa lại kỳ vọng trước khi tin kết quả.
- `npm run build` sạch. Đã tick đủ 3/3 checkbox con + dòng cha "7. Đếm từ & ký tự" trong
  `ROADMAP.md` Phase 1.5.

### 2026-07-25 — Phase 1.5, tool #6: Nâng cấp "So sánh văn bản" lên Feature Parity — XONG
- Benchmark: Diffchecker.com.
- Trạng thái trước khi nâng cấp: đã có so sánh theo từ/dòng bằng `diffWords`/`diffLines`
  của thư viện `diff` (jsdiff), nhưng kết quả chỉ hiện ra 1 đoạn văn bản GỘP CHUNG cả phần
  thêm (xanh) và xóa (đỏ gạch ngang) thành 1 khối duy nhất bên dưới 2 khung nhập — không
  giống cách Diffchecker.com hiển thị (2 khung riêng biệt, mỗi khung tô màu phần khác biệt
  của chính văn bản đó). Không có tùy chọn ignore case/whitespace, không đếm số thay đổi.
- Đã làm (`src/components/tools/TextDiffChecker.tsx` viết lại gần như toàn bộ):
  - Đổi kết quả so sánh từ 1 khối gộp chung sang **2 khung riêng biệt đặt đúng vị trí 2 ô
    nhập ban đầu** (khung trái = văn bản gốc với phần bị xóa tô đỏ-gạch-ngang tại chỗ,
    khung phải = văn bản đã sửa với phần thêm mới tô xanh tại chỗ) — dùng CHUNG 1 kết quả
    `diffWords`/`diffLines` từ jsdiff, chỉ lọc khác nhau: khung trái ẩn phần `added`, khung
    phải ẩn phần `removed`. Đây là cách hiểu đúng của yêu cầu "highlight ngay trên khung
    văn bản" trong `ROADMAP.md` — phân biệt với thiết kế cũ vốn có thể bị coi là "in ra 1
    danh sách khác biệt bên dưới" dù đã tô màu.
  - Thêm cuộn đồng bộ 2 khung kết quả bằng 1 handler `onScroll` gán chéo `scrollTop`/
    `scrollLeft` sang khung còn lại, có cờ `isSyncingScrollRef` chặn vòng lặp feedback vô
    hạn (khung B tự kích hoạt scroll → lại đồng bộ ngược về khung A → ...).
  - Thêm 2 checkbox tùy chọn "Ignore whitespace"/"Ignore case", áp dụng cho cả 2 chế độ
    từ/dòng. Ghi chú kỹ thuật: `diffLines` của jsdiff không khai báo `ignoreCase` trong
    kiểu TypeScript (`DiffLinesOptionsNonabortable`), NHƯNG đọc mã nguồn đã biên dịch
    (`node_modules/diff/libcjs/diff/base.js`, hàm `equals()`) xác nhận nó vẫn đọc
    `options.ignoreCase` ở runtime bất kể đơn vị so sánh (dòng hay từ) — dùng kiểu giao
    `DiffLinesOptionsNonabortable & { ignoreCase?: boolean }` để truyền tham số đúng mà
    không cần ép kiểu `any`.
  - Thêm 3 badge thống kê "X added / X removed / X modified": viết hàm `summarizeChanges()`
    coi 1 cặp block `removed` rồi ngay sau đó `added` liền kề là "modified" (tính theo phần
    chồng lấn nhỏ hơn giữa 2 block, phần dư mới tính là thêm/xóa thuần) — đúng cách con
    người thường đọc diff, dù bản thân thuật toán diff chỉ biết add/remove thuần.
  - Thêm 5 key i18n mới (`ignoreWhitespace`, `ignoreCase`, `statsAdded`, `statsRemoved`,
    `statsModified`) cho đủ cả 8 ngôn ngữ trong `src/i18n/locales/*/tool-text-diff.json` +
    cập nhật `TextDiffPage.astro` truyền các key này vào component.
- Test tương tác qua Puppeteer (`test-diff.mjs`, `test-diff-ws.mjs` trong thư mục
  scratchpad, không commit): xác nhận 2 khung hiện đúng nội dung riêng của từng bên (khung
  gốc không hiện từ mới thêm, khung sửa không hiện từ đã xóa), class CSS tô màu/gạch ngang
  có áp dụng thật (không chỉ đúng text), badge thống kê ra số khác 0, cuộn 1 khung tự động
  kéo khung kia theo (test ban đầu viết sai cách truyền `ElementHandle[]` vào
  `page.evaluate` khiến `scrollTop` đọc ra `null` và pass giả — đã phát hiện và sửa lại
  cách gọi cho từng phần tử riêng lẻ trước khi tin kết quả), `ignoreCase` khiến
  "Hello World" vs "hello world" báo không có khác biệt, `ignoreWhitespace` ở chế độ dòng
  khiến dòng chỉ khác nhau về khoảng trắng cuối dòng cũng báo không có khác biệt.
- `npm run build` sạch sau khi sửa. Không có công cụ `typescript`/`astro check` cài trong
  dự án để chạy typecheck tĩnh (chỉ có thể dựa vào build — vốn chỉ strip type bằng esbuild
  chứ không kiểm tra type — và test tương tác thật) — ghi chú lại để phiên sau biết, có thể
  cân nhắc thêm `typescript`/`@astrojs/check` làm devDependency nếu muốn kiểm type chặt hơn
  (chưa làm vì chưa được hỏi ý kiến người dùng, đúng quy tắc "không thêm dependency mới nếu
  chưa thực sự cần thiết" trong `CLAUDE.md`).
- Đã tick đủ 4/4 checkbox con + dòng cha "6. So sánh văn bản" trong `ROADMAP.md` Phase 1.5.

### 2026-07-25 — Phase 1.5, tool #4 & #5: Build + test tương tác "Gộp/Tách PDF" — XONG
  (còn thiếu nén PDF)
- Chạy `npm run build`: sạch, exit 0.
- **Phát hiện lỗi nghiêm trọng ở thượng nguồn (`pdfjs-dist`) trong lúc test tương tác**,
  KHÔNG tick checkbox ngay mà dừng lại sửa trước, đúng quy trình `CLAUDE.md`:
  - Test bằng Puppeteer (Chrome thật, không phải jsdom) qua `puppeteer-core` cài tạm trong
    thư mục scratchpad (không phải dependency của dự án, chỉ dùng để test phiên này) điều
    khiển Chrome đã cài sẵn trên máy (`C:\Program Files\Google\Chrome`), phát hiện MỌI lần
    tải PDF qua `renderPdfThumbnails()` đều crash với lỗi
    `TypeError: hashOriginal.toHex is not a function`.
  - Truy nguyên: `pdfjs-dist` (bản `^6.1.200` đang cài) gọi thẳng
    `Uint8Array.prototype.toHex()` — một API JS engine RẤT mới (theo MDN: "Baseline newly
    available" từ tháng 9/2025) — mà KHÔNG có feature-detect fallback nào, khác với chính
    `pdfjs-dist` các bản cũ (`<=5.0.375`) vốn luôn bọc `if (Uint8Array.prototype.toHex) {...}
    else {...}`. Lỗi này crash 100% mọi lần load PDF vì `fingerprints` (nơi gọi `.toHex()`)
    được tính bắt buộc trong bước khởi tạo document, không có cách nào bỏ qua qua option.
    Xác nhận đây là lỗi có thật ở thượng nguồn, không phải lỗi môi trường test, qua GitHub
    issue #20759 của `mozilla/pdf.js` (cùng thông điệp lỗi, tái hiện trên Chrome 139 và
    143 — tức là ảnh hưởng cả các bản Chrome khá mới, không chỉ trình duyệt cũ).
  - Thử vá bằng polyfill `Uint8Array.prototype.toHex/fromHex/toBase64` + `fromBase64` (áp
    dụng cả main thread lẫn bên trong Worker riêng của pdfjs qua kỹ thuật bọc
    `workerSrc` bằng 1 Blob module chứa polyfill rồi `import` file worker gốc) — polyfill
    có tác dụng, nhưng lộ ra NGAY một lỗi thượng nguồn thứ hai cùng bản chất:
    `Map.prototype.getOrInsertComputed is not a function` (một đề xuất TC39 còn mới hơn cả
    `toHex`, gần như chưa trình duyệt nào hỗ trợ). Kết luận: bản `pdfjs-dist@6.1.200` dùng
    quá nhiều API JS bleeding-edge không có fallback — vá từng API một là việc không có
    điểm dừng.
  - **Quyết định: hạ phiên bản `pdfjs-dist` xuống ghim cứng `5.0.375`** (`"pdfjs-dist":
    "5.0.375"` trong `package.json`, không dùng `^` để tránh tự động nâng cấp lại đúng
    bản lỗi) — bản cuối cùng còn tự bọc fallback cho các API này. Đã bỏ lại polyfill thủ
    công (không cần thiết nữa, đúng tinh thần tối giản của `CLAUDE.md`).
  - Bản `5.0.375` dùng API `page.render({ canvasContext, viewport })` (không phải
    `{ canvas, viewport }` — cú pháp `canvas` trực tiếp là tiện ích mới hơn chỉ có ở bản
    6.x), nên đã sửa `src/lib/pdf-thumbnails.ts` lấy `canvas.getContext('2d')` trước rồi
    truyền `canvasContext` — cách này về mặt kỹ thuật tương thích với MỌI phiên bản
    `pdfjs-dist`, không chỉ 5.0.375, nên an toàn kể cả sau này đổi phiên bản lần nữa.
  - Ghi chú áp dụng cho các phiên sau: nếu thấy `npm run build` báo thành công nhưng tool
    dùng `pdfjs-dist` (PDF merge/split) không hoạt động khi test tương tác thật trên trình
    duyệt, kiểm tra ngay lỗi dạng "X is not a function" liên quan tới các API
    `Uint8Array`/`Map` mới — rất có thể là cùng loại vấn đề (thư viện dùng browser API quá
    mới), không phải lỗi trong code của dự án.
- **Phát hiện lỗi thứ hai (trong chính code của dự án, không phải thượng nguồn)**: trong
  `PdfMerger.tsx`, khi chọn nhiều file PDF cùng lúc, mỗi file được render thumbnail bằng 1
  Promise độc lập chạy song song (`for (const file of newFiles) { void (async () => {...
  })() }`) — nếu file chọn SAU nhưng ít trang hơn (render nhanh hơn) file chọn TRƯỚC, trang
  của nó sẽ xuất hiện TRƯỚC trong danh sách gộp, đảo ngược thứ tự người dùng mong đợi một
  cách âm thầm. Tái hiện được bằng test thật: upload `test-a.pdf` (3 trang) rồi
  `test-b.pdf` (2 trang) → thứ tự thumbnail ban đầu ra `B1,B2,A1,A2,A3` thay vì
  `A1,A2,A3,B1,B2`. Đã sửa: xử lý các file tuần tự trong 1 vòng lặp `for...of` bên trong
  MỘT async IIFE duy nhất (thay vì 1 IIFE riêng mỗi file), đảm bảo trang luôn được thêm vào
  đúng thứ tự chọn file, bất kể file nào render xong trước. Vẫn giữ được UI hiển thị trạng
  thái "loading" cho tất cả file ngay lập tức (không đợi tuần tự mới hiện).
- Sau khi sửa cả 2 lỗi trên, viết 2 bộ test Puppeteer đầy đủ
  (`test-merge.mjs`/`test-split.mjs`, nằm trong thư mục scratchpad, không commit vào repo)
  bao phủ: upload nhiều file thật (PDF tạo bằng `pdf-lib` ngay trong Node để test), kiểm
  tra thumbnail render đúng số trang, kéo-thả/nút mũi tên đổi thứ tự, xoay trang, xóa
  trang, gộp rồi tải kết quả về và MỞ LẠI bằng `pdf-lib` trong Node để xác minh số trang +
  góc xoay đúng thật sự (không chỉ kiểm tra UI không báo lỗi) — cho `PdfSplitter.tsx` test
  thêm cả 2 chế độ tách "Khoảng tùy chỉnh" và "Mỗi N trang". Chạy lại toàn bộ 2 bộ test
  này LẦN NỮA sau `npm run build` + `npm run preview` (tức là kiểm tra đúng bundle production
  thật, không chỉ dev server) — tất cả đều pass.
- Đã tick 3/4 checkbox con của mục "4 & 5. Gộp/Tách PDF" trong `ROADMAP.md` Phase 1.5
  (thumbnail+kéo-thả, tách theo range/mỗi-N-trang, xoay/xóa trang) — CHƯA tick mục con "nén
  PDF" (chưa làm, để lại cho sau, không phải lỗi) và CHƯA tick dòng cha (vì chưa đủ 4/4 mục
  con theo đúng tinh thần "Checklist Feature Parity" của `CLAUDE.md` — không tick cha khi
  còn con dang dở).
- CHƯA hỏi người dùng về việc push commit lên `origin/main` (commit này + commit
  `f1dbe2b`/`4e276ab` trước đó vẫn đang chỉ ở local).

### 2026-07-25 — Phase 1.5, tool #4 & #5: Nâng cấp "Gộp/Tách PDF" — ĐANG LÀM DỞ
- Đang làm: benchmark iLovePDF/Smallpdf/PDF2GO cho tool #4 "Gộp PDF" và #5 "Tách PDF".
- Đã làm (commit `f1dbe2b`, chỉ ở local, CHƯA push lên `origin/main`):
  - Thêm `src/lib/pdf-thumbnails.ts` dùng chung cho cả 2 tool: gọi `pdfjs-dist` (đã hỏi và
    được đồng ý cài trước đó) để render thumbnail từng trang PDF, nạp qua dynamic import.
  - `PdfMerger.tsx`: đổi từ danh sách file sang lưới thumbnail theo TỪNG TRANG (mọi trang
    của mọi file gộp chung 1 lưới, không nhóm theo file) — kéo-thả sắp xếp lại (kèm nút
    mũi tên dự phòng cho bàn phím/không kéo được), xoay 90°/lần, xóa từng trang trước khi
    gộp.
  - `PdfSplitter.tsx`: thêm hiển thị thumbnail từng trang, xoay/xóa trang, thêm chế độ tách
    "Mỗi N trang" bên cạnh "Khoảng tùy chỉnh" đã có.
  - Cập nhật 16 file i18n (`tool-pdf-merge.json` + `tool-pdf-split.json` × 8 ngôn ngữ) —
    key UI mới + viết lại nội dung bài viết.
  - `npm run build` đã chạy **thành công** (exit code 0, xác nhận qua task notification)
    trước khi phiên bị gián đoạn.
- **CHƯA xong / còn thiếu trước khi tick ROADMAP.md**:
  - Test tương tác thật qua CDP (đúng quy trình đã áp dụng cho tool #1-#3) — đang test dở
    `PdfMerger.tsx` (upload 2 file PDF thật, xoay/xóa/sắp xếp trang, gộp, kiểm tra file kết
    quả bằng `pdf-lib` trong Node) thì bị gián đoạn giữa chừng, CHƯA có kết quả pass/fail.
  - Chưa test `PdfSplitter.tsx` (chế độ "Mỗi N trang" mới, xoay/xóa trang trước khi tách)
    hoàn toàn chưa chạy thử.
  - Chưa tick checkbox nào của tool #4/#5 trong `ROADMAP.md` Phase 1.5 — ĐÚNG, vì theo quy
    trình `CLAUDE.md` chỉ tick sau khi build + test xác nhận ổn, chưa được làm xong ở đây.
  - Chưa push commit `f1dbe2b` lên GitHub.
- Task tiếp theo khi mở phiên mới (làm đúng theo thứ tự): (1) chạy lại `npm run build` để
  xác nhận vẫn sạch, (2) chạy/hoàn tất test tương tác cho cả `PdfMerger.tsx` và
  `PdfSplitter.tsx` (script test CDP tham khảo nằm trong thư mục scratchpad của phiên
  trước, cần viết lại nếu không còn), (3) nếu mọi thứ ổn mới tick các checkbox tương ứng
  trong `ROADMAP.md` Phase 1.5 và ghi log hoàn tất, (4) hỏi người dùng trước khi push,
  (5) sau đó mới chuyển sang tool #6 "So sánh văn bản".

### 2026-07-25 — Phase 1.5, tool #3: Nâng cấp "Xóa nền ảnh" lên Feature Parity
- Benchmark: remove.bg, Adobe Express Background Remover.
- Trạng thái trước khi nâng cấp: batch nhiều ảnh + kéo-thả đã có sẵn từ Phase 1; preview
  chỉ là 2 thumbnail tĩnh cạnh nhau (không kéo so sánh được), chưa có thay nền, chưa có
  tinh chỉnh viền.
- Kiểm tra `Config` schema của `@imgly/background-removal` — thư viện KHÔNG có option
  edge refinement/feathering nào (chỉ có `model` isnet/isnet_fp16/isnet_quint8 và
  `output.format`/`quality`), đúng như `ROADMAP.md` dự liệu trước ("nếu thư viện hỗ trợ").
  Quyết định tự làm mềm viền bằng hậu xử lý JS thuần thay vì bỏ qua mục này.
- Đã làm:
  - Viết `softenAlphaEdges()`: box blur 2 lượt (ngang rồi dọc) áp dụng CHỈ lên kênh alpha
    của ảnh đã xóa nền — không đụng RGB — tạo hiệu ứng viền mềm tự nhiên hơn cho tóc/lông
    thú. Luôn tính lại từ `resultBlob` GỐC (không lặp làm mờ lên kết quả đã mờ trước đó)
    nên non-destructive, đổi slider qua lại không bị cộng dồn.
  - Viết `buildDisplayBlob()`: pipeline hợp nhất "làm mềm viền (nếu có) → ghép nền (màu
    solid / ảnh tùy chọn / giữ trong suốt)" thành 1 blob hiển thị (`displayUrl`), tách
    biệt hoàn toàn khỏi `resultBlob` gốc (không sửa/ghi đè kết quả AI thật) — cho phép đổi
    nền/độ mềm viền qua lại nhiều lần mà không cần chạy lại mô hình AI (chỉ chạy lại thao
    tác canvas nhẹ).
  - Thêm `useEffect` tính lại `displayUrl` cho MỌI ảnh đã xong mỗi khi nền hoặc độ mềm
    viền thay đổi — dependency dùng số lượng ảnh `status === 'done'` (không dùng
    `items` trực tiếp để tránh vòng lặp effect vô hạn do bản thân effect cũng gọi
    `setItems`).
  - Thêm UI slider so sánh trước/sau: 2 ảnh xếp chồng, ảnh kết quả bọc trong 1 lớp có nền
    caro (hiện qua vùng trong suốt) và bị cắt bằng CSS `clip-path` theo % vị trí; điều
    khiển bằng 1 `<input type="range">` trong suốt phủ toàn bộ khung (kéo bằng chuột/chạm/
    phím mũi tên đều dùng được, tận dụng accessibility có sẵn của range input thay vì tự
    viết logic kéo-thả bằng pointer events).
  - Thêm control chọn nền: 3 nút Trong suốt/Màu solid (kèm color picker)/Ảnh tùy chọn
    (kèm input file + nút xóa), áp dụng CHUNG cho toàn bộ danh sách ảnh (không phải từng
    ảnh riêng) — khớp UX phổ biến của remove.bg/Adobe (chọn 1 nền, áp cho cả batch).
  - Track mọi object URL (preview gốc, ảnh nền tùy chọn, display đã ghép) trong 1
    `useRef<Set>`, revoke hết khi unmount — giống pattern đã dùng ở tool Nén ảnh.
  - Thêm 7 key i18n UI mới (`backgroundLabel`, `backgroundTransparent`, `backgroundColor`,
    `backgroundImage`, `backgroundImageSelect`, `backgroundImageClear`,
    `edgeSoftnessLabel`) cho cả 8 ngôn ngữ, viết lại `meta`/`heading`/`tagline`/`p3`/`p4`
    của bài viết để phản ánh tính năng mới.
  - `npm run build` sạch, 89 trang.
  - **Test tương tác thật với model AI thật** (không mock) qua CDP: upload ảnh test thật
    200×150px, bấm Xóa nền — xác nhận model tải về + chạy suy luận thật (~15-27 giây tuỳ
    lần chạy, log tiến trình 0%→100% đúng), tải xuống PNG hợp lệ ở TRẠNG THÁI TRONG SUỐT
    MẶC ĐỊNH. Sau đó test lần lượt: chuyển sang nền màu solid (PNG mới, dung lượng khác —
    xác nhận ghép nền thật), tăng độ mềm viền lên 5px (PNG khác nữa), quay lại trong suốt
    (PNG khác nữa) — cả 4 bước đều cho ra PNG hợp lệ với dung lượng khác nhau ở mỗi bước,
    xác nhận pipeline ghép nền/làm mềm viền hoạt động đúng, không bị cache nhầm hay đứng
    yên. Gặp 1 lỗi giả trong chính script test (Chrome tự động tải xuống ghi đè file trùng
    tên thay vì thêm hậu tố "(1)" như tải tương tác thường — khiến bước so sánh
    before/after của script tưởng nhầm là "không có file mới"); sửa bằng cách xóa sạch thư
    mục tải trước mỗi lần kiểm tra thay vì so sánh diff — không phải lỗi sản phẩm.
- Quyết định kỹ thuật quan trọng:
  - Chọn nền áp dụng CHUNG cho cả danh sách thay vì từng ảnh riêng — đơn giản hóa UI đáng
    kể và khớp đúng cách các đối thủ benchmark làm (remove.bg cũng chọn 1 nền áp cho ảnh
    đang xử lý, không phải nền riêng biệt phức tạp cho từng ảnh trong batch).
  - Test bằng ảnh tổng hợp 200×150px (hình chữ nhật màu, không phải ảnh người/vật thật) —
    đủ để xác nhận toàn bộ PIPELINE kỹ thuật hoạt động đúng (model chạy, alpha blur đúng,
    ghép nền đúng), nhưng KHÔNG xác nhận được chất lượng cắt nền trên ảnh thật có chủ thể
    phức tạp (tóc, lông thú...) — việc đó cần thử bằng ảnh thật.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa tự thử bằng ảnh người/thú cưng thật để đánh giá chất lượng cắt nền và hiệu quả
    thực tế của slider làm mềm viền trên tóc/lông — nên thử tay khi có dịp.
  - Model AI tải từ CDN công khai của thư viện mất khoảng 15-27 giây trong lần test (mạng
    + máy chủ CI/test), thời gian thực tế cho người dùng cuối có thể khác tùy tốc độ mạng.
- Task tiếp theo: Phase 1.5, tool #4 & #5 "Gộp/Tách PDF".

### 2026-07-25 — Phase 1.5, tool #2: Nâng cấp "Chuyển đổi định dạng ảnh" lên Feature Parity
- Benchmark: Convertio, CloudConvert, iLoveIMG.
- Trạng thái trước khi nâng cấp: chỉ hỗ trợ 3 định dạng đích (WebP/JPEG/PNG); batch +
  chọn định dạng đích chung cho tất cả file **đã có sẵn từ Phase 1** (không phải làm lại).
- Đã hỏi người dùng trước khi cài `gifenc` (encoder GIF thuần JS, ~5KB gzip, không WASM)
  — được đồng ý dùng thư viện nhỏ thay vì bỏ qua GIF. `heic2any` cài không cần hỏi lại vì
  chính `ROADMAP.md` đã nêu tên thư viện này làm gợi ý cho mục HEIC.
- Đã làm:
  - Cài `gifenc` (không có type sẵn → viết `src/types/gifenc.d.ts` khai báo tối thiểu
    đúng API dùng tới: `quantize`, `applyPalette`, `GIFEncoder`) và `heic2any` (có sẵn
    `.d.ts`).
  - Mở rộng `TargetFormat` từ 3 lên 7: thêm AVIF, BMP, GIF, ICO.
    - AVIF: vẫn dùng `canvas.toBlob('image/avif', quality)` có sẵn của trình duyệt, nhưng
      **tự kiểm tra `blob.type` sau khi tạo** — một số trình duyệt (kể cả Chrome headless
      dùng để test) âm thầm trả về blob khác định dạng khi không hỗ trợ AVIF thay vì báo
      lỗi, nên phải tự phát hiện và báo message riêng (`errorAvifUnsupported`) thay vì tải
      xuống 1 file .avif rởm.
    - BMP: `canvas.toBlob` KHÔNG trình duyệt nào hỗ trợ xuất BMP — tự viết encoder JS
      thuần (`encodeBmp`) ghi trực tiếp bytes theo chuẩn BITMAPFILEHEADER +
      BITMAPINFOHEADER 24bpp không nén, không cần thư viện.
    - ICO: `canvas.toBlob` cũng không hỗ trợ — tự viết `encodeIco` bọc 1 PNG blob trong
      container ICO tối giản (header 22 byte + dữ liệu PNG nguyên vẹn — hợp lệ từ Windows
      Vista trở lên, không cần tự nén lại pixel). Tự động resize ảnh nếu lớn hơn 256×256
      (giới hạn kích thước icon chuẩn).
    - GIF: dùng `gifenc` (`quantize` → `applyPalette` → `GIFEncoder`) để nén palette +
      LZW từ dữ liệu pixel thô.
  - Mở rộng input `accept` + bộ lọc file để nhận thêm GIF/BMP/AVIF và đặc biệt HEIC/HEIF —
    ảnh HEIC từ iPhone thường có `file.type` RỖNG trên một số trình duyệt/hệ điều hành nên
    không thể chỉ lọc theo MIME type, phải kiểm tra thêm đuôi file `.heic`/`.heif`.
  - Thêm `toDecodableBlob()`: nếu file là HEIC/HEIF, chuyển qua `heic2any` thành PNG
    TRƯỚC khi đưa vào `createImageBitmap` (không trình duyệt nào giải mã HEIC trực tiếp
    được). Cả `heic2any` và `gifenc` đều nạp bằng **dynamic `import()`** thay vì import
    tĩnh — áp dụng đúng bài học rút ra từ lỗi SSR crash của `jsoneditor` ở tool #8 (thư
    viện chạm global trình duyệt ở module scope sẽ làm crash `npm run build` nếu import
    tĩnh, dù ở đây kiểm tra riêng thấy `heic2any` không trực tiếp đụng `self` — vẫn phòng
    ngừa theo nguyên tắc chung đã ghi trong log tool #8).
  - Thêm key i18n `ui.errorAvifUnsupported` và `ui.formatsNote` (giải thích giới hạn ICO
    256×256, yêu cầu trình duyệt mới cho AVIF, tự động đọc HEIC) cho cả 8 ngôn ngữ. Viết
    lại toàn bộ `meta`/`heading`/`tagline`/`article` cho cả 8 ngôn ngữ để phản ánh đúng 7
    định dạng + HEIC input (nội dung cũ chỉ nhắc JPEG/PNG/WebP đã lỗi thời, cũng là cơ hội
    SEO tốt hơn vì bắt thêm từ khóa "avif converter", "heic to jpg", "ico converter"...).
  - `npm run build` sạch, 89 trang.
  - **Test tương tác thật cho cả 7 định dạng đích** bằng CDP (viết tiếp từ script của tool
    #1): phát hiện lần chạy đầu TOÀN BỘ 7 định dạng đều lỗi "Something went wrong" — điều
    tra bằng cách bật `console.error` tạm thời trong catch block, phát hiện nguyên nhân
    thật là `createImageBitmap()` báo `InvalidStateError` vì ảnh test 1×1 pixel tổng hợp
    (dùng từ log tool #1) quá tối giản để giải mã — **không phải lỗi do code sửa** (dòng
    gọi `createImageBitmap` y hệt code gốc trước khi nâng cấp). Tạo lại ảnh test thật
    (200×150px, PNG hợp lệ qua GDI+/.NET) rồi chạy lại: **WebP/JPEG/PNG/BMP/ICO đều PASS
    (kiểm tra đúng magic bytes)**, **AVIF phát hiện đúng "trình duyệt không hỗ trợ" và báo
    message rõ ràng thay vì tạo file lỗi** (đúng thiết kế phòng ngừa), **GIF** ban đầu báo
    "MAGIC_BYTES_INVALID" nhưng khi đọc trực tiếp file thật trên đĩa xác nhận header
    `GIF89a` hợp lệ 542 byte — té ra là race condition trong logic so sánh
    before/after-download của SCRIPT TEST (đọc nhầm thời điểm), không phải lỗi encoder.
    Gỡ dòng `console.error` debug tạm trước khi build bản cuối.
- Quyết định kỹ thuật quan trọng:
  - Tự viết encoder BMP/ICO bằng tay thay vì thêm thư viện — cả 2 định dạng đủ đơn giản
    (BMP: header cố định + pixel thô; ICO: header cố định + PNG có sẵn) nên viết tay rẻ
    hơn và ít rủi ro hơn thêm dependency.
  - AVIF không dùng thư viện mã hoá riêng (như `@jsquash/avif` WASM) — chấp nhận phụ
    thuộc vào hỗ trợ native của trình duyệt vì đây đúng tinh thần "ưu tiên Web API có sẵn
    trước khi thêm thư viện" của `CLAUDE.md`; có UI báo lỗi rõ ràng cho trường hợp không
    hỗ trợ thay vì giả vờ luôn hoạt động.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chrome headless dùng để test có thể chưa hỗ trợ xuất AVIF (không xác nhận được AVIF
    thật trên trình duyệt có hỗ trợ) — logic phát hiện lỗi đã test đúng nhánh "không hỗ
    trợ", nhưng nhánh "trình duyệt CÓ hỗ trợ AVIF thật" chưa được test trực tiếp. Nên thử
    tay trên Chrome/Firefox bản mới khi có dịp.
  - Chưa test HEIC thật (không có sẵn file .heic mẫu trong môi trường build để test) — chỉ
    verify code logic `toDecodableBlob`/`isHeic` bằng đọc lại, chưa chạy qua CDP với file
    HEIC thật. Nên tự thử tay với ảnh HEIC thật từ iPhone khi có dịp.
  - Bài học phương pháp luận: khi viết script test tự động, nhớ 1×1 pixel test image quá
    tối giản với `createImageBitmap` — dùng ảnh test có kích thước/nội dung thực tế hơn
    (đã tạo `test-real.png` 200×150px qua PowerShell GDI+, lưu trong scratchpad phiên) cho
    các lần test sau liên quan tới decode ảnh qua Canvas API.
- Task tiếp theo: Phase 1.5, tool #3 "Xóa nền ảnh".

### 2026-07-25 — Phase 1.5, tool #1: Nâng cấp "Nén ảnh" lên Feature Parity
- Benchmark: TinyPNG, Squoosh, iLoveIMG (theo đúng yêu cầu trong `ROADMAP.md`).
- Trạng thái trước khi nâng cấp: batch upload nhiều ảnh, quality slider, kéo-thả đã có sẵn
  từ Phase 1 (không phải làm lại) — chỉ thiếu 2 mục: preview ảnh trực quan trước/sau (trước
  đó chỉ có số liệu dung lượng dạng text) và nút "Download All" dạng .zip.
- Đã hỏi người dùng trước khi cài `jszip` (thư viện zip, chưa có trong danh sách
  `ROADMAP.md`) — được đồng ý.
- Đã làm:
  - Cài `jszip` (bundle sẵn type TypeScript, không cần `@types` riêng).
  - Sửa `src/components/tools/ImageCompressor.tsx`:
    - Thêm `previewUrl` (tạo bằng `URL.createObjectURL(file)` ngay khi thêm ảnh) và
      `compressedPreviewUrl` (tạo sau khi nén xong) vào state từng item — hiển thị 2
      thumbnail 64×64 cạnh nhau (ảnh gốc → mũi tên → ảnh đã nén) kèm alt text mô tả đầy đủ
      (đáp ứng checklist SEO alt text).
    - Track mọi object URL đã tạo trong 1 `useRef<Set>`, revoke tất cả trong cleanup của
      `useEffect` khi component unmount — tránh leak memory vì object URL không tự giải
      phóng, và component này (khác các tool trước) tạo khá nhiều URL nếu người dùng
      upload nhiều ảnh.
    - Thêm `handleDownloadAll`: dùng `JSZip` gộp toàn bộ `compressedBlob` đã nén xong
      thành 1 file `compressed-images.zip`, chỉ hiện nút khi có > 1 ảnh đã nén xong
      (`doneCount > 1`) — nén 1 ảnh thì nút tải riêng lẻ đã đủ, không cần zip 1 file.
  - Thêm key i18n `ui.downloadAll` cho cả 8 ngôn ngữ trong `tool-image-compress.json`
    (dạng "Download All (.zip)" dịch tự nhiên từng ngôn ngữ), cập nhật
    `ImageCompressPage.astro` truyền message mới.
  - `npm run build` sạch, 89 trang.
  - **Test tương tác thật** (không chỉ tin build sạch/HTML tĩnh như phần lớn task trước) —
    viết 1 script Node dùng Chrome DevTools Protocol thuần (không cài puppeteer/playwright,
    dùng `WebSocket`/`fetch` built-in của Node 22) để: mở trang thật qua `npm run preview`,
    dùng `DOM.setFileInputFiles` set 2 file ảnh test vào đúng input, bấm nút Nén qua
    `Runtime.evaluate`, chờ và xác nhận cả 2 ảnh nén xong + 4 thẻ `<img>` preview hiện đúng
    (2 gốc + 2 đã nén), bấm "Download All", xác nhận 1 file `.zip` thật được tải xuống
    (231 bytes cho 2 ảnh test 68 bytes). Toàn bộ pass. Có chụp ảnh màn hình cuối cùng xác
    nhận UI đúng như thiết kế.
- Quyết định kỹ thuật quan trọng:
  - Không thêm nút xóa từng ảnh khỏi danh sách (không có trong checklist Phase 1.5, không
    tự ý mở rộng phạm vi) — giữ đúng scope 2 mục còn thiếu.
  - Nút "Download All" chỉ hiện khi `doneCount > 1` thay vì luôn hiện — tránh UI thừa khi
    chỉ có 1 ảnh (nút tải riêng lẻ đã đủ dùng).
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Ảnh test dùng để verify là PNG 1×1 pixel tổng hợp (không phải ảnh thật) nên % giảm dung
    lượng ra số ÂM (-40%, vì overhead định dạng lớn hơn nội dung cho ảnh siêu nhỏ) — đây là
    đặc thù của ảnh test, KHÔNG phải lỗi công thức tính (`1 - compressedSize/originalSize`
    vẫn đúng, ảnh thật vài trăm KB-vài MB sẽ luôn ra số dương như mong đợi).
  - Script test CDP (`cdp-test.js`) lưu trong thư mục scratchpad của phiên, không phải file
    dự án — nếu muốn tái sử dụng cho các tool khác ở Phase 1.5 cần viết lại/tham số hóa
    (chọn selector input, tên nút Compress khác nhau theo từng tool).
- Task tiếp theo: Phase 1.5, tool #2 "Chuyển đổi định dạng ảnh".

### 2026-07-25 — Redesign toàn site theo mockup `Web Tool Hub.dc.html` (ngoài ROADMAP.md)
- Bối cảnh: sau khi hoàn tất Phase 1, người dùng để lại 1 file mockup thiết kế
  `Web Tool Hub.dc.html` ở gốc repo và yêu cầu trực tiếp "dùng thiết kế của file đó" +
  "thiết kế các màn hình khác dựa trên file đó". File này xuất từ 1 công cụ thiết kế khác
  (dùng custom element `<x-dc>`, style dạng JS object + template `{{ }}`) — KHÔNG copy
  nguyên code (không tương thích Astro/Tailwind/Shadcn), chỉ dùng làm tài liệu tham khảo
  ngôn ngữ thiết kế (màu sắc, font, layout, spacing).
- Đã hỏi người dùng 2 câu hỏi phạm vi trước khi làm: (1) áp dụng toàn site hay chỉ trang
  chủ → chọn **toàn site**; (2) nguồn font Space Grotesk/JetBrains Mono — Google Fonts CDN
  (như mockup) hay tự host → chọn **tự host qua `@fontsource-variable`** (khớp cách dự án
  đã làm với font Geist cũ, tránh gọi ra ngoài).
- Đã làm:
  - Gỡ `@fontsource-variable/geist`, cài `@fontsource-variable/space-grotesk` +
    `@fontsource-variable/jetbrains-mono`. Cập nhật `src/styles/global.css`: `--font-sans`
    → Space Grotesk, thêm `--font-mono` → JetBrains Mono.
  - Viết lại toàn bộ token màu Shadcn (`:root`/`.dark` trong `global.css`) sang bảng màu
    của mockup (bg/card/border/text riêng cho light và dark, accent emerald, thêm 2 biến
    mới `--privacy-bar-bg`/`--privacy-bar-fg` cho thanh privacy bar tối màu cố định không
    theo theme).
  - Thêm `letter` (IMG/PDF/TXT/DEV — mã hiển thị cố định, không dịch, giống cách "PDF"
    không dịch) và `hue` (0/45/100/160) vào `src/data/categories.ts` để tô màu badge từng
    danh mục bằng kỹ thuật CSS `filter: hue-rotate()` trên cùng 1 màu accent — đúng kỹ
    thuật mockup dùng để có 4 màu hài hòa từ 1 token duy nhất thay vì tự định nghĩa 4 màu
    rời rạc.
  - Viết lại `PrivacyBanner.astro` (thanh mono nhỏ, nền tối cố định), `Header.astro` (logo
    mark `>_` + tên site, ô tìm kiếm CÓ ĐIỀU KIỆN qua prop `showSearch` — chỉ hiện ở trang
    có JS lọc thật, tránh UI giả không hoạt động trên trang tool), `Sidebar.astro` (badge
    chữ viết tắt + đếm số tool mỗi nhóm, đọc trực tiếp từ `tools.ts`), `Footer.astro` (1
    dòng giữa trang, có thêm key `footer.tagline` mới), restyle nhẹ `ThemeToggle.astro`/
    `LanguageSwitcher.astro` cho khớp bo góc/kích thước mới.
  - Viết lại hoàn toàn trang chủ `src/pages/[locale]/index.astro`: hero (kicker + heading +
    tagline + 3 stat chip: số tool/số nhóm/"0 KB ever uploaded"), grid card danh mục (2
    cột), MỖI card liệt kê tool kèm mũi tên hiện khi hover. **Nhân tiện dọn nợ kỹ thuật cũ**
    đã ghi trong log Phase 0: xoá nút `<Button client:load>Shadcn Button OK</Button>` demo
    còn sót lại từ lúc setup Shadcn, không phục vụ mục đích gì từ Phase 1.
  - **Thêm tính năng tìm kiếm lọc tool trực tiếp trên trang chủ** (không có trong scope gốc
    của `ROADMAP.md`, nhưng mockup thể hiện rõ đây là 1 phần thiết kế/tương tác, không chỉ
    trang trí) — dùng JS thuần (không React) trong `<script>` cuối `index.astro`: input với
    id `tool-search` (render trong `Header` qua prop `showSearch`), lọc bằng cách so khớp
    `data-tool-name` trên từng link tool, ẩn/hiện qua class `hidden`, ẩn card danh mục nếu
    không còn tool nào khớp, hiện thông báo "không tìm thấy" khi cần. Không dùng React vì
    đây chỉ là filter DOM đơn giản, đúng tinh thần "JS thuần khi có thể" đã áp dụng cho các
    tool JS-only trước đó.
  - Thêm key i18n mới cho cả 8 ngôn ngữ trong `common.json`: `home.kicker`,
    `home.stats.{tools,categories,uploaded}`, `search.{placeholder,noResults}`,
    `sidebar.note`, `footer.tagline`; viết lại nội dung `home.heading`/`home.tagline` theo
    đúng câu chữ mockup (dịch tự nhiên riêng từng ngôn ngữ, không máy móc).
  - `npm run build` sinh đủ 89 trang không lỗi. Chạy `npm run preview` + chụp ảnh bằng
    Chrome headless (`--screenshot`, và `--force-dark-mode` để xem đúng theme tối) cho cả
    trang chủ và 1 trang tool (`split-pdf`) — xác nhận bằng mắt giao diện khớp mockup ở cả
    2 theme, không chỉ tin vào build sạch/HTML tĩnh như các task trước.
  - Chạy Lighthouse trên trang chủ sau khi đổi giao diện: phát hiện Accessibility tụt còn
    95 (trước đó 100) do `color-contrast` — chữ mono nhỏ màu accent (`text-primary`) trên
    nền sáng chỉ đạt tỉ lệ tương phản 2.36 (cần ≥4.5), tương tự badge chữ trắng trên nền
    accent (2.53) và text phụ dùng `/70` opacity ở Footer/Sidebar (2.87). Đây là lỗi thật
    (ảnh hưởng người dùng khiếm thị), không bỏ qua dù 95 điểm đã đạt ngưỡng ≥90 của
    `CLAUDE.md`.
  - **Sửa contrast**: đổi `--primary` (nền đặc dùng cho nút/badge, CẢ 2 theme) từ
    `#10B981` sang `#047857` (đậm hơn, vẫn rõ ràng là "xanh emerald" nhưng chữ trắng trên
    nền này đạt ~5.3:1). Với 2 chỗ dùng màu accent làm CHỮ trực tiếp trên nền trang (kicker
    ở hero, logo mark `>_`), tách riêng dùng `text-emerald-700 dark:text-emerald-400`
    (không qua token `--primary` dùng chung) vì 2 theme cần độ sáng khác nhau để đủ tương
    phản trên nền riêng của từng theme. Bỏ hết `/70` opacity ở text phụ trong
    `Footer.astro`/`Sidebar.astro`, vì bản thân `--muted-foreground` đã đủ tương phản
    (~5.2:1) — giảm opacity là nguyên nhân duy nhất gây lỗi.
  - Build lại + chạy Lighthouse lần 2: **Performance 99, Accessibility 100, Best Practices
    100, SEO 100**. Chụp lại ảnh xác nhận màu emerald đậm hơn vẫn giữ đúng tinh thần thiết
    kế, không bị "chìm"/xỉn màu.
- Quyết định kỹ thuật quan trọng:
  - KHÔNG commit file mockup `Web Tool Hub.dc.html` vào git — không phải mã nguồn dự án,
    chỉ là tài liệu thiết kế tham khảo của người dùng, để nguyên trong working directory
    (không xoá).
  - Ô tìm kiếm trong `Header` chỉ hiện khi trang truyền `showSearch` (hiện tại chỉ trang
    chủ) — tránh hiển thị UI tìm kiếm "chết" (không hoạt động) trên 10 trang tool, đúng
    nguyên tắc "không xây UI nửa vời" đã nêu trong hướng dẫn hành vi chung.
  - Không thêm badge "New" cho tool nào trên trang chủ dù mockup có ví dụ minh hoạ badge
    này — dự án không có dữ liệu "tool nào thực sự mới" đáng tin cậy trong `tools.ts`, thêm
    badge tuỳ tiện sẽ là bịa dữ liệu thay vì phản ánh thực tế.
  - Giữ nguyên cấu trúc token Shadcn hiện có (`--primary`, `--card`, `--muted`...) thay vì
    viết CSS tuỳ biến riêng — đảm bảo `Button`/component Shadcn khác ở 10 trang tool tự
    động ăn theme mới mà không cần sửa từng trang.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa test tương tác thật bằng chuột/bàn phím thật (gõ vào ô tìm kiếm xem lọc đúng
    không, bấm toggle sidebar mobile, bấm đổi theme) — chỉ verify qua ảnh chụp Chrome
    headless tĩnh (2 theme) + đọc code logic script. Nên tự thử tay khi có dịp.
  - Thanh JSON editor (`jsoneditor`, tool #8) vẫn giữ theme sáng riêng bất kể theme site
    (giới hạn đã ghi nhận từ trước, không đổi trong lần redesign này).
  - Category `DEV` hiện chỉ có 2 tool thật (JSON Formatter, QR Generator) — card "Dev
    Tools" trên trang chủ có khoảng trống dưới do card khác trong hàng cao hơn (grid 2 cột
    không đồng chiều cao) — chấp nhận được ở v1, có thể cân nhắc `items-start` hoặc masonry
    nếu thấy chưa ổn khi có thêm tool Phase 3.
- Task tiếp theo: theo con trỏ ROADMAP.md mới nhất — **Phase 1.5**, bắt đầu từ công cụ #1
  "Nén ảnh" (xem "Trạng thái hiện tại" phía trên).

### 2026-07-25 — Phase 1, công cụ #10 (CUỐI CÙNG): Chuyển đổi Case văn bản — HOÀN TẤT Phase 1
- Đã làm:
  - Tạo `src/components/tools/TextCaseConverter.tsx` (React, `client:load`), JS thuần
    không dùng thư viện: 1 textarea nhập, hàng nút chọn 1 trong 5 kiểu case
    (UPPERCASE/lowercase/Title Case/camelCase/snake_case), 1 textarea kết quả read-only
    tính bằng `useMemo` (cập nhật ngay khi đổi text hoặc đổi nút chọn), nút Sao chép
    (`navigator.clipboard.writeText`) và nút Xóa hết.
  - Viết hàm `splitWords()` dùng chung cho camelCase/snake_case: trước khi tách từ theo
    khoảng trắng/gạch ngang/gạch dưới/dấu câu, tự động chèn khoảng trắng tại các ranh giới
    chữ-thường-sang-chữ-hoa và CHUỖI-HOA-sang-Chữ-hoa-thường có sẵn — nghĩa là dán
    `"hello-world"`, `"Hello World"`, hay thậm chí `"helloWorld"` đã có case sẵn đều ra
    cùng 1 kết quả đúng, không bị dính chữ thành `"helloworld"` hay tách sai.
  - Tạo `src/components/tools/TextCaseConverterPage.astro`: theo khuôn các trang tool
    trước, JSON-LD `WebApplication`, nội dung hướng dẫn 4 đoạn/ngôn ngữ, link tới 2 tool
    cùng category `text` (So sánh văn bản, Đếm từ & ký tự). Với `ja`/`ko`, ghi rõ trong
    bài viết rằng bản thân văn bản tiếng Nhật/Hàn không có khái niệm hoa/thường như chữ
    Latin, nên tính năng này chủ yếu hữu ích với định danh/từ tiếng Anh xen trong văn bản.
  - Tạo 8 file dictionary i18n `tool-text-case-converter.json`.
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh
    `toolId === 'text-case-converter'` — đây là nhánh cuối cùng, tất cả 10 tool trong
    `src/data/tools.ts` giờ đều có UI thật, không còn tool nào rơi vào nhánh "coming soon"
    mặc định.
  - `npm run build` sinh đủ 89 trang không lỗi; đọc thử
    `dist/en/tools/text-case-converter/index.html` xác nhận title/heading/UI đúng.
- Quyết định kỹ thuật quan trọng:
  - Chỉ làm đúng 5 kiểu case nêu trong `ROADMAP.md` (không tự thêm PascalCase/kebab-case/
    CONSTANT_CASE dù kỹ thuật rất dễ thêm) — giữ đúng phạm vi task đã định, tránh
    over-engineer.
  - UI dùng nút bấm + 1 khung kết quả (thay vì hiện cả 5 kết quả cùng lúc) — nhất quán với
    cách chọn 1-trong-nhiều bằng radio ở Text Diff Checker, và tránh màn hình bị rối với 5
    khung văn bản cùng lúc.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa test tương tác thật (gõ trực tiếp, bấm từng nút case, bấm Sao chép xem có copy
    đúng vào clipboard) trên trình duyệt thật — chỉ verify qua `npm run build` + đọc HTML
    tĩnh, giống tình trạng chung của các tool trước.
  - `navigator.clipboard.writeText` yêu cầu HTTPS hoặc `localhost` mới hoạt động (Clipboard
    API bị trình duyệt chặn trên HTTP thường) — không phải vấn đề vì Cloudflare luôn phục
    vụ qua HTTPS, nhưng cần nhớ nếu sau này test bằng `npm run preview` qua HTTP thuần trên
    mạng LAN thì nút Sao chép có thể không hoạt động.
- **Phase 1 — 10 công cụ cốt lõi: HOÀN TẤT toàn bộ 10/10 task.** Toàn bộ 10 trang công cụ
  đều có UI thật, đủ 8 ngôn ngữ, đủ checklist SEO (title/description riêng, JSON-LD,
  nội dung 300-500 từ, link liên quan, sitemap tự động).
- Task tiếp theo: Bắt đầu Phase 2 — mở rộng i18n từ 8 lên 15-20 ngôn ngữ (xem `ROADMAP.md`
  Phase 2, task đầu tiên).

### 2026-07-25 — Phase 1, công cụ #9: QR Code Generator
- Đã làm:
  - Cài `qrcode.react` (đã kèm sẵn type TypeScript, không cần `@types` riêng như
    `jsoneditor`). Component `QRCodeCanvas` của thư viện này có sẵn prop `imageSettings`
    (src/height/width/excavate) — đúng khớp yêu cầu "logo giữa" của `ROADMAP.md`, không
    cần tự viết logic vẽ logo đè lên canvas bằng tay.
  - Tạo `src/components/tools/QrCodeGenerator.tsx` (React, `client:load`): ô nhập
    text/URL, 2 input `type="color"` (màu chính/màu nền), thanh trượt kích thước
    (128-512px), input file chọn logo (đọc qua `FileReader.readAsDataURL` — không upload
    đi đâu), nút xóa logo, nút tải PNG (lấy `canvasRef.current.toDataURL('image/png')` —
    `QRCodeCanvas` forward ref thẳng ra thẻ `<canvas>` nên không cần `querySelector`).
    Luôn set `level="H"` (mức sửa lỗi cao nhất, ~30% dự phòng) vì logo đè lên giữa mã sẽ
    che mất một phần dữ liệu — mức H đảm bảo mã vẫn quét được.
  - Tạo `src/components/tools/QrCodeGeneratorPage.astro`: theo khuôn các trang tool
    trước, JSON-LD `WebApplication` (`DeveloperApplication`), nội dung hướng dẫn 4
    đoạn/ngôn ngữ giải thích vì sao nên tạo QR tại chỗ thay vì qua dịch vụ rút gọn link có
    theo dõi, link tới tool cùng category `dev` (JSON Formatter).
  - Tạo 8 file dictionary i18n `tool-qr-generator.json`.
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh `toolId === 'qr-generator'`.
  - `npm run build` sinh đủ 89 trang không lỗi ngay từ lần đầu (không gặp vấn đề SSR như
    tool #8 vì `qrcode.react` là component React chuẩn, không đụng global browser-only ở
    module scope).
- Quyết định kỹ thuật quan trọng:
  - Không tự vẽ QR code bằng canvas tay (dù `ROADMAP.md` có nhắc "Canvas") — dùng
    `QRCodeCanvas` của `qrcode.react` vì nó ĐÃ render ra đúng 1 thẻ `<canvas>` HTML thật
    (đáp ứng đúng yêu cầu công nghệ), tự lo phần mã hóa QR (thuật toán Reed-Solomon phức
    tạp) và excavate vùng logo — tự viết lại từ đầu là việc thừa, rủi ro cao hơn.
  - Mặc định luôn dùng `level="H"` kể cả khi không có logo — đơn giản hóa logic (không cần
    tính lại mức sửa lỗi mỗi khi bật/tắt logo), và mức H không có nhược điểm đáng kể ngoài
    mã hơi dày hơn cho cùng nội dung, chấp nhận được.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa test tương tác thật (đổi màu, upload logo thật, quét thử mã QR bằng điện thoại)
    trên trình duyệt thật — chỉ verify qua `npm run build` + đọc HTML tĩnh.
  - Chưa validate URL hợp lệ hay giới hạn độ dài text đầu vào — người dùng nhập gì cũng
    được mã hóa (kể cả text thường, không nhất thiết phải là URL), đúng tinh thần tên tool
    "QR Code Generator" chung chung, không giới hạn riêng cho URL.
- Task tiếp theo: Phase 1, công cụ #10 (CUỐI CÙNG) "Chuyển đổi Case văn bản"
  (upper/lower/Title/camelCase/snake_case), JS thuần.

### 2026-07-25 — Phase 1, công cụ #8: JSON Formatter & Validator
- Đã làm:
  - Hỏi người dùng chọn giữa Monaco editor và jsoneditor (2 lựa chọn `ROADMAP.md` để mở)
    — người dùng chọn **jsoneditor** vì nhẹ hơn, ít rủi ro ảnh hưởng điểm Lighthouse
    Performance hơn Monaco (Monaco nặng ~2-3MB và cần cấu hình Web Worker riêng cho ngôn
    ngữ, phức tạp hơn nhiều so với nhu cầu thực tế của 1 tool định dạng JSON).
  - Cài `jsoneditor` (dependency) + `@types/jsoneditor` (devDependency, vì package gốc
    không kèm sẵn type declaration).
  - Tạo `src/types/jsoneditor-minimalist.d.ts`: khai báo ambient module cho subpath
    `jsoneditor/dist/jsoneditor-minimalist.js` (bản **minimalist** — loại bỏ Ace editor,
    ajv, vanilla-picker — giảm từ ~210KB xuống ~70KB gzip), tái sử dụng type có sẵn từ
    `@types/jsoneditor` vì bản đầy đủ và bản minimalist có cùng API bề mặt (chỉ khác chế
    độ `code` không khả dụng, mà tool này không dùng chế độ đó).
  - Tạo `src/components/tools/JsonFormatter.tsx` (React, `client:load`): widget
    `jsoneditor` là thư viện vanilla JS tự quản lý DOM riêng, nên khởi tạo bằng
    `useEffect` (tạo instance khi mount, `destroy()` khi unmount) thay vì điều khiển qua
    React state như các component khác — đây là cách chuẩn để bọc 1 thư viện widget
    non-React trong React island. Bật 2 chế độ `text` (dán JSON thô, có nút Format/Compact
    sẵn trong thanh công cụ mặc định của thư viện) và `tree` (duyệt cây tương tác,
    mở/đóng/sửa từng node) — validate lỗi cú pháp tự động hiển thị sẵn trong UI của thư
    viện (không cần tự viết thêm UI báo lỗi).
  - Tạo `src/components/tools/JsonFormatterPage.astro`: theo khuôn các trang tool trước —
    title/description theo từ khóa "json formatter"/"json validator", JSON-LD
    `WebApplication` (`applicationCategory: DeveloperApplication` thay vì
    `UtilitiesApplication` vì đây rõ ràng là công cụ cho dev), nội dung hướng dẫn 4
    đoạn/ngôn ngữ, link tới tool cùng category `dev` (QR Code Generator — dù chưa có UI
    thật, route vẫn tồn tại nên link không chết, chỉ tạm rơi vào trang "coming soon").
  - Tạo 8 file dictionary i18n `tool-json-formatter.json`. **Tự phát hiện và sửa 1 lỗi gõ
    nhầm** trong bản tiếng Pháp (`p2` ban đầu lỡ gõ "Il repose sur pdf-lib — non, sur
    jsoneditor..." — vết tích copy nhầm từ ngữ cảnh tool PDF trước đó) trước khi commit.
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh `toolId === 'json-formatter'`.
  - `npm run build` sinh đủ 89 trang không lỗi; đọc thử
    `dist/en/tools/json-formatter/index.html` xác nhận title/heading đúng.
- Quyết định kỹ thuật quan trọng:
  - Không theme lại `jsoneditor` để khớp dark mode của site — thư viện này không hỗ trợ
    dark theme sẵn cho chế độ `text`/`tree` (chỉ chế độ `code` dùng Ace mới có option
    `theme`, mà bản minimalist không dùng chế độ đó). Chấp nhận widget giữ giao diện sáng
    riêng (ghi rõ 1 dòng chú thích nhỏ ngay dưới editor cho người dùng biết đây là hành vi
    có chủ đích, không phải lỗi UI) thay vì tự viết CSS override phức tạp cho một thư viện
    bên thứ ba — đúng tinh thần "không over-engineer" của dự án.
  - Không dùng JSON Schema validation (`ajv`, option `schema`) — tool này chỉ cần validate
    cú pháp JSON cơ bản, không có khái niệm "schema chuẩn" nào để so khớp; đây cũng là lý
    do chọn bản minimalist thay vì bản đầy đủ.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa test tương tác thật (dán JSON lỗi, xem thông báo lỗi, chuyển đổi qua lại
    text/tree mode) trên trình duyệt thật — chỉ verify qua `npm run build` + đọc HTML
    tĩnh. Vì đây là lần đầu tích hợp một thư viện widget non-React khá phức tạp
    (`useEffect` + cleanup + DOM ngoài React), nên ưu tiên test tay thật sớm nếu có dịp mở
    dev server, rủi ro cao hơn các tool JS thuần trước.
  - Chưa chạy Lighthouse riêng cho trang này để xác nhận `jsoneditor` (dù đã chọn bản nhẹ
    nhất) không kéo điểm Performance xuống dưới ngưỡng 90 — nên làm ở lần kiểm tra
    Lighthouse toàn site kế tiếp (Phase 2).
- Task tiếp theo: Phase 1, công cụ #9 "QR Code Generator" (tùy chỉnh màu, logo giữa) dùng
  `qrcode.react` + Canvas.

### 2026-07-25 — Phase 1, công cụ #7: Đếm từ & ký tự
- Đã làm:
  - Tạo `src/components/tools/WordCounter.tsx` (React, `client:load`): 1 ô textarea, các
    chỉ số (số từ, số ký tự, số ký tự không tính khoảng trắng, số câu, số đoạn văn, thời
    gian đọc ước tính) tính bằng `useMemo` và **cập nhật trực tiếp khi gõ** — không có nút
    "tính toán" vì đây là phép đếm JS thuần cực nhẹ, không cần bước xử lý riêng biệt như
    các tool trước (khác với Diff Checker cần bấm "So sánh" vì thuật toán diff tốn hơn).
    Số câu đếm theo dấu kết thúc câu (`.`, `?`, `!`); số đoạn văn tính theo khối văn bản
    cách nhau bởi dòng trống; thời gian đọc ước tính theo tốc độ trung bình 200 từ/phút,
    làm tròn lên tối thiểu 1 phút. Có nút "Xóa hết".
  - Tạo `src/components/tools/WordCounterPage.astro`: theo đúng khuôn các trang tool
    trước — title/description riêng theo từ khóa "word counter"/"character counter",
    JSON-LD `WebApplication` giá 0 USD, nội dung hướng dẫn 4 đoạn/ngôn ngữ, link tới 2 tool
    cùng category `text` (So sánh văn bản, và tool #10 Chuyển đổi Case khi được làm).
  - Tạo 8 file dictionary i18n `tool-word-counter.json` — dịch tay riêng cho từng ngôn
    ngữ; với `ja`/`ko`, chú thích rõ trong bài viết rằng số liệu "số từ" chỉ mang tính
    tham khảo vì 2 ngôn ngữ này không tách từ bằng khoảng trắng như các ngôn ngữ Latin.
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh `toolId === 'word-counter'` →
    `<WordCounterPage lang={locale} />`.
  - `npm run build` sinh đủ 89 trang không lỗi; đọc thử
    `dist/en/tools/word-counter/index.html` và `dist/vi/tools/dem-tu-va-ky-tu/index.html`
    xác nhận title/heading/link liên quan đúng.
- Quyết định kỹ thuật quan trọng:
  - Không dùng thư viện đếm từ nào — đúng chỉ định "JS thuần" trong `ROADMAP.md`, phép
    đếm dựa trên `split`/`match`/regex cơ bản là đủ chính xác cho mục đích công cụ này.
  - Cập nhật số liệu live theo từng ký tự gõ (không cần nút bấm) — khác pattern
    "chọn file rồi bấm nút xử lý" của các tool trước, vì đây là phép tính tức thời trên
    text đã có sẵn trong bộ nhớ, không có bước I/O hay xử lý nặng nào cần chờ.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Số câu/đoạn văn dùng heuristic đơn giản (regex dấu câu, dòng trống) nên có thể đếm
    sai với văn bản không theo chuẩn (danh sách gạch đầu dòng không có dấu chấm, văn bản
    dùng dấu câu Á Đông như `。`) — đã ghi rõ giới hạn này trong nội dung SEO thay vì giả
    vờ chính xác tuyệt đối; có thể cải thiện regex cho dấu câu CJK ở Phase 2/3 nếu cần.
  - Chưa test tương tác thật trên trình duyệt (gõ trực tiếp, xem số liệu cập nhật live) —
    chỉ verify qua `npm run build` + đọc HTML tĩnh, giống tình trạng các tool trước.
- Task tiếp theo: Phase 1, công cụ #8 "JSON Formatter & Validator" (Monaco editor hoặc
  jsoneditor).

### 2026-07-25 — Phase 1, công cụ #5: Tách PDF (Split)
- Đã làm:
  - Tạo `src/components/tools/PdfSplitter.tsx` (React, `client:load`): chọn 1 file PDF
    (input hoặc kéo-thả), đọc bằng `PDFDocument.load` để hiển thị tổng số trang. Ô nhập
    "khoảng trang" dạng text tự do (VD `1-3, 4, 5-7`) — mỗi nhóm cách nhau dấu phẩy tách
    thành 1 file PDF kết quả riêng; để trống thì mặc định tách MỖI TRANG thành 1 file
    riêng (dùng `Array.from({length: pageCount})` sinh range 1 trang). Parse range bằng
    regex đơn giản (`^\d+$` hoặc `^\d+-\d+$`), validate trong khoảng `1..pageCount`, ném
    lỗi kiểu `RangeParseError` riêng (không dùng string-matching mong manh) để phân biệt
    rõ với lỗi đọc PDF khi hiển thị thông báo lỗi đúng loại. Mỗi file kết quả có nút tải
    riêng (giống pattern `PdfMerger`/`ImageCompressor`) — không dùng zip vì không có trong
    danh sách dependency được phép của `ROADMAP.md`.
  - Tạo `src/components/tools/PdfSplitPage.astro`: bám sát khuôn mẫu `PdfMergePage.astro`
    — title/description riêng theo từ khóa "split pdf"/"tách pdf", JSON-LD
    `WebApplication` giá 0 USD, nội dung hướng dẫn 4 đoạn/ngôn ngữ (~300-400 từ), link tới
    2 tool cùng category `pdf` (Gộp PDF, và tool #10 nếu category liên quan — thực tế
    Phase 1 category `pdf` hiện chỉ có 2 tool nên link 1 chiều rõ ràng tới Gộp PDF).
  - Tạo 8 file dictionary i18n `tool-pdf-split.json`, dịch tay riêng cho từng ngôn ngữ
    (không AI-spin lặp cấu trúc y hệt nhau — mỗi bản dịch giữ đúng văn phong/cách diễn đạt
    tự nhiên của ngôn ngữ đó, theo đúng phong cách đã dùng ở `tool-pdf-merge.json`).
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh `toolId === 'pdf-split'` →
    `<PdfSplitPage lang={locale} />`.
  - `npm run build` sinh đủ 89 trang không lỗi; đọc thử
    `dist/en/tools/split-pdf/index.html` và `dist/vi/tools/tach-pdf/index.html` xác nhận
    title/heading/UI đúng.
- Quyết định kỹ thuật quan trọng:
  - Không dùng thư viện zip để gộp nhiều file kết quả thành 1 lần tải — giữ đúng nguyên
    tắc "không thêm dependency ngoài danh sách `ROADMAP.md`", mỗi file kết quả có nút tải
    riêng là đủ cho v1, giống cách tool Nén ảnh (#1) đã quyết định trước đó.
  - Định dạng "khoảng trang" nhập tay dạng text (`1-3, 4, 5-7`) thay vì UI chọn trang bằng
    checkbox/thumbnail — đơn giản, nhất quán với các input dạng text khác trong dự án,
    tránh phải render thumbnail từng trang PDF (tốn thêm xử lý/dependency render PDF
    không cần thiết cho v1).
  - Không bọc trong Web Worker riêng — lý do giống hệt tool Gộp PDF (#4): thao tác copy
    trang bằng `pdf-lib` là xử lý byte nhanh, không phải suy luận ML hay giải mã pixel.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa test tương tác thật (chọn PDF thật, nhập range, tải từng file kết quả) trên
    trình duyệt thật — chỉ verify qua `npm run build` + đọc HTML tĩnh, giống tình trạng
    các tool PDF/ảnh trước.
  - Category `pdf` hiện có đúng 2 tool (Gộp PDF, Tách PDF) nên phần "công cụ liên quan"
    của cả 2 trang chỉ hiện 1 link chéo nhau — sẽ tự động có thêm lựa chọn nếu Phase 3 bổ
    sung tool PDF khác, không cần sửa gì thêm (logic lọc theo `category` đã tổng quát).
- Task tiếp theo: Phase 1, công cụ #7 "Đếm từ & ký tự" (JS thuần).

### 2026-07-25 — Sửa `.git/index` hỏng + gộp (merge) công cụ #4 và #6 từ worktree agent
- Bối cảnh: người dùng yêu cầu kiểm tra xem các chức năng đã code có được gộp vào `main`
  và đã push lên GitHub chưa. Khi chạy `git status`, phát hiện `.git/index` của repo
  chính bị hỏng (`fatal: index file corrupt`, file toàn byte `0x00`) — chặn mọi lệnh cần
  đọc index. Đào sâu bằng các lệnh git không cần index (`cat-file`, `log`,
  `worktree list`) phát hiện `.claude/worktrees/` còn 3 worktree phụ (dấu vết background
  agent chạy song song ở phiên trước):
  - `agent-a3473eb7a9c0f0cfc` → branch riêng, commit `198efe5` = code đầy đủ **công cụ #4
    Gộp PDF (Merge)** dùng `pdf-lib` (component + trang SEO + 8 file i18n).
  - `agent-a28729a2e6a090b60` → branch riêng, commit `aa89f80` = code đầy đủ **công cụ #6
    So sánh văn bản (Diff Checker)** dùng `diff` (jsdiff).
  - Cả hai agent CỐ Ý không sửa `[slug].astro`/`ROADMAP.md`/`PROGRESS.md` (ghi rõ trong
    commit message, để tránh xung đột khi chạy song song) — bước tích hợp cuối cùng chưa
    từng xảy ra, nhiều khả năng đúng lúc đó `.git/index` bị hỏng (tiến trình bị ngắt giữa
    chừng).
  - `agent-a494ece694ff1143f` — worktree thứ 3 hỏng hẳn, ref branch là 41 byte NUL thuần
    (không phải SHA hợp lệ), thư mục chưa từng `npm install`/có commit nào — agent bị
    crash/kill ngay từ bước khởi tạo, không có gì để cứu.
- Đã làm:
  - Xóa `.git/index` rồi `git reset` (mixed reset, đọc lại index từ `HEAD` tree) — không
    đụng working tree, không mất commit nào (toàn bộ lịch sử `main` vẫn nguyên vẹn).
  - `git merge worktree-agent-a3473eb7a9c0f0cfc` (công cụ #4) — fast-forward sạch.
  - `git merge worktree-agent-a28729a2e6a090b60` (công cụ #6) — auto-merge sạch
    (`package.json`/`package-lock.json` chỉ conflict do thêm dependency ở vị trí khác
    nhau, git tự resolve đúng).
  - Hoàn tất phần tích hợp mà 2 agent cố ý bỏ qua: thêm 2 nhánh `toolId === 'pdf-merge'`
    và `toolId === 'text-diff'` vào `src/pages/[locale]/tools/[slug].astro`; tick `[x]`
    task #4 và #6 trong `ROADMAP.md`.
  - Dọn worktree: `git worktree remove` 2 worktree đã merge xong + xóa 2 branch
    `worktree-agent-*` tương ứng (an toàn vì đã nằm trong lịch sử `main`); force-remove
    worktree hỏng `agent-a494ece694ff1143f` + xóa ref hỏng của nó.
  - `npm run build` sạch, đọc `dist/en/tools/merge-pdf/index.html` và
    `dist/en/tools/text-diff-checker/index.html` xác nhận route mới sinh trang đúng.
  - `git push origin main` — đồng bộ lại với remote sau khi merge.
- Quyết định kỹ thuật quan trọng:
  - Không squash 2 commit gốc của agent — giữ nguyên lịch sử/tác giả (`Co-Authored-By`),
    chỉ thêm 1 commit riêng cho phần wiring + ROADMAP/PROGRESS.
  - Không thử "cứu" worktree hỏng thứ 3 — ref bị hỏng ở mức byte (NUL thuần), không phải
    lỗi git logic có thể phục hồi bằng lệnh git thông thường, và thư mục không có commit
    nào để mất.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Nguyên nhân gốc khiến `.git/index` và ref của worktree thứ 3 bị hỏng cùng lúc nhiều
    khả năng là tiến trình agent bị kill/crash đột ngột (mất điện, force-kill...) giữa
    lúc đang ghi file — nếu hiện tượng này lặp lại, cần điều tra tại sao tiến trình bị
    ngắt đột ngột thay vì chỉ sửa hậu quả như lần này.
  - Code của công cụ #4 và #6 do agent khác viết, phiên này CHƯA tự test tương tác thật
    trên trình duyệt (chọn PDF/gộp, dán văn bản/so sánh) — chỉ verify qua `npm run build`
    + đọc HTML tĩnh, giống tình trạng các tool trước.
- Task tiếp theo: Phase 1, công cụ #5 "Tách PDF (Split)" dùng `pdf-lib`.

### 2026-07-24 — Phase 1, công cụ #3: Xóa nền ảnh (AI, chạy local)
- Đã làm:
  - Cài `@imgly/background-removal` — build lỗi ngay lần đầu vì package này khai báo
    `onnxruntime-web` là **peerDependency** (không phải dependency thường), npm không tự
    cài kèm nên Vite/Rolldown báo lỗi không resolve được `onnxruntime-web/webgpu` (import
    động có điều kiện trong package, dùng khi bật tăng tốc WebGPU). Sửa bằng cách
    `npm install onnxruntime-web@1.21.0` (đúng version peer yêu cầu) — build sạch ngay sau
    đó.
  - Tạo `src/components/tools/BackgroundRemover.tsx` (React, `client:load`): chọn ảnh
    (kéo-thả/click), gọi `removeBackground(file, { output: { format: 'image/png' },
    progress })` — callback `progress` cập nhật % hiển thị trực tiếp trên từng ảnh đang xử
    lý. Hiển thị thumbnail ảnh gốc VÀ ảnh kết quả (nền trong suốt, có pattern caro làm nền
    thumbnail để nhìn rõ vùng trong suốt) — đây là tool đầu tiên có `<img>` thật, đã thêm
    `alt` mô tả đầy đủ theo đúng checklist SEO. Tải xuống luôn là PNG (bắt buộc vì cần kênh
    alpha).
  - Có 1 dòng `modelNotice` ngay dưới khung chọn ảnh, giải thích rõ: lần đầu bấm sẽ tải một
    model AI nhỏ (vài MB) về máy, sau đó chạy hoàn toàn offline — nhấn mạnh ảnh CỦA NGƯỜI
    DÙNG không bao giờ được tải lên, phân biệt rõ với việc tải model (dữ liệu công khai, đi
    một chiều xuống máy) để không gây hiểu lầm với banner "100% Privacy" toàn site.
  - Tạo `src/components/tools/BackgroundRemoverPage.astro`: đầy đủ checklist SEO như 2 tool
    trước (title/description/JSON-LD/4 đoạn nội dung ~300-350 từ mỗi ngôn ngữ/2 link liên
    quan cùng nhóm `image`).
  - **Refactor `src/i18n/i18next.ts`**: file này đang phình to dần (mỗi tool mới cộng thêm 8
    dòng import + phải sửa object `resources`). Đổi sang dùng
    `import.meta.glob('./locales/*/*.json', { eager: true })` của Vite để tự động quét và
    nạp MỌI file JSON trong `src/i18n/locales/{locale}/{namespace}.json` — từ giờ thêm tool
    mới chỉ cần tạo đúng 8 file JSON `tool-<id>.json`, KHÔNG cần đụng vào `i18next.ts`.
    Build lại xác nhận 2 tool cũ (`image-compress`, `image-convert`) vẫn hoạt động đúng sau
    refactor.
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh `toolId === 'background-remover'`.
  - `npm run build` sinh đủ 89 trang. Đọc `dist/en/tools/remove-background/index.html` xác
    nhận title/heading/link liên quan đúng. Chạy Lighthouse trên
    `http://localhost:4326/en/tools/remove-background/`: **Performance 99, Accessibility
    100, Best Practices 100, SEO 100**; kiểm tra thêm bằng `network-requests` audit của
    Lighthouse xác nhận tổng dung lượng tải khi MỞ TRANG chỉ ~147 KB — model AI (WASM
    runtime ~23 MB + trọng số model) KHÔNG được tải cho tới khi người dùng thật sự bấm nút
    "Xóa nền", đúng như UI đã thông báo.
- Quyết định kỹ thuật quan trọng:
  - Không tự viết Web Worker — `proxyToWorker` là option của `@imgly/background-removal`
    và mặc định `true` theo schema của package, nên thư viện đã tự lo việc này (giống lý do
    ở tool #1).
  - Không tự host model AI trong `public/` (dù có thể) — để mặc định tải từ CDN publicPath
    của package, vì đây là dữ liệu công khai tải VỀ máy người dùng, không phải dữ liệu
    người dùng gửi ĐI, nên không vi phạm nguyên tắc zero-server-cost/privacy của
    `CLAUDE.md`. Tự host sẽ chỉ làm phình kích thước repo mà không có lợi ích rõ ràng.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Cũng như 2 tool trước: chưa test tương tác thật (chọn ảnh, xem thanh tiến trình chạy,
    xem kết quả xóa nền thực tế) trên trình duyệt thật — Lighthouse + đọc HTML tĩnh không
    verify được việc model AI có thực sự chạy đúng.
  - `package.json` giờ có thêm `onnxruntime-web` như dependency trực tiếp (dù về bản chất
    là peer dep của `@imgly/background-removal`) — nếu sau này nâng cấp
    `@imgly/background-removal`, nhớ kiểm tra lại version `onnxruntime-web` yêu cầu có đổi
    không.
- Task tiếp theo: Phase 1, công cụ #4 "Gộp PDF (Merge)" dùng `pdf-lib`.

### 2026-07-24 — Phase 1, công cụ #2: Chuyển đổi định dạng ảnh
- Đã làm:
  - Tạo `src/components/tools/ImageFormatConverter.tsx` (React, `client:load`): chọn nhiều
    ảnh (kéo-thả hoặc click, tái dùng đúng pattern UI từ tool #1), dropdown chọn định dạng
    đích (WebP/JPEG/PNG), thanh trượt chất lượng (ẩn khi đích là PNG vì PNG không nén theo
    quality), nút Chuyển đổi xử lý tuần tự, hiển thị định dạng+dung lượng gốc/sau khi
    chuyển, nút tải xuống đổi đúng phần mở rộng file theo định dạng đích.
  - Dùng thẳng `createImageBitmap()` + `<canvas>` + `canvas.toBlob()` (HTML5 Canvas API
    thuần, đúng như chỉ định trong `ROADMAP.md`) — KHÔNG bọc trong Web Worker riêng, vì thao
    tác decode/draw/encode 1 ảnh qua canvas là tác vụ nhẹ, được trình duyệt tăng tốc phần
    cứng, khác với thuật toán nén lặp nhiều vòng của công cụ #1 (lý do tool #1 cần
    `browser-image-compression` với Worker nội bộ). Khi chuyển sang JPEG, tự động tô nền
    trắng trước khi vẽ ảnh vì JPEG không có kênh alpha (tránh vùng trong suốt bị đổi thành
    màu đen mặc định).
  - Tạo `src/components/tools/ImageConvertPage.astro`: đầy đủ checklist SEO giống tool #1
    (title/description riêng theo từ khóa, JSON-LD `WebApplication` giá 0 USD, nội dung
    hướng dẫn 4 đoạn/ngôn ngữ giải thích JPEG/PNG/WebP khác nhau thế nào, 2 link tới tool
    cùng nhóm `image`).
  - Namespace i18n riêng `tool-image-convert` (8 file JSON) đăng ký vào
    `src/i18n/i18next.ts` — đúng pattern namespace-per-tool đã đặt ra từ tool #1.
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh `toolId === 'image-convert'` →
    `<ImageConvertPage lang={locale} />`, giữ nguyên nhánh `image-compress` và "coming soon".
  - `npm run build` sinh đủ 89 trang không lỗi. Đọc `dist/en/tools/convert-image-format/
    index.html` và `dist/vi/tools/doi-dinh-dang-anh/index.html` xác nhận title/heading/link
    liên quan đúng; đếm từ script Node xác nhận đoạn nội dung EN 316 từ (trong khoảng
    300-500). Lighthouse trên `http://localhost:4325/en/tools/convert-image-format/`:
    **Performance 100, Accessibility 100, Best Practices 100, SEO 100**.
- Quyết định kỹ thuật quan trọng:
  - Không dùng Web Worker cho tool này (khác tool #1) — lý do nêu ở trên; đây là quyết định
    có chủ đích chứ không phải bỏ sót quy tắc Web Worker trong `CLAUDE.md`.
  - Không hỗ trợ chuyển đổi sang GIF/BMP/TIFF hay các định dạng khác — `ROADMAP.md` chỉ nêu
    "chuyển đổi định dạng ảnh" chung chung nhưng ngữ cảnh 10 công cụ đều xoay quanh
    JPEG/PNG/WebP (khớp tool #1), nên giới hạn 3 định dạng này cho nhất quán.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Cũng như tool #1: chưa test tương tác thật (chọn ảnh/kéo-thả/xem preview) trên trình
    duyệt thật, chỉ verify qua HTML tĩnh + Lighthouse.
- Task tiếp theo: Phase 1, công cụ #3 "Xóa nền ảnh (AI, chạy local)" dùng
  `@imgly/background-removal`.

### 2026-07-24 — Phase 1, công cụ #1: Nén ảnh (JPEG/PNG/WebP)
- Đã làm:
  - Cài `browser-image-compression` (thư viện chỉ định trong `ROADMAP.md`) — thư viện này
    tự chạy nén ảnh trong Web Worker nội bộ (`useWebWorker: true`), nên KHÔNG cần tự viết
    Worker riêng vẫn đáp ứng đúng quy tắc "xử lý file nặng luôn bọc trong Web Worker" của
    `CLAUDE.md`.
  - Tạo `src/components/tools/ImageCompressor.tsx` (React, hydrate qua `client:load`): chọn
    nhiều ảnh JPEG/PNG/WebP cùng lúc, thanh trượt chất lượng (10-100%, mặc định 80%), nút
    Nén xử lý tuần tự từng ảnh, hiển thị dung lượng gốc/sau nén/phần trăm giảm, nút tải
    xuống riêng từng ảnh (không dùng zip vì không có trong danh sách dependency được phép).
  - Tạo `src/components/tools/ImageCompressPage.astro`: bọc `Layout` + component React ở
    trên + đầy đủ checklist SEO cho trang công cụ theo `CLAUDE.md`:
    - Title/description riêng, tối ưu từ khóa, không trùng ngôn ngữ khác.
    - JSON-LD `schema.org/WebApplication`, `price: "0"`, `priceCurrency: "USD"`.
    - Đoạn nội dung hướng dẫn ~300-380 từ/ngôn ngữ (4 đoạn), viết riêng cho từng ngôn ngữ
      (không dịch máy thô, không AI-spin lặp cấu trúc).
    - Link nội bộ tới 2 tool cùng nhóm `image` (Chuyển đổi định dạng ảnh, Xóa nền ảnh).
    - Tự động có trong sitemap (route động đã có sẵn từ task URL structure).
  - Tạo namespace i18n riêng `tool-image-compress` (8 file JSON, xem ghi chú kiến trúc ở
    trên) thay vì nhồi vào `common.json`.
  - Sửa `src/pages/[locale]/tools/[slug].astro`: rẽ nhánh `toolId === 'image-compress'` →
    render `<ImageCompressPage lang={locale} />`; các `toolId` khác vẫn giữ nhánh "coming
    soon" cũ.
  - `npm run build` sinh đủ 89 trang không lỗi. Đọc trực tiếp `dist/en/tools/compress-image/
    index.html` và `dist/vi/tools/nen-anh/index.html` xác nhận: title/description/JSON-LD
    đúng, heading dịch đúng ngôn ngữ, input file compressor có mặt, link liên quan trỏ đúng
    2 tool cùng nhóm. Đếm số từ bằng script Node xác nhận đoạn nội dung EN (315 từ) và VI
    (381 từ) đều nằm trong khoảng 300-500 từ yêu cầu.
  - Chạy Lighthouse (Chrome headless local) trên `http://localhost:4322/en/tools/
    compress-image/` qua `npm run preview`: **Performance 100, Accessibility 100, Best
    Practices 100, SEO 100** — component React + nội dung mới không ảnh hưởng điểm số.
- Quyết định kỹ thuật quan trọng:
  - Không tự viết Web Worker riêng vì `browser-image-compression` đã tự quản lý Worker nội
    bộ — viết thêm Worker riêng sẽ là trùng lặp không cần thiết.
  - Không hỗ trợ tải xuống hàng loạt (zip) — không có trong danh sách dependency
    `ROADMAP.md` cho phép, mỗi ảnh có nút tải riêng là đủ cho v1.
  - Không thêm chuyển đổi định dạng (JPEG↔PNG↔WebP) vào tool này dù thư viện hỗ trợ — đó là
    phạm vi của tool #2 "Chuyển đổi định dạng ảnh" riêng biệt trong `ROADMAP.md`, giữ đúng
    ranh giới 1 tool = 1 chức năng.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa test bằng mắt việc chọn ảnh thật + kéo thả trên trình duyệt thật (chỉ verify HTML
    tĩnh sinh ra đúng + Lighthouse chạy trên trang tĩnh, KHÔNG verify tương tác JS runtime
    thực tế của component React) — nên tự thử tay khi có dịp mở dev server.
  - (Đã tự phát hiện và sửa trong lúc làm: `dropHint` ghi "hoặc kéo thả ảnh vào đây" nhưng
    bản đầu chỉ có input click-to-select — đã thêm `onDrop`/`onDragOver` thật vào
    `ImageCompressor.tsx` kèm hiệu ứng viền khi kéo ảnh vào, để UI không nói sai tính năng.)
- Task tiếp theo: Phase 1, công cụ #2 "Chuyển đổi định dạng ảnh" dùng HTML5 Canvas API.

### 2026-07-24 — Kiểm tra Lighthouse trang chủ (hoàn tất Phase 0)
- Đã làm:
  - `npm run build` rồi `npm run preview --port 4321` để có server tĩnh thật (không phải
    dev server, sát với production hơn).
  - Chạy `npx lighthouse http://localhost:4321/en/ --only-categories=performance,
    accessibility,best-practices,seo` bằng Chrome headless cài sẵn trên máy
    (`C:\Program Files\Google\Chrome\Application\chrome.exe`), xuất báo cáo JSON+HTML vào
    thư mục scratchpad.
  - Kết quả: **Performance 99, Accessibility 100, Best Practices 100, SEO 100** — vượt mục
    tiêu ≥ 90 ở cả 4 mục.
  - Soát các audit chưa đạt điểm tuyệt đối (không kéo tổng điểm xuống dưới 90 nên không bắt
    buộc sửa ngay): `first-contentful-paint` (0.96), `largest-contentful-paint` (0.98),
    `unused-javascript` (do bundle React/`client:load` của nút Button demo), và cảnh báo
    render-blocking từ file CSS — ghi lại để lưu ý khi Phase 1 thêm nhiều JS/component thật,
    tránh điểm Performance tụt dần.
- Quyết định kỹ thuật quan trọng: không tối ưu thêm vì đã vượt ngưỡng yêu cầu của task; tối
  ưu sâu hơn (code-splitting, lazy-load Button demo...) để dành khi có tín hiệu thực tế điểm
  giảm ở Phase 1.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Component `<Button client:load>` ở trang chủ chỉ là demo verify Shadcn từ task đầu tiên
    — cân nhắc xoá hẳn khi bắt đầu Phase 1 vì không phục vụ mục đích thật nào nữa và là
    nguồn `unused-javascript` chính hiện tại.
  - Lighthouse mới chạy trên trang chủ (`/en/`) theo đúng phạm vi task — CHƯA chạy cho các
    trang `/tools/{slug}` (những trang đó sẽ có audit riêng theo checklist SEO trong
    `CLAUDE.md` khi làm từng tool ở Phase 1).
- **Phase 0 — Nền tảng & Hạ tầng: HOÀN TẤT toàn bộ 9 task.**
- Task tiếp theo: bắt đầu Phase 1 — công cụ #1 "Nén ảnh (JPEG/PNG/WebP)" với
  `browser-image-compression` (xem `ROADMAP.md`).

### 2026-07-24 — Setup CI/CD: deploy tự động lên Cloudflare khi push
- Đã làm:
  - Push repo local lên GitHub: tạo remote `origin` trỏ
    `https://github.com/DDM123455/devhub.git` (repo do người dùng tự tạo rỗng trên
    github.com), đổi tên nhánh `master` → `main` cho khớp mặc định GitHub, `git push -u
    origin main`.
  - Thêm `.node-version` (nội dung `22`) ở root — Cloudflare build system đọc file này để
    chọn đúng Node runtime (dự án yêu cầu Node ≥ 22.12.0, mặc định Cloudflare có thể dùng
    bản cũ hơn nếu không chỉ định).
  - Người dùng tự kết nối repo trong Cloudflare dashboard (Workers & Pages → Connect to
    Git) — build command `npm run build`, output directory `dist`. Cloudflare hiện thống
    nhất Pages vào nền tảng Workers nên domain cấp ra có dạng
    `<project>.workers.dev` (KHÔNG phải `*.pages.dev` như các dự án Cloudflare Pages cũ) —
    domain thật: `https://devhub.duongdangmanh01.workers.dev`.
  - Cập nhật `site` trong `astro.config.mjs` và dòng `Sitemap:` trong `public/robots.txt`
    từ placeholder `web-tool-hub.pages.dev` sang domain thật ở trên; `npm run build` lại,
    xác nhận `dist/sitemap-index.xml` và `dist/robots.txt` đều trỏ đúng domain mới.
- Quyết định kỹ thuật quan trọng:
  - Dùng Cloudflare Git integration (native, connect trực tiếp trong dashboard) thay vì
    GitHub Actions + `wrangler pages deploy` — đã hỏi và người dùng chọn hướng này vì đơn
    giản hơn (không cần tạo/API token + GitHub secrets, không cần workflow YAML trong
    repo). Do đó repo này KHÔNG có file `.github/workflows/*.yml` nào cho việc deploy —
    đúng như thiết kế, không phải thiếu sót.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Domain sản phẩm thực tế là subdomain `workers.dev` do Cloudflare cấp tự động — nếu sau
    này gắn custom domain riêng, phải cập nhật lại `site` (`astro.config.mjs`) và
    `Sitemap:` (`public/robots.txt`) thêm 1 lần nữa, y hệt bước vừa làm ở đây.
  - Chưa xác nhận bằng mắt là deploy trên Cloudflare thực sự thành công cho code MỚI NHẤT
    (chỉ xác nhận Worker URL tồn tại từ dashboard người dùng cung cấp) — nên tự mở
    `https://devhub.duongdangmanh01.workers.dev` kiểm tra sau khi Cloudflare build xong lần
    push gần nhất.
- Task tiếp theo: Kiểm tra Lighthouse trên trang chủ rỗng, mục tiêu ≥ 90 mọi mục (task cuối
  Phase 0 trong `ROADMAP.md`).

### 2026-07-24 — Cấu hình sitemap.xml + robots.txt
- Đã làm:
  - Cài `@astrojs/sitemap` (integration chính thức của Astro, tự sinh sitemap lúc
    `astro build`, không cần script riêng).
  - Thêm `site: 'https://web-tool-hub.pages.dev'` vào `astro.config.mjs` — **placeholder**,
    bắt buộc phải có (dù chỉ là URL tạm) vì integration cần domain tuyệt đối để sinh
    `<loc>`. Đã hỏi người dùng trước khi chọn URL này (dự án chưa deploy, chưa có domain
    thật — xem ghi chú domain ở mục "Trạng thái hiện tại").
  - Thêm `sitemap()` vào mảng `integrations`, kèm option `i18n.locales`/`i18n.defaultLocale`
    (khớp 8 ngôn ngữ trong `i18n` config) để Astro tự chèn `<xhtml:link rel="alternate"
    hreflang="...">` giữa các bản dịch của CÙNG một trang.
  - Tạo `public/robots.txt`: `Allow: /` cho mọi bot + dòng `Sitemap:` trỏ tới
    `sitemap-index.xml`.
  - `npm run build` sinh `dist/sitemap-index.xml` (trỏ `sitemap-0.xml`) và
    `dist/sitemap-0.xml` (89 URL, khớp đúng 89 trang tĩnh) + `dist/robots.txt` copy nguyên
    từ `public/`. Đếm bằng `grep` xác nhận: 93 thẻ `xhtml:link` hreflang được sinh cho các
    trang có path giống hệt nhau giữa các ngôn ngữ (trang chủ 8 ngôn ngữ) — với trang công
    cụ (`/en/tools/compress-image/` khác `/vi/tools/nen-anh/`), plugin KHÔNG tự đoán ra
    alternate (vì slug khác nhau giữa ngôn ngữ) nên bỏ trống thay vì sinh link sai — hành vi
    an toàn, không phải lỗi.
- Quyết định kỹ thuật quan trọng:
  - Domain thật cho `site` sẽ được xác nhận/sửa lại ở task CI/CD Cloudflare Pages kế tiếp —
    đã ghi rõ vào "Trạng thái hiện tại" để không quên.
  - CHƯA tự viết `<link rel="alternate" hreflang>` thủ công cho từng trang công cụ (dù đã
    có đủ dữ liệu mapping slug trong `src/data/tools.ts` để làm việc này chính xác hơn
    plugin) — để dành cho Phase 2 (mục "Soát lại toàn bộ 10 trang công cụ để đảm bảo schema
    JSON-LD đúng chuẩn") khi các trang công cụ đã có nội dung thật, tránh làm hreflang cho
    placeholder rồi phải sửa lại.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - `site` trong `astro.config.mjs` VÀ dòng `Sitemap:` trong `public/robots.txt` đều đang
    trỏ placeholder `web-tool-hub.pages.dev` — phải đồng bộ sửa cả 2 chỗ khi có domain thật.
- Task tiếp theo: Setup CI/CD — deploy tự động lên Cloudflare Pages khi push (task thứ 9
  trong Phase 0 của `ROADMAP.md`).

### 2026-07-24 — Cấu hình dark mode
- Đã làm:
  - `global.css` đã có sẵn biến `.dark {...}` + `@custom-variant dark (&:is(.dark *));` từ
    lúc cài Shadcn — nghĩa là dark mode ở dự án này là **class-based** (bật bằng cách thêm
    class `dark` vào `<html>`), không phải theo `prefers-color-scheme` cứng — chỉ cần thêm
    cơ chế toggle + lưu lựa chọn của người dùng.
  - Thêm script `is:inline` (chạy đồng bộ, KHÔNG qua Vite bundle) làm phần tử đầu tiên
    trong `<head>` của `Layout.astro` (ngay sau `<meta charset>`): đọc `localStorage.theme`,
    nếu chưa có thì theo `prefers-color-scheme` hệ điều hành, rồi add class `dark` vào
    `document.documentElement` — chạy trước khi trình duyệt paint nên không bị hiện tượng
    "flash of wrong theme" (nhấp nháy sai giao diện) khi tải trang.
  - Tạo `src/components/layout/ThemeToggle.astro`: nút icon mặt trời/mặt trăng (inline SVG,
    ẩn/hiện qua class `dark:hidden`/`dark:block` của chính theme hiện tại — không cần JS để
    biết đang ở theme nào, chỉ CSS), gắn vào `Header.astro` cạnh `LanguageSwitcher`.
  - Thêm script xử lý click ở cuối `Layout.astro` (cùng chỗ với script toggle sidebar có sẵn):
    toggle class `dark` trên `<html>` + ghi lại lựa chọn vào `localStorage.theme`.
  - Thêm `color-scheme: light` / `html.dark { color-scheme: dark }` vào `global.css` để các
    control gốc của trình duyệt (scrollbar, input...) cũng đổi theo theme.
  - Thêm key i18n `nav.toggleTheme` (aria-label nút) cho cả 8 ngôn ngữ.
  - `npm run build` sinh đủ 89 trang; đọc `dist/en/index.html` xác nhận: script anti-flash
    là phần tử đầu tiên trong `<head>` (ngay sau `<meta charset>`), nút `#theme-toggle` có
    đúng `aria-label="Toggle theme"`, và script cuối trang có gắn listener
    `theme-toggle` → toggle class `dark` + `localStorage.setItem`.
- Quyết định kỹ thuật quan trọng:
  - Dùng `<script is:inline>` (không phải `<script>` thường) cho đoạn đọc theme ban đầu —
    bắt buộc, vì `<script>` thường bị Astro/Vite xử lý thành module bundle (tải/thực thi trễ
    hơn một nhịp), sẽ KHÔNG kịp chặn flash; `is:inline` giữ nguyên script y hệt, chạy ngay
    lúc parser gặp nó.
  - Không dùng React/`next-themes`-style solution vì toàn bộ trang là Astro tĩnh, vanilla JS
    nhỏ gọn là đủ, tránh tải thêm JS không cần thiết (đúng triết lý zero-cost).
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa test bằng mắt trên trình duyệt thật (chỉ verify qua HTML/script sinh ra) — nên
    click thử nút theme khi có dịp mở dev server.
- Task tiếp theo: Cấu hình sitemap.xml tự động sinh + robots.txt (task thứ 8 trong Phase 0
  của `ROADMAP.md`).

### 2026-07-24 — Cấu hình cấu trúc URL chuẩn `/{lang}/tools/{slug}`
- Đã làm:
  - Tạo `src/data/tools.ts`: định nghĩa trước cả 10 công cụ của Phase 1 (theo đúng thứ tự
    trong `ROADMAP.md`) — mỗi tool có `id` (định danh nội bộ ổn định), `category` (khớp
    `src/data/categories.ts`), `slugs` (slug bản địa hóa cho cả 8 ngôn ngữ, VD
    `vi: 'nen-anh'`, KHÔNG dịch nguyên văn slug tiếng Anh — đúng ví dụ trong `CLAUDE.md`),
    và `names` (tên hiển thị dịch cho từng ngôn ngữ). Với `ja`/`ko` giữ nguyên chữ bản ngữ
    trong slug (VD `/ja/tools/画像圧縮/`) thay vì romaji — cách này được nhiều site lớn
    (Wikipedia...) dùng, URL Unicode hoạt động bình thường qua UTF-8/IRI, Astro build ra file
    trực tiếp bằng tên Unicode không lỗi.
  - Tạo route động `src/pages/[locale]/tools/[slug].astro`: `getStaticPaths()` sinh
    `locales.length × tools.length = 80` trang tĩnh (8 ngôn ngữ × 10 công cụ), truyền
    `toolId` qua `props` để trang tra lại đúng tên hiển thị theo `locale`. Nội dung hiện tại
    CHỈ LÀ placeholder (tiêu đề + `home.comingSoon`) — xây UI/tính năng thật cho từng công cụ
    thuộc về từng task riêng ở Phase 1, không làm ở đây.
  - Cập nhật trang chủ (`src/pages/[locale]/index.astro`): mỗi khối danh mục giờ liệt kê
    link thật tới các trang công cụ thuộc danh mục đó (`/{lang}/tools/{slug}/`) thay vì chỉ
    dòng text tĩnh — chứng minh cấu trúc URL hoạt động end-to-end, không phải chỉ tồn tại
    trên lý thuyết.
  - `npm run build` sinh tổng cộng 89 trang (80 tool + 8 home + 1 redirect) không lỗi. Đọc
    trực tiếp `dist/vi/index.html` (link đúng slug `nen-anh`, `gop-pdf`...),
    `dist/vi/tools/nen-anh/index.html` (title "Nén ảnh — Web Tool Hub"), và
    `dist/ja/tools/画像圧縮/index.html` (heading đúng, thư mục Unicode tạo thành công trên
    Windows) để xác nhận.
- Quyết định kỹ thuật quan trọng:
  - Định nghĩa slug/tên cho toàn bộ 10 tool ngay từ bây giờ (thay vì để tới lúc làm từng
    tool ở Phase 1) để tránh phải đổi URL về sau (đổi slug sau khi đã index sẽ hại SEO) —
    chi phí thêm không lớn vì đằng nào cũng cần nghĩ tên/slug khi bắt đầu mỗi tool.
  - Dữ liệu tool (`id`, `category`, `slugs`, `names`) đặt trong 1 file TS
    (`src/data/tools.ts`) thay vì rải rác thêm 80 key vào 8 file JSON i18n — vì đây là dữ
    liệu có cấu trúc gắn chặt với từng tool (không phải chuỗi UI chung), gom 1 chỗ dễ soát
    và sửa hơn.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Khi bắt đầu tool đầu tiên ở Phase 1 (Nén ảnh), SỬA nội dung placeholder trong
    `[slug].astro` cho `toolId === 'image-compress'` — cân nhắc tách route dùng chung hiện
    tại thành nhiều file riêng nếu UI mỗi tool khác biệt quá nhiều để dùng chung 1 template.
  - Slug cho `ja`/`ko` dùng script bản ngữ có dấu gạch nối trộn với ASCII ở một số chỗ (VD
    `pdf-병합`, `qrコード生成`) — chưa kiểm tra kỹ quy tắc URL-casing tối ưu SEO cho 2 ngôn
    ngữ này, có thể cần audit lại ở Phase 2 (phần "viết lại meta title/description... không
    dịch máy thô").
- Task tiếp theo: Cấu hình dark mode (task thứ 7 trong Phase 0 của `ROADMAP.md`).

### 2026-07-24 — Thêm banner Privacy cố định trong layout chung
- Đã làm:
  - Tạo `src/components/layout/PrivacyBanner.astro`: dải banner nằm ngay dưới `Header`,
    icon ổ khóa (inline SVG, không cần thêm icon library) + text dịch qua key i18n
    `banner.privacy`, style `bg-primary`/`text-primary-foreground` để nổi bật nhưng vẫn
    theo đúng theme token của shadcn (tự đổi màu khi có dark mode ở task sau).
  - Nhúng `<PrivacyBanner lang={lang} />` trực tiếp trong `src/layouts/Layout.astro` (ngay
    sau `<Header />`, trước phần Sidebar/main) — do đó xuất hiện ở MỌI trang bọc `Layout`,
    đúng yêu cầu "phải xuất hiện ở layout chung, không chỉ ở 1 trang riêng lẻ" trong
    `CLAUDE.md`.
  - Thêm key `banner.privacy` cho cả 8 ngôn ngữ (dịch tay, giữ sát nghĩa gốc "100% Privacy
    — Files Stay On Your Device").
  - `npm run build` chạy sạch; đọc trực tiếp `dist/{en,vi,de,ko}/index.html` xác nhận banner
    render đúng text dịch cho từng ngôn ngữ.
- Quyết định kỹ thuật quan trọng:
  - Banner là static (không sticky, không dismiss được) — ưu tiên đơn giản và đảm bảo luôn
    hiển thị (đúng tinh thần "cố định" là luôn có mặt trong layout, không phải yêu cầu CSS
    position:fixed). Có thể nâng cấp thành sticky sau nếu cần, không phải việc bắt buộc của
    task này.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa có dark mode — màu `bg-primary` hiện là màu tối/sáng theo theme mặc định, cần theo
    dõi lại độ tương phản khi làm task "Cấu hình dark mode".
- Task tiếp theo: Cấu hình cấu trúc URL chuẩn `/{lang}/tools/{slug-ban-dia-hoa}` (task thứ 6
  trong Phase 0 của `ROADMAP.md`).

### 2026-07-24 — Xây layout chung: Header, Footer, Sidebar
- Đã làm:
  - Tạo `src/components/layout/Header.astro`: thanh trên cùng (sticky) gồm logo/tên site
    (link về trang chủ theo ngôn ngữ hiện tại), `LanguageSwitcher`, và nút hamburger
    (chỉ hiện trên mobile, `md:hidden`) để bật/tắt Sidebar.
  - Tạo `src/components/layout/LanguageSwitcher.astro`: `<select>` liệt kê 8 ngôn ngữ theo
    tên bản địa (English, Tiếng Việt, Español...), tự tính lại URL đích bằng cách thay thế
    segment locale đầu tiên trong `Astro.url.pathname`, giữ nguyên phần path còn lại — dùng
    `onchange="window.location.href=this.value"` (native HTML, không cần JS framework/React
    island, giữ đúng tinh thần zero-cost).
  - Tạo `src/components/layout/Sidebar.astro`: nav dọc liệt kê danh mục công cụ (đọc từ
    `src/data/categories.ts`: `image`, `pdf`, `text`, `dev`), mỗi mục link tới
    `/{lang}/#category-{slug}` trên trang chủ (chưa có trang danh mục riêng vì Phase 1 chưa
    làm tool nào — tránh link chết). Ẩn mặc định trên mobile (`hidden`), luôn hiện trên
    `md:block`; nút hamburger ở Header toggle class `hidden` qua 1 đoạn `<script>` thuần
    (không React) đặt cuối `Layout.astro`.
  - Tạo `src/components/layout/Footer.astro`: dòng copyright `© {year} Web Tool Hub` dịch
    qua key i18n `footer.copyright` (dùng interpolation `{{year}}` của i18next).
  - Cập nhật `src/layouts/Layout.astro`: bọc `<slot />` giữa `Header`/`Sidebar` (trong flex
    row) và `Footer`; thêm prop `description?` optional để set `<meta name="description">`
    khi trang truyền vào (trang chủ đã dùng `t('meta.description')`).
  - Cập nhật trang chủ (`src/pages/[locale]/index.astro`): thêm section liệt kê 4 danh mục
    (mỗi khối có `id="category-{slug}"` khớp anchor từ Sidebar) với text placeholder
    `home.comingSoon` — tránh anchor link chết, đồng thời có nội dung thật cho khi
    Lighthouse crawl.
  - Thêm key i18n mới cho cả 8 ngôn ngữ: `nav.toggleMenu`, `nav.categories.{image,pdf,text,
    dev}`, `home.comingSoon`, `footer.copyright`.
  - `npm run build` chạy sạch, sinh đủ 9 trang; đọc trực tiếp `dist/{vi,ja,en}/index.html`
    xác nhận Header/Sidebar/Footer/categories render đúng ngôn ngữ, đúng aria-label dịch,
    `<select>` đánh dấu đúng option `selected` theo locale hiện tại.
- Quyết định kỹ thuật quan trọng:
  - Không dùng icon (lucide-react) trong Sidebar để tránh phải hydrate thêm React island chỉ
    vì icon trang trí — Sidebar/Header/Footer đều là Astro component thuần, 0 JS runtime
    ngoại trừ 1 script toggle rất nhỏ.
  - Chưa build trang danh mục (`/{lang}/tools/{category}`) riêng — Sidebar/nav tạm trỏ vào
    anchor trên trang chủ, sẽ thay bằng URL slug bản địa hóa thật khi làm task "Cấu hình cấu
    trúc URL chuẩn" và các tool ở Phase 1.
  - KHÔNG làm banner Privacy trong task này dù `CLAUDE.md` nói banner phải nằm trong layout
    chung — `ROADMAP.md` liệt kê banner Privacy là task RIÊNG kế tiếp, giữ đúng nguyên tắc
    "một task tại một thời điểm".
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa có dark mode toggle (task riêng kế tiếp sau banner Privacy) — Header hiện chưa có
    chỗ cho nút này, sẽ thêm khi làm task đó.
  - Banner Privacy "100% Privacy — Files Stay On Your Device" CHƯA có — là task ngay sau.
- Task tiếp theo: Thêm banner cố định "100% Privacy — Files Stay On Your Device" trong
  layout (task thứ 5 trong Phase 0 của `ROADMAP.md`).

### 2026-07-24 — Cấu hình i18n cho 8 ngôn ngữ (đổi từ astro-i18next)

### 2026-07-24 — Cấu hình i18n cho 8 ngôn ngữ (đổi từ astro-i18next)
- Đã làm:
  - Trước khi cài `astro-i18next` như `CLAUDE.md` chỉ định, kiểm tra thấy package này đã
    ngừng phát triển thực chất: bản mới nhất `1.0.0-beta.21` phát hành 2023-03-09 (chưa
    từng lên 1.0), repo có issue mở chưa fix "Can't install astro-i18next on Astro 5.0
    Beta" (từ 10/2024) và lỗi Vite module externalization (issue 12/2025) — rủi ro cao khi
    dùng với Astro 7.1.3 hiện tại của dự án. Đã hỏi người dùng và được xác nhận đổi sang
    phương án: **i18n routing built-in của Astro** (ổn định từ Astro 3.5, chắc chắn tương
    thích 7.x) + **thư viện `i18next` thuần** (không qua wrapper Astro nào) để quản lý
    dictionary.
  - Cài `i18next` (core package, không cần `react-i18next`/`i18next-http-backend` vì các
    trang tĩnh chỉ cần `i18next.getFixedT(locale)` lấy hàm dịch cố định 1 ngôn ngữ tại build
    time — không cần detect/switch runtime).
  - Thêm `i18n` config vào `astro.config.mjs`: 8 locale (`en, vi, es, pt, fr, de, ja, ko`),
    `defaultLocale: 'en'`, `routing.prefixDefaultLocale: true` (URL luôn có prefix `/{lang}/`
    kể cả tiếng Anh, khớp chuẩn `/{lang}/tools/{slug}` sẽ dùng ở task URL structure kế
    tiếp), `routing.redirectToDefaultLocale: true` (tự sinh redirect tĩnh `/` → `/en/`).
  - Tạo `src/i18n/config.ts` (export `locales`, type `Locale`, `defaultLocale`) và
    `src/i18n/i18next.ts` (khởi tạo 1 instance `i18next` với `resources` là 8 file JSON
    import tĩnh, export `getFixedT(locale)`).
  - Tạo 8 file dictionary `src/i18n/locales/{lang}/common.json` với key `meta.title`,
    `meta.description`, `home.heading`, `home.tagline` — dịch tay ngắn gọn cho cả 8 ngôn
    ngữ (chưa phải nội dung SEO 300-500 từ đầy đủ, việc đó thuộc Phase 1/2 theo từng công
    cụ).
  - Thêm prop `lang` vào `src/layouts/Layout.astro` để set `<html lang={lang}>` động thay
    vì hardcode `"en"`.
  - Chuyển trang chủ từ `src/pages/index.astro` tĩnh sang route động
    `src/pages/[locale]/index.astro` dùng `getStaticPaths()` sinh 8 trang theo `locales`,
    lấy `t = getFixedT(locale)` để render heading/tagline đã dịch.
  - `npm run build` sinh đúng 9 trang: `/en/`, `/vi/`, `/es/`, `/pt/`, `/fr/`, `/de/`,
    `/ja/`, `/ko/` (mỗi trang có `<html lang>` đúng và nội dung đã dịch, xác nhận bằng cách
    đọc trực tiếp `dist/*/index.html`) và `/index.html` (redirect HTML tĩnh — meta refresh
    + link — sang `/en/`).
- Quyết định kỹ thuật quan trọng:
  - Bỏ `astro-i18next` dù `CLAUDE.md` ghi rõ (đã hỏi và được người dùng xác nhận trước khi
    đổi, đúng quy tắc "tech stack đã chốt — không tự đổi nếu chưa hỏi").
  - Dùng route động `[locale]/index.astro` thay vì 8 thư mục vật lý `en/`, `vi/`... để
    tránh nhân bản code — đây sẽ là pattern chuẩn cho mọi trang công cụ ở Phase 1.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa có UI chuyển đổi ngôn ngữ (language switcher) — sẽ làm cùng lúc với task "Xây
    layout chung" (Header) kế tiếp.
  - `src/pages/index.astro` phải giữ nguyên (dù nội dung rỗng) — xem ghi chú ở mục
    "Trạng thái hiện tại" phía trên.
  - Chưa xử lý slug bản địa hóa cho URL công cụ (`/vi/tools/nen-anh` khác `/en/tools/...`)
    — đó là task riêng "Cấu hình cấu trúc URL chuẩn" kế tiếp trong Phase 0.
- Task tiếp theo: Xây layout chung — Header (menu danh mục công cụ), Footer, Sidebar (task
  thứ 4 trong Phase 0 của `ROADMAP.md`).

### 2026-07-24 — Cài Tailwind CSS + Shadcn/UI
- Đã làm:
  - Tailwind CSS v4 qua `npx astro add tailwind` — dùng Vite plugin
    (`@tailwindcss/vite`), không cần `tailwind.config.js` truyền thống, chỉ
    `src/styles/global.css` với `@import "tailwindcss";`.
  - Tạo `src/layouts/Layout.astro` (layout tối giản, chỉ đủ để import `global.css` và
    có `<slot />`) và cập nhật `src/pages/index.astro` dùng layout này. Layout đầy đủ
    Header/Footer/Sidebar sẽ làm ở task riêng kế tiếp.
  - Thêm React integration (`@astrojs/react@6.0.1`, `react`/`react-dom@^19.2.8`) vì
    Shadcn/UI **chính thức chỉ hỗ trợ Astro qua kiến trúc Islands + React** (không có
    bản thuần Astro) — xác nhận qua tài liệu chính thức ui.shadcn.com/docs/installation/astro.
  - Thêm path alias `@/*` → `./src/*` vào `tsconfig.json` (bắt buộc để Shadcn CLI hoạt động).
  - Chạy `npx shadcn@latest init` (CLI `shadcn@4.14.1`, style `base-nova`, base color
    `neutral`) — sinh `components.json`, `src/lib/utils.ts`, component mẫu
    `src/components/ui/button.tsx`, và tự thêm các dependency đi kèm mặc định của CLI
    (`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `@base-ui/react`,
    `@fontsource-variable/geist`, `tw-animate-css`).
  - Nhúng thử `<Button client:load>` vào `index.astro` để verify pipeline; `npm run build`
    thành công, `dist/index.html` chứa `astro-island` đã hydrate đúng (có bundle JS
    riêng cho `button` và `react` client runtime).
- Quyết định kỹ thuật quan trọng:
  - Chấp nhận thêm React làm dependency vì đây là cách Shadcn/UI chính thức hỗ trợ
    Astro (islands architecture), không phải lựa chọn tuỳ tiện ngoài kế hoạch — vẫn giữ
    đúng triết lý 100% client-side/zero-server vì Astro build static, React chỉ hydrate
    phía client qua `client:*` directive, không có SSR server.
  - Chỉ thêm 1 component mẫu (`button`) để verify — các component Shadcn khác sẽ thêm
    theo nhu cầu thực tế của từng công cụ ở Phase 1, tránh cài dư thừa.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Layout hiện tại chỉ tối giản (chưa có Header/Footer/Sidebar, chưa có banner Privacy
    bắt buộc theo `CLAUDE.md`) — sẽ làm ở task "Xây layout chung" kế tiếp trong Phase 0.
  - Khi dùng component Shadcn cần tương tác, nhớ thêm `client:load`/`client:visible`
    phù hợp — Astro islands không tự share React context giữa các đảo.
- Task tiếp theo: Cấu hình astro-i18next cho 8 ngôn ngữ (task thứ 3 trong Phase 0 của
  `ROADMAP.md`).

### 2026-07-24 — Khởi tạo dự án Astro + TypeScript
- Đã làm:
  - Phát hiện Node hệ thống là v20.19.0, nhưng Astro v6+/CLI `create-astro` mới nhất
    yêu cầu Node ≥ 22.12.0. `nvm-windows` có sẵn trên máy nhưng mọi lệnh (`nvm list`,
    `nvm version`, `nvm install`...) đều không cho output/không hoạt động (nghi do thiếu
    quyền admin với `C:\Program Files\nodejs`).
  - Giải pháp: tải trực tiếp bản zip Node.js v22.23.1 (LTS "Jod") từ nodejs.org, giải nén
    vào `.tools/node-v22.23.1-win-x64/` trong thư mục dự án — không cần quyền admin,
    không đụng tới Node hệ thống hay các bản trong nvm.
  - `git init` tại `E:\WEB\common` (trước đó chưa phải git repo).
  - Scaffold Astro bằng `npm create astro@latest` (Astro v7.1.3) với template `minimal`,
    TypeScript strict (`astro/tsconfigs/strict`). Vì thư mục gốc không rỗng (đã có 3 file
    .md), scaffold vào thư mục tạm `.tools/astro-scaffold-tmp` rồi di chuyển các file dự
    án (`package.json`, `tsconfig.json`, `astro.config.mjs`, `.gitignore`, `src/`,
    `public/`, `.vscode/`, `README.md`) lên thư mục gốc, sau đó xoá thư mục tạm.
  - **Cố ý bỏ qua** `AGENTS.md`/`CLAUDE.md` (symlink) do Astro tự sinh, để không ghi đè
    `CLAUDE.md` gốc của dự án (file "hợp đồng hành vi" bắt buộc).
  - Đổi `name` trong `package.json` thành `web-tool-hub`.
  - Thêm `.tools/` vào `.gitignore` (thư mục chứa Node runtime tải riêng, không phải mã
    nguồn dự án).
  - `npm install` (200 packages) và `npm run build` chạy sạch, sinh `dist/index.html`
    (1 trang tĩnh).
- Quyết định kỹ thuật quan trọng:
  - Chọn nâng cấp lên Astro mới nhất (v7.x) + Node 22 thay vì ghim Astro v5 cũ để chạy
    trên Node 20, tránh phải nâng cấp lại toàn bộ nền tảng sau này (đã hỏi và được người
    dùng xác nhận).
  - Dùng Node "portable" (zip giải nén thủ công) thay vì `nvm-windows` vì `nvm-windows`
    trên máy này không phản hồi bất kỳ lệnh nào (có thể do vấn đề quyền admin) — cần
    điều tra thêm nếu muốn dùng nvm cho các bản Node khác sau này.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - `nvm-windows` trên máy đang không hoạt động (mọi lệnh output rỗng) — chưa fix, hiện
    dự án không phụ thuộc vào nó.
  - Mỗi phiên terminal mới cần `export PATH="<project>/.tools/node-v22.23.1-win-x64:$PATH"`
    trước khi chạy npm/node, vì Node này không nằm trong PATH hệ thống.
  - Chưa cấu hình Tailwind/Shadcn/i18n/layout/dark mode/sitemap/CI-CD — đây là các task
    `[ ]` kế tiếp trong Phase 0.
- Task tiếp theo: Cài Tailwind CSS + Shadcn/UI (task thứ 2 trong Phase 0 của `ROADMAP.md`).

### [Mẫu — xoá dòng này khi có log thật] YYYY-MM-DD — Tên task
- Đã làm: ...
- Quyết định kỹ thuật quan trọng (nếu có): ...
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau: ...
- Task tiếp theo: ...

