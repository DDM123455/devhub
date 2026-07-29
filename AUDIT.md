# AUDIT.md — Audit toàn diện Web Tool Hub vs. Benchmark đầu ngành

> Thực hiện: 2026-07-29. Phạm vi: 20 công cụ (Phase 1 + Phase 3) + hạ tầng dùng chung
> (layout, dark mode, a11y, performance, SEO, PWA). Phương pháp: đọc toàn bộ mã nguồn thật
> của từng component + trang wrapper, đối chiếu tính năng với benchmark đầu ngành theo
> trí nhớ chuyên môn (không truy cập internet trực tiếp trong lượt audit này — nếu cần xác
> minh tính năng mới nhất của 1 benchmark cụ thể, nên làm ở phiên sau bằng WebFetch).
> **Giới hạn quan trọng**: điểm Core Web Vitals dưới đây là ước tính từ đọc code
> (bundle nào eager/lazy, ảnh có optimize không...), CHƯA chạy Lighthouse thật — audit này
> chạy trong chế độ chỉ-đọc, không `npm run build`. Việc đo Lighthouse thật nên là bước đầu
> tiên của giai đoạn remediation.

## 0. Điểm tổng quan (Scorecard)

| Hạng mục | Điểm /100 | Ghi chú ngắn |
|---|---|---|
| UX (trải nghiệm) | 66 | Tính năng phong phú nhưng thiếu nhất quán (vd. "Download All .zip" có ở 2/3 tool ảnh, thiếu ở 1), thiếu undo, thiếu keyboard shortcut hầu hết mọi nơi |
| UI (giao diện) | 72 | Design system nhất quán (shadcn + emerald palette + dark mode tốt), nhưng thiếu skeleton loader, animation/micro-interaction còn sơ sài |
| Performance | 68 | Thư viện nặng (ffmpeg.wasm, onnxruntime, exceljs...) đều lazy-import đúng cách, nhưng **100% tool dùng `client:load`** (hydrate ngay, 0% dùng `client:visible/idle`) |
| SEO | 74 | Meta + JSON-LD `WebApplication` + sitemap/robots đầy đủ, nhất quán; nhưng JSON-LD luôn generic, thiếu `FAQPage`/`BreadcrumbList`, chưa xác minh Open Graph/Twitter card |
| Accessibility | **42** | **0 `role=`, 0 `sr-only` trong toàn bộ codebase**, không có skip-link, không có focus-trap cho sidebar mobile, `aria-*` chỉ xuất hiện rải rác 16/47 file |
| Mobile | 63 | Có hamburger menu + Escape-to-close, nhưng nhiều tool không có breakpoint riêng cho mobile (chỉ `flex-wrap` mặc định), chưa kiểm tra touch-target size |
| Desktop | 78 | Trải nghiệm desktop mạnh nhất — hầu hết tool có độ sâu tính năng thật (không chỉ MVP) |
| Core Web Vitals | ~70 (ước tính, chưa đo thật) | Rủi ro chính: `client:load` toàn bộ + không dùng `astro:assets` cho ảnh kết quả; cần đo Lighthouse thật trước khi tối ưu |

**Nhận định chung**: Về **chiều sâu tính năng**, nhiều công cụ đã vượt kỳ vọng "MVP"
(Background Remover có compare-slider + edge softness; PDF Merger có thao tác cấp trang;
Text Diff có merge-tool 3-way; JWT Decoder có verify + re-sign) — đây là điểm mạnh thực sự
hiếm gặp ở một site tự làm. Nhưng **accessibility đang là điểm yếu nghiêm trọng nhất**,
đủ để coi là rủi ro pháp lý/uy tín nếu site có traffic thật, và **một số gap nhỏ nhưng gây
hại thật** (bug im lặng, thiếu cảnh báo) cần sửa trước khi mở rộng thêm tính năng mới.

---

## 1. Hạ tầng & trải nghiệm dùng chung (áp dụng cho toàn bộ 20 trang)

### 1.1 Layout / Điều hướng
- ✅ Header/Sidebar/Footer dùng chung qua `Layout.astro`, landmark ngữ nghĩa đầy đủ
  (`header`/`aside><nav>`/`main`/`footer`).
- ✅ Mobile: hamburger toggle sidebar off-canvas, có `aria-label`/`aria-controls`, đóng
  bằng Escape và click-outside.
- ❌ **Không có skip-to-content link** ở bất kỳ đâu — vi phạm WCAG 2.4.1, ảnh hưởng mọi
  người dùng bàn phím/screen reader trên **cả 20 trang**.
- ❌ **Không có focus-trap** khi sidebar mobile mở, và không trả focus về nút trigger khi
  đóng — người dùng bàn phím có thể bị "lạc" focus ra ngoài overlay.
- ⚠️ Chỉ 3 file dùng `focus:` variant, 1 file dùng `focus-visible` trong toàn bộ
  `src/components` — phần lớn phần tử tương tác dựa vào outline mặc định của trình duyệt
  (không tệ, nhưng không được thiết kế chủ động, dễ bị mất khi customize).

### 1.2 Dark mode / Design system
- ✅ Class-based dark mode (`.dark` trên `<html>`), persist `localStorage`, script
  `is:inline` chạy trước hydrate để tránh FOUC, fallback theo `prefers-color-scheme`.
- ✅ Font tự host (`@fontsource-variable/space-grotesk` + `jetbrains-mono`), không phụ
  thuộc Google Fonts CDN — tốt cho performance + privacy.
- ✅ Bảng màu CSS variable đầy đủ light/dark, `color-scheme` set đúng cho native form
  control theming.

### 1.3 Trang chủ (`src/pages/[locale]/index.astro`)
- ✅ Hero + 2 cột category card + tìm kiếm lọc client-side (substring match trên
  `data-tool-name`).
- ❌ 1 trong 3 "stat pill" ở hero là **placeholder tĩnh "0 KB uploaded"** — không phải số
  liệu thật, có thể gây hiểu nhầm hoặc trông như site chưa hoàn thiện nếu người dùng để ý.
- ⚠️ Search không debounce (chấp nhận được vì chỉ lọc DOM có sẵn, không phải fetch), không
  hiển thị số kết quả, không có phím tắt `/` để focus ô tìm kiếm (chuẩn UX phổ biến ở các
  tool-hub như GitHub, Raycast, v.v.).

### 1.4 Accessibility toàn site (grep density thật, không suy đoán)
- `aria-*`: có mặt ở 16/47 file, chủ yếu `aria-hidden` cho icon trang trí — KHÔNG phải hệ
  thống labeling nhất quán cho input/error/status.
- `role=`: **0/47 file**.
- `sr-only` (văn bản ẩn cho screen reader): **0/47 file** — nghĩa là không có pattern
  "ẩn trực quan nhưng đọc được bằng screen reader" ở bất kỳ đâu trên site.
- `alt=`: chỉ 5/47 file dùng.
- Không có `aria-live` region nào cho các thông báo lỗi/kết quả xuất hiện động (JSON parse
  error, decode error, trim error...) trên **bất kỳ tool nào trong 20 tool** → người dùng
  screen reader sẽ không được thông báo khi lỗi xuất hiện, phải tự dò lại toàn trang.
- Không tìm thấy pattern focus-trap ở bất kỳ đâu (`focus-trap`/`trapFocus`: 0 hit).

### 1.5 Performance hạ tầng
- **100% (20/20) trang tool dùng `client:load`**, 0% dùng `client:visible`/`client:idle`/
  `client:only` — mọi React island hydrate ngay khi trang load dù là nội dung chính (ít hại
  hơn so với site có nhiều island phụ, nhưng vẫn là cơ hội bỏ lỡ cho phần "article"/
  "related tools" ở dưới fold, có thể tách nhẹ nếu cần).
- Thư viện nặng (ffmpeg.wasm, onnxruntime-web, exceljs ~930KB, jsoneditor, jszip, svgo,
  heic2any, gifenc, lamejs) đều được `await import()` động đúng lúc cần — pattern tốt,
  giữ bundle ban đầu nhẹ.
- `astro:assets`/`<Image>` (tối ưu ảnh built-in của Astro) chỉ dùng ở 3 file — ảnh
  thumbnail/preview do tool tạo ra (canvas, thumbnail PDF...) không đi qua pipeline tối ưu
  này (chấp nhận được vì đây là ảnh runtime do người dùng tạo, không phải ảnh tĩnh site,
  nhưng đáng ghi nhận).
- Không có test framework, không có ESLint/Prettier config, không có CI — dự án đang ở giai
  đoạn "ship tính năng" thuần, chưa có safety net tự động (rủi ro tăng dần khi codebase lớn
  hơn — 20 tool đã là quy mô đáng kể).

### 1.6 SEO hạ tầng
- ✅ `robots.txt` + `sitemap-index.xml` (qua `@astrojs/sitemap`, đúng đa ngôn ngữ) đều tồn
  tại và cấu hình đúng.
- ✅ Mọi trang có `title`/`description` riêng theo i18n, JSON-LD `WebApplication` +
  `Offer` (giá 0 USD) nhất quán.
- ❌ JSON-LD **luôn chỉ là `WebApplication` generic** — không trang nào có `FAQPage`,
  `HowTo`, hay `BreadcrumbList` schema, dù mỗi trang đều có sẵn nội dung dạng "article"
  300-500 từ rất hợp để chuyển thành FAQ rich-result (cơ hội SEO bị bỏ lỡ ở **cả 20
  trang**).
- ⚠️ Chưa xác minh được Open Graph / Twitter Card tag có được `Layout.astro` tự phát hay
  không trong đợt audit này (agent đọc `*Page.astro` không thấy trực tiếp, nhưng có thể kế
  thừa từ layout — cần đọc `Layout.astro` ở phiên sau để xác nhận chắc chắn).
- Google Search Console / Bing submit vẫn treo (đã biết, do chưa có domain thật — không
  phải audit item mới).

### 1.7 PWA & Monetization (đối chiếu ROADMAP Phase 4)
- Xác nhận: **không có** `manifest.json`, không có service worker, không có AdSense/
  affiliate code nào trong source — đúng như `ROADMAP.md` đã đánh dấu `[ ]` chưa làm, không
  có phần dở dang ẩn.

---

## 2. Audit từng công cụ (20 công cụ)

> Điểm "Parity" = mức độ ngang bằng tính năng với benchmark tốt nhất trong nhóm, KHÔNG
> phải điểm tuyệt đối. 100 = ngang hoặc vượt benchmark ở mọi mặt quan trọng.

### Nhóm Ảnh (Phase 1.5 — benchmark đã áp dụng trước đó)

**1. Nén ảnh** — vs TinyPNG, Squoosh, iLoveIMG — **Parity: 68/100**
- Điểm mạnh: batch xử lý, drag&drop, quality slider, before/after side-by-side, %giảm
  dung lượng, download-all .zip.
- Gap: không có chế độ nén-theo-format-đích (Squoosh cho chọn WebP/AVIF/MozJPEG output
  ngay trong lúc nén); không có "target size" (nén tới X KB); không resize kích thước;
  xử lý **tuần tự** (không song song) — chậm với nhiều file lớn; không có nút Retry khi lỗi.

**2. Chuyển đổi định dạng ảnh** — vs Convertio, CloudConvert, iLoveIMG — **Parity: 72/100**
- Điểm mạnh: 7 định dạng đích thật (WebP/JPEG/PNG/AVIF/GIF/BMP/ICO), tự viết encoder
  BMP/ICO/GIF, hỗ trợ input HEIC/HEIF qua `heic2any`, phát hiện AVIF không được hỗ trợ và
  báo lỗi rõ ràng.
- Gap: **thiếu "Download All .zip"** — có ở Compressor và Splitter nhưng KHÔNG có ở đây,
  bất nhất trải nghiệm giữa 3 tool ảnh; ICO chỉ xuất 1 kích thước (256px) trong khi ICO
  chuẩn thường chứa nhiều size; không resize; xử lý tuần tự.

**3. Xóa nền ảnh** — vs remove.bg, Adobe Express — **Parity: 78/100** (điểm cao nhất nhóm)
- Điểm mạnh: AI chạy local (`@imgly/background-removal`) — thực ra **vượt** remove.bg về
  privacy/chi phí; progress % theo từng ảnh; 3 chế độ nền (trong suốt/màu/ảnh); slider
  compare trước/sau kéo được; edge-softness feathering tự viết bằng box-blur.
- Gap: không có cọ tinh chỉnh mask thủ công (remove.bg Pro có); không có thanh tiến trình
  tổng khi xử lý hàng loạt (chỉ % của ảnh hiện tại); không crop/resize; không download-all.

### Nhóm PDF (Phase 1.5)

**4. Gộp PDF** — vs iLovePDF, Smallpdf — **Parity: 74/100**
- Điểm mạnh: thao tác **cấp trang** thật (kéo-thả sắp xếp lại từng trang giữa các file,
  xoay từng trang, xóa trang riêng lẻ) — vượt xa mức "MVP gộp file nguyên khối".
- Gap: không preview file gộp cuối trước khi tải; không xử lý/báo lỗi riêng cho PDF có mật
  khẩu (rơi vào lỗi chung chung); không cảnh báo giới hạn dung lượng.

**5. Tách PDF** — vs iLovePDF, Smallpdf — **Parity: 70/100**
- Điểm mạnh: 2 chế độ tách (range tùy chỉnh với validate chi tiết, hoặc mỗi N trang),
  download-all .zip (lazy-load JSZip).
- Gap: không có chọn trang kiểu checkbox đa lựa chọn (chỉ qua cú pháp range); không preview
  từng file kết quả trước khi tải; không kéo-thả sắp xếp lại trang (chỉ xóa/xoay).

### Nhóm Văn bản & Dữ liệu (Phase 1.5 + Phase 3)

**6. So sánh văn bản (Diff Checker)** — vs Diffchecker.com — **Parity: 80/100** (mạnh nhất
site)
- Điểm mạnh: 3 mức granularity, ignore whitespace/case, **merge tool 3-way thật** (accept
  left/right theo từng hunk, save kết quả), fullscreen, điều hướng hunk kế tiếp/trước.
- Gap: Diffchecker hỗ trợ so sánh PDF/Word/ảnh — tool này chỉ text thuần (chấp nhận được,
  ngoài phạm vi kỹ thuật client-side hợp lý); không có link chia sẻ kết quả.

**7. Đếm từ & ký tự** — vs WordCounter.net — **Parity: 55/100** (yếu nhất nhóm text)
- Điểm mạnh: đủ số liệu cơ bản + reading/speaking time + keyword density table.
- Gap: **không có nút copy/export/download kết quả nào** (khác biệt lớn so với mọi tool
  khác trên site, vốn đều có copy); không có preset giới hạn ký tự mạng xã hội (X/Meta
  description); không có điểm đọc hiểu (Flesch-Kincaid) — đây là tính năng "hook" chính
  của WordCounter.net; không upload file.

**8. JSON Formatter & Validator** — vs JSONFormatter.org, JSONLint — **Parity: 70/100**
- Điểm mạnh: tree view + text mode qua `jsoneditor` thật, export XML/YAML/CSV tự viết,
  "go to error line" định vị chính xác.
- Gap: không có nút "Validate" tường minh/badge trạng thái riêng biệt (ẩn trong hành vi
  editor); import `SchemaValidationError` nhưng không expose JSON Schema validation cho
  người dùng; không so sánh 2 JSON (diff).

**9. Chuyển đổi Case văn bản** — vs ConvertCase.net — **Parity: 65/100**
- Điểm mạnh: 8 kiểu case + 3 tiện ích (xóa khoảng trắng/xuống dòng thừa/sắp xếp dòng).
- Gap: Title Case không có danh sách từ ngoại lệ (of/the/and...); thiếu font trang trí kiểu
  ConvertCase (bubble/strikethrough); không hiện đếm từ/ký tự cạnh output; không upload/
  download file.

**10. CSV ↔ JSON Converter** — vs CloudConvert, Convertio — **Parity: 72/100**
- Điểm mạnh: 2 chiều đầy đủ, delimiter tùy chỉnh, flatten/nested toggle, lỗi CSV có số
  dòng cụ thể (nhờ PapaParse), swap nhanh.
- Gap: không batch nhiều file; không có preview bảng trước khi convert (trong khi tool chị
  em JSON→Excel lại CÓ preview — bất nhất trải nghiệm); không hỗ trợ TSV như option riêng.

**11. JSON → Excel Converter** — vs CloudConvert — **Parity: 68/100**
- Điểm mạnh: multi-sheet tự động, preview 20 dòng đầu, tự xử lý tên sheet trùng/quá 31 ký
  tự (giới hạn Excel thật), auto column width.
- 🐛 **BUG THẬT** (không phải thiếu tính năng): `downloadError` state được khai báo và
  render trong UI nhưng **không có `catch` clause nào set giá trị cho nó** trong
  `handleDownload` — nếu `exceljs` build workbook lỗi, người dùng chỉ thấy nút hết trạng
  thái "Generating..." mà không có bất kỳ thông báo lỗi nào, coi như thất bại trong im
  lặng. Đây là **item Critical**, không phải Nice-to-have.

### Nhóm Dev/Design Tools (Phase 3)

**12. JWT Decoder** — vs jwt.io — **Parity: 72/100**
- Điểm mạnh: decode + **verify chữ ký thật** (HMAC qua `crypto.subtle`, RSA qua PEM) +
  **edit & re-sign** (jwt.io bản miễn phí không có re-sign) — đây là điểm vượt benchmark
  thật sự.
- Gap: không hỗ trợ ES*/PS*/EdDSA (báo "unsupported"); không hiển thị `aud`/`iss`/`sub`
  tường minh; không có URL deep-link chia sẻ token debug (jwt.io có `?token=`); không cảnh
  báo `alg: none`.

**13. Base64 Encode/Decode** — vs base64decode.org — **Parity: 68/100**
- Điểm mạnh: 2 tab Text/File đầy đủ, URL-safe + line-wrap, preview ảnh, Data URI
  auto-detect, download với đoán MIME→extension.
- Gap: bảng MIME→extension chỉ có 9 loại (nhiều file tải về sẽ không có phần mở rộng);
  không batch nhiều file; luôn cố định UTF-8 (không chọn encoding khác).

**14. Regex Tester** — vs regex101.com, RegExr — **Parity: 60/100**
- Điểm mạnh: 6 cờ, named/numbered groups, cheat sheet, replace panel hỗ trợ `$1`/`$<name>`.
- ⚠️ **Rủi ro kỹ thuật thật**: tính diff bằng `useMemo` **đồng bộ trên main thread, không
  debounce, không có timeout/guard chống catastrophic backtracking (ReDoS)** — một pattern
  không tối ưu do người dùng gõ vào (rất dễ xảy ra vô tình, không cần ác ý) có thể đứng
  cứng tab trình duyệt. Đây là gap nghiêm trọng hơn bình thường vì nó là **lỗi có thể tự
  xảy ra**, không chỉ thiếu tính năng.
- Gap khác: không có bộ chọn "flavor" (PCRE/Python/...), không lưu lịch sử pattern, không
  URL chia sẻ state.

**15. SVG Optimizer** — vs SVGOMG — **Parity: 58/100** (gap tính năng lớn nhất site)
- Điểm mạnh: dùng đúng SVGO engine thật (`svgo/browser`), preview sandbox iframe an toàn,
  so sánh byte size trước/sau.
- Gap lớn: SVGOMG expose ~20+ plugin riêng lẻ có thể bật/tắt độc lập (kèm tooltip giải
  thích từng plugin); tool này chỉ có 3 checkbox (multipass/remove-dimensions/prettify) +
  1 slider precision, bọc gọn trong `preset-default` — với người dùng dev/designer nghiêm
  túc (đối tượng chính của SVG optimizer), đây là thiếu hụt đáng kể, không phải chi tiết
  nhỏ.

**16. Color Picker & Palette Generator** — vs Coolors, Adobe Color — **Parity: 74/100**
- Điểm mạnh: đồng bộ Hex/RGB/HSL 2 chiều, 6 kiểu harmony, palette ngẫu nhiên có
  lock/unlock từng màu, phím tắt Space để random, contrast checker WCAG AA/AAA thật.
- 🐛 Bug nhỏ: 2 nút "Copy as CSS"/"Copy as JSON" **không có phản hồi "Copied"** trong khi
  mọi nút copy khác trên site đều có — bất nhất, dễ khiến người dùng bấm 2 lần vì tưởng
  chưa copy được.
- Gap: không export ASE/SCSS/Tailwind config; không trích xuất palette từ ảnh (tính năng
  chủ lực của Coolors "Image to Palette"); không lưu palette yêu thích (không có
  localStorage); hex chỉ nhận 6 ký tự (không 3-ký-tự rút gọn).

### Nhóm Media & QR (Phase 3)

**17. QR Code Generator** — vs qr-code-generator.com — **Parity: 70/100**
- Điểm mạnh: 6 loại nội dung (URL/text/WiFi/vCard/Email/SMS), logo giữa với auto-nâng EC
  level, xuất PNG (4 độ phân giải) + SVG, error boundary bắt riêng lỗi "data too long" của
  thư viện thay vì crash trắng trang.
- Gap: chỉ QR vuông đơn sắc (không có dot-style/gradient/frame/CTA text — các tool đối thủ
  coi đây là tính năng "premium" hay dùng để tăng conversion); không batch tạo nhiều QR.

**18. Markdown Editor** — vs StackEdit, Dillinger — **Parity: 62/100**
- Điểm mạnh: toolbar định dạng đầy đủ (selection-aware, giữ cursor), preview GFM +
  DOMPurify (đã test XSS thật), cuộn đồng bộ 2 khung, xuất `.md`/`.html`.
- Gap: **editor chỉ là `<textarea>` thuần, không syntax highlighting** (StackEdit/Dillinger
  dùng CodeMirror); **không autosave/localStorage** (mất nội dung khi refresh nhầm — rủi ro
  UX thật với một text editor); không có keyboard shortcut Ctrl+B/Ctrl+I; không sync
  cloud/GitHub (tính năng đặc trưng StackEdit, có thể bỏ qua hợp lý vì phá nguyên tắc
  client-side-only của site).

**19. Trim video ngắn** — vs Clideo, CloudConvert — **Parity: 58/100** (gap lớn thứ 2 site)
- Điểm mạnh: FFmpeg.wasm thật, 2 chế độ (nhanh/chính xác) giải thích rõ trade-off, so sánh
  dung lượng/thời lượng trước-sau.
- Gap: chọn điểm cắt bằng **2 slider tách rời**, không phải timeline kéo 2 tay cầm trực
  quan như Clideo (kém trực quan hơn hẳn với video dài); không có thumbnail/waveform
  scrubber; xử lý FFmpeg hoàn toàn trên main thread (không offload Worker riêng như Audio
  Converter đã làm) — rủi ro jank UI khi xử lý video lớn; chỉ cắt 1 đoạn, không multi-clip/
  crop/watermark.

**20. Chuyển đổi Audio MP3 ↔ WAV** — vs CloudConvert, Online-Convert — **Parity: 60/100**
- Điểm mạnh: decode native Web Audio API (không cần thư viện ngoài), encode MP3 trong Web
  Worker riêng (đúng kiến trúc CLAUDE.md yêu cầu), auto-gợi ý định dạng đích, chọn bitrate.
- ⚠️ **Bug im lặng thật**: `Math.min(channels.length, 2)` tự động cắt bỏ kênh audio vượt
  quá stereo **mà không cảnh báo người dùng** — file surround 5.1/7.1 sẽ bị mất kênh âm
  thầm, người dùng không biết vì sao audio "thiếu tiếng" sau convert.
- Gap: chỉ hỗ trợ MP3↔WAV, không AAC/OGG/FLAC/M4A (đối thủ hỗ trợ hàng chục định dạng);
  không resample/normalize/fade; `eslint-disable jsx-a11y/media-has-caption` — chấp nhận
  được cho audio nhưng ghi nhận là gap a11y đã biết, chưa xử lý.

---

## 3. Danh sách ưu tiên tổng hợp toàn site

Ký hiệu: **Effort** = Thấp/Trung bình/Cao. **Giá trị** chấm 1-3 (●●●=cao) cho SEO/UX/
Conversion. **Thời gian** = ước tính 1 dev quen codebase.

### 🔴 Critical (nên làm trước khi thêm bất kỳ tool mới nào)

| # | Hạng mục | Vấn đề | Effort | SEO | UX | Conversion | Thời gian |
|---|---|---|---|---|---|---|---|
| C1 | Bug thật | JSON→Excel: `downloadError` không bao giờ được set → lỗi export bị nuốt âm thầm | Thấp | ● | ●●● | ●● | 15 phút |
| C2 | Bug thật | Audio Converter: cắt kênh audio >stereo không cảnh báo, mất dữ liệu âm thầm | Thấp | ● | ●●● | ●● | 1-2 giờ |
| C3 | Accessibility | Không có skip-to-content link trên toàn bộ 20+ trang | Thấp | ●● | ●●● | ● | 1-2 giờ |
| C4 | Accessibility | 0 `role=`, 0 `sr-only` toàn site — không có hệ thống labeling cho screen reader | Trung bình | ●● | ●●● | ●● | 2-3 ngày (rà soát 20 tool) |
| C5 | Accessibility | Không `aria-live` cho thông báo lỗi/kết quả động ở mọi tool | Trung bình | ● | ●●● | ●● | 1-2 ngày |
| C6 | Accessibility | Sidebar mobile: không focus-trap, không trả focus khi đóng | Thấp-Trung bình | ● | ●● | ● | 3-4 giờ |
| C7 | Rủi ro kỹ thuật | Regex Tester: không debounce/guard ReDoS — pattern lỗi có thể treo tab | Trung bình | ● | ●●● | ● | 1 ngày |

### 🟠 High (giá trị lớn, nên làm sớm trong 1-2 tháng tới)

| # | Hạng mục | Vấn đề | Effort | SEO | UX | Conversion | Thời gian |
|---|---|---|---|---|---|---|---|
| H1 | Feature parity | SVG Optimizer: mở rộng từ 3 toggle lên danh sách plugin đầy đủ kiểu SVGOMG | Trung bình | ●● | ●●● | ●● | 1-2 ngày |
| H2 | Feature parity | Word Counter: thêm copy/export/download, char-limit preset MXH, readability score | Thấp-Trung bình | ●● | ●●● | ●●● | 1 ngày |
| H3 | Bug nhất quán | Image Format Converter: thêm "Download All .zip" (đã có ở 2/3 tool ảnh khác) | Thấp | ● | ●● | ●● | 2-3 giờ |
| H4 | Bug nhất quán | Color Picker: thêm phản hồi "Copied" cho 2 nút CSS/JSON export | Thấp | ● | ●● | ● | 30 phút |
| H5 | SEO | Thêm `FAQPage`/`BreadcrumbList` JSON-LD cho 20 trang tool (tận dụng nội dung article sẵn có) | Trung bình | ●●● | ● | ●● | 2-3 ngày |
| H6 | PWA | `manifest.json` + service worker cơ bản (offline shell) — đã có trong ROADMAP Phase 4, nên ưu tiên lên trước AdSense | Trung bình | ●● | ●● | ●●● | 1-2 ngày |
| H7 | Feature parity | Video Trim: thay 2 slider bằng timeline kéo-2-tay-cầm trực quan | Cao | ● | ●●● | ●● | 2-3 ngày |
| H8 | Kiến trúc | Video Trim: offload FFmpeg xử lý sang Web Worker (đồng bộ pattern đã dùng ở Audio Converter) | Trung bình | ● | ●● | ● | 1 ngày |
| H9 | Keyboard UX | Thêm keyboard shortcut cho các tool dạng editor (Markdown Ctrl+B/I, JSON Formatter, Regex) | Trung bình | ● | ●● | ● | 1-2 ngày |
| H10 | Data loss | Markdown Editor: autosave nội dung vào `localStorage` (tránh mất bài khi refresh nhầm) | Thấp | ● | ●●● | ●● | 3-4 giờ |

### 🟡 Medium

| # | Hạng mục | Vấn đề | Effort | Thời gian |
|---|---|---|---|---|
| M1 | Image Compressor: xử lý song song thay vì tuần tự khi batch nhiều ảnh | Trung bình | 1 ngày |
| M2 | Image Compressor/Converter: thêm resize kích thước trước khi xuất | Trung bình | 1-2 ngày |
| M3 | CSV↔JSON Converter: thêm bảng preview trước khi convert (đồng bộ với JSON→Excel) | Thấp | 3-4 giờ |
| M4 | QR Generator: thêm dot-style/gradient cơ bản (không cần đầy đủ như đối thủ trả phí) | Trung bình | 1-2 ngày |
| M5 | Contrast/`focus-visible` pass có chủ đích trên toàn bộ nút bấm/input tương tác | Trung bình | 1-2 ngày |
| M6 | Trang chủ: thay "0 KB uploaded" placeholder tĩnh bằng số liệu thật hoặc bỏ hẳn | Thấp | 1-2 giờ |
| M7 | `client:load` → `client:visible` cho phần "article"/"related tools" dưới fold (nếu tách được khỏi React island chính) | Trung bình | đánh giá riêng |
| M8 | Base64: mở rộng bảng MIME→extension | Thấp | 1-2 giờ |
| M9 | JWT Decoder: hiển thị `aud`/`iss`/`sub` tường minh trong claims panel | Thấp | 2-3 giờ |
| M10 | Chạy Lighthouse thật (build + preview) trên toàn bộ 20 trang, thay số ước tính CWV bằng số đo thật | Thấp | 1 buổi |

### 🟢 Low (giá trị thấp hoặc phụ thuộc quyết định ngoài kỹ thuật)

- AdSense/affiliate/Buy-Me-Coffee (ROADMAP Phase 4 — chờ quyết định monetization + domain thật).
- Submit Search Console/Bing (chờ domain thật, đã biết).
- ProductHunt/Reddit/HN launch (ROADMAP Phase 5, không phải việc kỹ thuật).
- Font trang trí kiểu "bubble text" cho Text Case Converter — vui nhưng ít giá trị SEO/conversion.
- JWT Decoder hỗ trợ ES*/PS*/EdDSA — kỹ thuật khó hơn (một số thuật toán `crypto.subtle`
  trình duyệt hỗ trợ hạn chế), giá trị thấp vì HS/RS đã bao phủ đa số use-case thực tế.

---

## 4. Đề xuất Roadmap bổ sung (Phase 3.5 — Audit Remediation)

> Đề xuất thêm vào `ROADMAP.md` như 1 phase mới, chèn giữa Phase 3 (đã xong) và Phase 4
> (PWA/kiếm tiền), thực hiện ở phiên làm việc riêng theo đúng quy trình 1-task/lần của
> `CLAUDE.md`. Audit này CHƯA tự ý sửa `ROADMAP.md` — chỉ đề xuất checklist dưới đây để
> người dùng duyệt/chèn thủ công hoặc yêu cầu Claude Code chèn ở phiên sau.

```
## Phase 3.5 — Audit Remediation (từ audit 2026-07-29, xem AUDIT.md)

### 3.5a — Sửa bug thật + rủi ro kỹ thuật (Critical)
- [ ] Fix JSON → Excel: bắt lỗi `handleDownload`, set `downloadError` đúng khi exceljs thất bại
- [ ] Fix Audio Converter: cảnh báo người dùng khi audio >2 kênh bị downmix về stereo
- [ ] Regex Tester: thêm debounce + guard/timeout chống ReDoS treo tab

### 3.5b — Accessibility pass toàn site (Critical)
- [ ] Thêm skip-to-content link trong Layout.astro
- [ ] Thêm focus-trap + trả focus cho sidebar mobile khi đóng
- [ ] Rà soát 20 tool: thêm `aria-live="polite"` cho mọi vùng thông báo lỗi/kết quả động
- [ ] Rà soát 20 tool: thêm `role=`/`sr-only` có hệ thống cho input/button/status quan trọng
- [ ] Đo lại bằng Lighthouse + axe DevTools sau khi sửa, xác nhận điểm Accessibility ≥ 90

### 3.5c — Nhất quán trải nghiệm giữa các tool cùng nhóm (High)
- [ ] Image Format Converter: thêm "Download All .zip"
- [ ] Color Picker: thêm phản hồi "Copied" cho nút export CSS/JSON
- [ ] CSV↔JSON Converter: thêm bảng preview trước convert

### 3.5d — Feature parity trọng điểm (High)
- [ ] SVG Optimizer: mở rộng danh sách plugin SVGO có thể bật/tắt riêng lẻ
- [ ] Word Counter: thêm copy/export, char-limit preset, readability score
- [ ] Video Trim: timeline kéo-2-tay-cầm thay 2 slider; offload FFmpeg sang Web Worker
- [ ] Markdown Editor: autosave localStorage

### 3.5e — SEO nâng cao (High)
- [ ] Thêm `FAQPage` JSON-LD cho 20 trang tool (tận dụng nội dung article có sẵn)
- [ ] Xác minh/bổ sung Open Graph + Twitter Card tag trong Layout.astro
- [ ] Chạy Lighthouse SEO thật, xác nhận ≥ 90 mọi trang (đối chiếu CLAUDE.md checklist)

### 3.5f — PWA nền tảng (đẩy sớm hơn trong Phase 4)
- [ ] manifest.json + service worker cơ bản (ưu tiên trước AdSense vì giá trị conversion/SEO cao hơn)
```

---

## 5. Giới hạn của audit này (minh bạch)

- Không truy cập internet trực tiếp để xác minh tính năng **mới nhất** của từng benchmark
  (TinyPNG/Squoosh/jwt.io... có thể đã thêm tính năng mới sau kiến thức huấn luyện) — điểm
  parity dựa trên hiểu biết chuyên môn về các sản phẩm này, không phải chụp màn hình trực
  tiếp hôm nay.
- Không chạy `npm run build`/Lighthouse thật (audit chạy ở chế độ chỉ-đọc) — điểm
  Performance/Core Web Vitals là ước tính từ code, cần đo thật ở bước remediation (mục
  M10/3.5e ở trên).
- Không test thật bằng trình duyệt/Puppeteer trong audit này — mọi phát hiện UI/UX suy ra
  từ đọc JSX/Tailwind class, không phải quan sát trực quan. Một số chi tiết animation/
  spacing tinh tế có thể cần xác nhận lại bằng mắt thường khi bắt tay sửa.
