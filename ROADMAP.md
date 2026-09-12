# ROADMAP.md — Web Tool Hub (Client-Side, Zero Server Cost)

> Mỗi dòng `- [ ]` là MỘT task. Tick thành `- [x]` ngay khi xong theo quy trình trong
> `CLAUDE.md`. Không được tick nếu chưa build thử thành công.

---

## Phase 0 — Nền tảng & Hạ tầng

- [x] Khởi tạo dự án Astro + TypeScript
- [x] Cài Tailwind CSS + Shadcn/UI
- [x] Cấu hình i18n cho 8 ngôn ngữ: en, vi, es, pt, fr, de, ja, ko (đổi từ astro-i18next
      sang i18n routing native của Astro + i18next thuần — xem lý do trong `PROGRESS.md`)
- [x] Xây layout chung: Header (menu danh mục công cụ), Footer, Sidebar
- [x] Thêm banner cố định "100% Privacy — Files Stay On Your Device" trong layout
- [x] Cấu hình cấu trúc URL chuẩn: `/{lang}/tools/{slug-ban-dia-hoa}`
- [x] Cấu hình dark mode
- [x] Cấu hình sitemap.xml tự động sinh + robots.txt
- [x] Setup CI/CD: deploy tự động lên Cloudflare Pages khi push
- [x] Kiểm tra Lighthouse trên trang chủ rỗng (mục tiêu ≥ 90 mọi mục)

## Phase 1 — 10 công cụ cốt lõi

Mỗi công cụ = 1 task riêng biệt. Với mỗi công cụ: build UI, tích hợp thư viện, dùng
Web Worker nếu xử lý nặng, áp checklist SEO trong `CLAUDE.md`, thêm string i18n cho cả
8 ngôn ngữ.

- [x] 1. Nén ảnh (JPEG/PNG/WebP) — `browser-image-compression`
- [x] 2. Chuyển đổi định dạng ảnh — HTML5 Canvas API
- [x] 3. Xóa nền ảnh (AI, chạy local) — `@imgly/background-removal`
- [x] 4. Gộp PDF (Merge) — `pdf-lib`
- [x] 5. Tách PDF (Split) — `pdf-lib`
- [x] 6. So sánh văn bản (Diff Checker) — `diff` (jsdiff)
- [x] 7. Đếm từ & ký tự — JS thuần
- [x] 8. JSON Formatter & Validator — Monaco editor hoặc jsoneditor
- [x] 9. QR Code Generator (tùy chỉnh màu, logo giữa) — `qrcode.react` + Canvas
- [x] 10. Chuyển đổi Case văn bản (upper/lower/Title/camelCase/snake_case) — JS thuần

## Phase 1.5 — Rà soát & Nâng cấp 10 công cụ cốt lõi (Feature Parity)

> Mục tiêu: đưa 10 công cụ từ mức "MVP chạy được" lên mức "ngang tầm đối thủ đầu ngành".
> Với mỗi công cụ: liệt kê đối thủ → so sánh gap → nâng cấp → build thử → tick → log.
> Áp dụng đúng "Checklist Feature Parity" trong `CLAUDE.md`.

- [x] **1. Nén ảnh** — benchmark: TinyPNG, Squoosh, iLoveIMG
  - [x] Upload/xử lý hàng loạt (nhiều ảnh cùng lúc), không chỉ 1 ảnh
  - [x] Thanh trượt điều chỉnh mức nén (quality slider), xem preview trước/sau
  - [x] Hiển thị % giảm dung lượng, so sánh before/after side-by-side
  - [x] Nút "Download All" dưới dạng .zip khi xử lý nhiều ảnh
  - [x] Kéo-thả (drag & drop) file vào khung upload

- [x] **2. Chuyển đổi định dạng ảnh** — benchmark: Convertio, CloudConvert, iLoveIMG
  - [x] Hiện tại chỉ hỗ trợ 3 định dạng → mở rộng tối thiểu: JPG, PNG, WebP, AVIF, BMP,
        GIF (tĩnh), ICO
  - [x] Thêm hỗ trợ đọc file HEIC (dùng `heic2any` hoặc tương đương chạy client-side)
        vì ảnh từ iPhone rất phổ biến
  - [x] Xử lý hàng loạt + chọn định dạng đích chung cho tất cả file
  - [x] Cho chọn chất lượng output khi convert sang định dạng có nén (JPG/WebP)

- [x] **3. Xóa nền ảnh** — benchmark: remove.bg, Adobe Express Background Remover
  - [x] Preview dạng slider kéo qua lại trước/sau khi xóa nền
  - [x] Cho phép thay nền bằng màu solid hoặc ảnh khác sau khi xóa
  - [x] Xử lý hàng loạt nhiều ảnh
  - [x] Nút tinh chỉnh viền (edge refinement) — thư viện không hỗ trợ trực tiếp, tự làm
        mềm alpha edge bằng box blur JS thuần thay thế

- [ ] **4 & 5. Gộp/Tách PDF** — benchmark: iLovePDF, Smallpdf, PDF2GO (3/4 mục con xong, còn
      thiếu nén PDF — xem log `PROGRESS.md` 2026-07-25)
  - [x] Hiển thị thumbnail từng trang, cho kéo-thả sắp xếp lại thứ tự trước khi gộp
  - [x] Tách PDF: cho chọn theo range trang, tách mỗi N trang, hoặc extract trang chỉ định
  - [x] Thêm chức năng xoay trang, xóa trang riêng lẻ
  - [ ] Thêm chức năng nén PDF (giảm dung lượng) nếu khả thi client-side — CHƯA làm, để lại
        cho một lượt sau (không phải lỗi chặn, chỉ là hạng mục chưa bắt đầu)

- [x] **6. So sánh văn bản (Diff Checker)** — benchmark: Diffchecker.com
  - [x] **Ưu tiên cao nhất**: highlight trực tiếp (inline) phần khác biệt ngay trên khung
        văn bản — thêm/xóa/sửa từng từ hoặc ký tự phải tô màu ngay tại chỗ, không chỉ in
        ra danh sách khác biệt bên dưới
  - [x] Chế độ xem song song (side-by-side) có cuộn đồng bộ 2 khung
  - [x] Tùy chọn: ignore khoảng trắng, ignore hoa/thường, so sánh theo dòng hoặc theo từ
  - [x] Đếm số dòng/từ đã thêm, xóa, sửa

- [x] **7. Đếm từ & ký tự** — benchmark: WordCounter.net
  - [x] Thêm: thời gian đọc ước tính, thời gian nói ước tính
  - [x] Đếm số đoạn văn (paragraph), số câu
  - [x] Bảng tần suất từ xuất hiện nhiều nhất (keyword density)

- [x] **8. JSON Formatter & Validator** — benchmark: JSONFormatter.org, JSONLint
  - [x] Chế độ xem dạng cây (tree view) có thể thu gọn/mở rộng từng node
  - [x] Toggle nhanh giữa Beautify và Minify
  - [x] Báo lỗi cú pháp kèm số dòng chính xác, highlight dòng lỗi
  - [x] Convert JSON → XML/YAML/CSV

- [x] **9. QR Code Generator** — benchmark: qr-code-generator.com
  - [x] Hỗ trợ nhiều loại nội dung: URL, plain text, WiFi, vCard, email, SMS
  - [x] Tùy chỉnh màu sắc, chèn logo giữa, chọn mức error correction (L/M/Q/H)
  - [x] Export ở nhiều định dạng: PNG (chọn độ phân giải), SVG

- [x] **10. Chuyển đổi Case văn bản** — benchmark: ConvertCase.net
  - [x] Thêm các kiểu: Sentence case, aLtErNaTiNg CaSe, iNVERSE cASE
  - [x] Thêm tiện ích phụ: xóa khoảng trắng thừa, xóa xuống dòng thừa, sắp xếp các dòng
        theo alphabet

## Phase 2 — SEO chuyên sâu & nhân bản đa ngôn ngữ

- [x] Mở rộng i18n từ 8 lên 15–20 ngôn ngữ
- [x] Viết lại meta title/description tối ưu từ khóa cho từng ngôn ngữ (không dịch máy thô)
- [x] Soát lại toàn bộ 10 trang công cụ để đảm bảo schema JSON-LD đúng chuẩn
- [x] Viết nội dung SEO 300–500 từ riêng biệt cho từng công cụ × từng ngôn ngữ chính
- [x] Xây internal linking map giữa các công cụ cùng nhóm (ảnh↔ảnh, PDF↔PDF...)
- [ ] Submit sitemap lên Google Search Console (Chưa có public domain tạm thời chưa làm)
- [ ] Submit sitemap lên Bing Webmaster Tools (Chưa có public domain tạm thời chưa làm)
- [x] Audit Core Web Vitals toàn site, fix mọi trang < 90 điểm

## Phase 3 — Mở rộng công cụ ngách (Long-tail)

- [x] JWT Decoder
- [x] Base64 Encode/Decode
- [x] Regex Tester
- [x] SVG Optimizer — `svgo`
- [x] Color Picker & Palette Generator
- [x] CSV ↔ JSON Converter — `papaparse`
- [x] JSON → Excel Converter — `exceljs`
- [x] Markdown Viewer/Editor — `marked` + `dompurify`
- [x] Trim video ngắn — `ffmpeg.wasm` (`@ffmpeg/ffmpeg` + `@ffmpeg/util`, core engine tải qua jsDelivr CDN)
- [x] Chuyển đổi Audio MP3 ↔ WAV — Web Audio API (decode) + `@breezystack/lamejs` (encode MP3) +
      WAV header viết tay, mã hóa trong Web Worker

## Phase 3.5 — Audit Remediation (từ audit 2026-07-29, xem `AUDIT.md`)

### 3.5a — Sửa bug thật + rủi ro kỹ thuật (Critical)
- [x] Fix JSON → Excel: bắt lỗi `handleDownload`, set `downloadError` đúng khi exceljs thất bại
- [x] Fix Audio Converter: cảnh báo người dùng khi audio >2 kênh bị downmix về stereo
- [x] Regex Tester: thêm debounce + guard/timeout chống ReDoS treo tab

### 3.5b — Accessibility pass toàn site (Critical)
- [x] Thêm skip-to-content link trong Layout.astro
- [x] Thêm focus-trap + trả focus cho sidebar mobile khi đóng
- [x] Rà soát 20 tool: thêm `aria-live="polite"` cho mọi vùng thông báo lỗi/kết quả động
- [x] Rà soát 20 tool: thêm `role=`/`sr-only` có hệ thống cho input/button/status quan trọng
- [x] Đo lại bằng Lighthouse + axe DevTools sau khi sửa, xác nhận điểm Accessibility ≥ 90

### 3.5c — Nhất quán trải nghiệm giữa các tool cùng nhóm (High)
- [x] Image Format Converter: thêm "Download All .zip"
- [x] Color Picker: thêm phản hồi "Copied" cho nút export CSS/JSON
- [x] CSV↔JSON Converter: thêm bảng preview trước convert

### 3.5d — Feature parity trọng điểm (High)
- [x] SVG Optimizer: mở rộng danh sách plugin SVGO có thể bật/tắt riêng lẻ
- [x] Word Counter: thêm copy/export, char-limit preset, readability score
- [x] Video Trim: timeline kéo-2-tay-cầm thay 2 slider; offload FFmpeg sang Web Worker
- [x] Markdown Editor: autosave localStorage

### 3.5e — SEO nâng cao (High)
- [x] Thêm `FAQPage` JSON-LD cho 20 trang tool (tận dụng nội dung article có sẵn)
- [x] Xác minh/bổ sung Open Graph + Twitter Card tag trong Layout.astro
- [x] Chạy Lighthouse SEO thật, xác nhận ≥ 90 mọi trang (đối chiếu CLAUDE.md checklist)

### 3.5f — PWA nền tảng (đẩy sớm hơn trong Phase 4)
- [ ] manifest.json + service worker cơ bản (ưu tiên trước AdSense vì giá trị conversion/SEO cao hơn)

### 3.5g — Text Diff Checker: nâng cấp theo yêu cầu trực tiếp người dùng (2026-07-29)
- [x] Character-level diff cho từ bị thay thế trong Word mode (không còn highlight cả từ khi
      chỉ khác vài ký tự — kiến trúc Line → Word → Character kiểu DiffChecker/GitHub)
- [x] Sửa bug thật lộ ra khi test: 2 dòng giống hệt nhau bị `diffLines` gắn nhầm nhãn "modified"
- [x] Thêm 3 tùy chọn ignore còn thiếu: ignore empty lines, normalize line endings (CRLF/LF),
      Unicode normalization
- [x] Chuyển việc tính diff sang Web Worker riêng (`textDiffWorker.ts`), không đứng UI
- [x] Virtualization (windowed rendering) cho khu vực so sánh chính, hỗ trợ file rất lớn
      (100k+ dòng) — đã đổi `jumpToHunk` từ `scrollIntoView` sang tính `scrollTop` toán học;
      đã virtualize luôn cả Merge Tool (3 cột) và line-number gutter của 2 textarea input.
      Xem chi tiết trong PROGRESS.md.

## Phase 3.6 — Audit Remediation vòng 2 (từ `AUDIT.md`, mục Medium)

- [x] Image Compressor: xử lý song song (có giới hạn concurrency) thay vì tuần tự khi
      batch nhiều ảnh
- [x] Image Compressor + Image Converter: thêm tùy chọn resize kích thước trước khi xuất
- [x] QR Generator: thêm dot-style/gradient cơ bản (`qr-code-styling`)
- [x] Contrast/`focus-visible` pass có chủ đích trên toàn bộ input/select/textarea
      tương tác (button đã có sẵn qua `button.tsx`)
- [x] Trang chủ: bỏ hẳn ô "0 KB uploaded" placeholder tĩnh không có dữ liệu thật
- [x] `client:load` → `client:visible` cho phần article/related-tools dưới fold —
      **N/A, đã đánh giá**: mỗi trang tool chỉ có 1 React island duy nhất là chính
      component tool (không phải nội dung dưới fold); phần article/FAQ/related-tools
      đã là Astro thuần (server-render), không có gì để đổi client directive
- [x] Base64: mở rộng bảng MIME→extension
- [x] JWT Decoder: hiển thị `aud`/`iss`/`sub` tường minh trong claims panel

### 3.6b — Feature parity bắt buộc so với đối thủ (từ `AUDIT.md` mục 2, chưa từng lên
ROADMAP)

> Trích từ phần so sánh benchmark từng công cụ trong `AUDIT.md` (mục 2). Đã loại các gap mà
> audit tự đánh giá "chấp nhận được"/ngoài phạm vi kỹ thuật hợp lý (Diffchecker hỗ trợ PDF/
> Word/ảnh, Markdown Editor sync cloud/GitHub — phá nguyên tắc client-side-only) và các mục
> đã xếp 🟢 Low trong `AUDIT.md` (font bubble Text Case, JWT ES*/PS*/EdDSA). Các gap đã sửa ở
> Phase 3.5/3.6 (vd. Download All .zip Image Converter, Copied feedback Color Picker, preview
> CSV↔JSON, plugin SVGO, autosave Markdown...) không lặp lại ở đây.

**Nhóm Ảnh**
- [x] Nén ảnh — vs TinyPNG/Squoosh: chọn định dạng đích ngay lúc nén (WebP/AVIF/MozJPEG output)
- [x] Nén ảnh — vs TinyPNG/Squoosh: chế độ "target size" (nén tới X KB thay vì chỉ theo %)
- [x] Nén ảnh — nút Retry riêng cho ảnh bị lỗi (hiện phải xóa + upload lại)
- [x] Chuyển đổi định dạng ảnh — xử lý song song thay vì tuần tự (M1 trước đó CHỈ sửa Image
      Compressor, Image Converter vẫn còn vòng lặp tuần tự)
- [x] Chuyển đổi định dạng ảnh — ICO xuất đa kích thước (multi-size icon), không chỉ 256px
- [x] Xóa nền ảnh — vs remove.bg: thanh tiến trình TỔNG khi xử lý hàng loạt (hiện chỉ có %
      của ảnh hiện tại)
- [x] Xóa nền ảnh — Download All .zip khi xử lý nhiều ảnh (nhất quán với Compressor/Splitter)
- [x] Xóa nền ảnh — crop/resize ảnh sau khi xóa nền

**Nhóm PDF**
- [x] Gộp PDF — vs iLovePDF/Smallpdf: preview file PDF gộp cuối cùng trước khi tải
- [x] Gộp PDF — xử lý/báo lỗi riêng cho PDF có mật khẩu (thay vì lỗi chung chung)
- [x] Gộp PDF — cảnh báo giới hạn dung lượng nếu file quá lớn
- [x] Tách PDF — vs iLovePDF/Smallpdf: chọn trang kiểu checkbox đa lựa chọn (không chỉ cú
      pháp range)
- [x] Tách PDF — preview từng file kết quả trước khi tải
- [x] Tách PDF — kéo-thả sắp xếp lại thứ tự trang

**Nhóm Văn bản & Dữ liệu**
- [x] So sánh văn bản — vs Diffchecker.com: link chia sẻ kết quả so sánh
- [x] Đếm từ & ký tự — vs WordCounter.net: upload file để đếm (không chỉ paste text)
- [x] JSON Formatter — vs JSONFormatter.org/JSONLint: nút "Validate" tường minh + badge
      trạng thái riêng biệt
- [ ] JSON Formatter — expose JSON Schema validation cho người dùng (đã import
      `SchemaValidationError` nhưng chưa dùng tới)
- [x] JSON Formatter — so sánh 2 JSON (diff)
- [x] Chuyển đổi Case văn bản — vs ConvertCase.net: Title Case có danh sách từ ngoại lệ
      (of/the/and...)
- [x] Chuyển đổi Case văn bản — hiển thị đếm từ/ký tự cạnh output
- [x] Chuyển đổi Case văn bản — upload/download file
- [x] CSV↔JSON Converter — vs CloudConvert/Convertio: batch nhiều file
- [x] CSV↔JSON Converter — hỗ trợ TSV như 1 option riêng

**Nhóm Dev/Design Tools**
- [x] JWT Decoder — vs jwt.io: URL deep-link chia sẻ token debug (`?token=...`)
- [x] JWT Decoder — cảnh báo khi `alg: none`
- [x] Base64 — vs base64decode.org: batch nhiều file
- [x] Base64 — chọn encoding khác ngoài UTF-8
- [ ] Regex Tester — vs regex101/RegExr: bộ chọn "flavor" (PCRE/Python/...)
- [x] Regex Tester — lưu lịch sử pattern
- [x] Regex Tester — URL chia sẻ state
- [x] Color Picker — vs Coolors/Adobe Color: export ASE/SCSS/Tailwind config
- [x] Color Picker — trích xuất palette từ ảnh ("Image to Palette" — tính năng chủ lực Coolors)
- [x] Color Picker — lưu palette yêu thích (localStorage)
- [x] Color Picker — hex nhận cả dạng rút gọn 3 ký tự

**Nhóm Media & QR**
- [x] QR Generator — vs qr-code-generator.com: frame/CTA text dưới QR (dot-style/gradient đã
      xong ở 3.6a, còn thiếu khung viền + dòng chữ kêu gọi hành động)
- [x] QR Generator — batch tạo nhiều QR cùng lúc
- [x] Markdown Editor — vs StackEdit/Dillinger: syntax highlighting thật cho editor (hiện
      chỉ là `<textarea>` thuần)
- [x] Markdown Editor — keyboard shortcut Ctrl+B/Ctrl+I
- [ ] Trim video ngắn — vs Clideo/CloudConvert: multi-clip (nhiều đoạn cắt), crop khung hình,
      watermark
- [ ] Chuyển đổi Audio MP3↔WAV — vs CloudConvert: thêm định dạng AAC/OGG/FLAC/M4A
- [x] Chuyển đổi Audio MP3↔WAV — resample/normalize/fade

## Phase 3.7 — UX/UI Audit Remediation (từ audit trực tiếp người dùng yêu cầu, 2026-07-31)

> Nguồn: audit UX/UI toàn site theo 18 tiêu chí (đánh giá UI từng thành phần, luồng UX,
> visual hierarchy, typography, color system, spacing, component audit, upload/processing/
> result experience, micro-interaction, empty state, mobile UX, accessibility, benchmark
> với 10 đối thủ, design system, bảng ưu tiên). Phát hiện cốt lõi xuyên suốt: `src/components/
> ui/` chỉ có DUY NHẤT 1 component dùng chung (`button.tsx`) — không Card/Dialog/Tooltip/
> Dropdown/Tabs/Progress/Toast/Badge/Switch nào tồn tại, nên cả 20 tool tự vẽ tay các phần đó
> riêng lẻ và trôi dạt khỏi nhau. Thứ tự các task dưới đây theo đúng bảng ưu tiên (impact/
> effort) của audit — KHÔNG làm task sau trước task trước vì phần lớn phụ thuộc vào Card/
> Dialog/Tooltip ở task 1.

- [x] 1. Xây `Card`, `Dialog`, `Tooltip` dùng chung trong `src/components/ui/` (dựng trên
      `@base-ui/react`, cùng pattern `cva` với `button.tsx` hiện có — không thêm thư viện
      UI kit mới)
- [x] 2. Color tokens: thêm `--primary` riêng cho `.dark` trong `global.css` (đề xuất
      `#10B981`, đo contrast ~7.67:1 trên nền tối, so với `#047857` dùng chung 2 theme hiện
      tại chỉ đạt 3.28–3.55:1 — fail WCAG AA chữ thường) + định nghĩa token
      `--shadow-sm/md/lg` (hiện chưa có token shadow nào)
- [x] 3. Progress % thật + trạng thái hàng đợi ("Đang xử lý N/M") cho tool xử lý hàng loạt,
      bắt đầu từ Image Compressor rồi áp dụng lại cho các tool batch khác (thay trạng thái
      nhị phân pending/processing/done hiện tại)
- [x] 4. Định nghĩa type scale thật trong `global.css` (size/weight/line-height/letter-
      spacing theo từng vai trò: display/heading/body/label/mono) dùng trục weight sẵn có
      của Space Grotesk Variable — KHÔNG thêm font mới (đúng quy tắc "không thêm dependency
      nếu chưa cần thiết")
- [x] 5. Touch target nút bấm ≥44px dưới `sm:` + bổ sung breakpoint responsive còn thiếu ở
      `ImageCompressor.tsx`/`PdfMerger.tsx` (hiện 0 breakpoint, chỉ dựa `flex-wrap`)
- [x] 6. Micro-interaction có chủ đích (upload/success/error/delete/expand-collapse) kèm
      `@media (prefers-reduced-motion: reduce)` ngay từ đầu, không thêm sau
- [x] 7. Before/after so sánh dạng slider kéo được cho Result Page (thay 2 thumbnail tĩnh
      hiện tại), bắt đầu từ Image Compressor
- [x] 8. Footer 3 cột tối giản (Công cụ theo nhóm / Pháp lý / Ngôn ngữ) + thêm trang/link
      Privacy Policy (hiện footer chỉ có 1 dòng copyright, không có link pháp lý nào dù sản
      phẩm định vị privacy-first)
- [x] 9. Empty state thiết kế đầy đủ (không file / không kết quả tìm kiếm / không lịch sử /
      lỗi upload) — có icon + câu giải thích + hành động tiếp theo, thay vì danh sách rỗng
      không nội dung
- [x] 10. Hero trang chủ chuyển sang task-oriented (ô thả file/tìm kiếm làm trung tâm) thay
      vì hero thuần chữ hiện tại (kicker+H1+tagline+2 pill, không CTA/bằng chứng sản phẩm)

## Phase 3.8 — Audit Remediation vòng 3 (từ audit tương tác thật người dùng gửi, 2026-08-01)

> Nguồn: báo cáo kiểm thử tương tác thật (browser Chromium) trên toàn bộ 20 công cụ + trang chủ
> + SEO/security/accessibility, người dùng tự chạy và gửi trực tiếp. Giới hạn của báo cáo gốc
> (không phải task agent tự làm được nếu thiếu công cụ): không có Lighthouse/DevTools Performance
> thật (số liệu định tính), chỉ 1 engine Chromium (chưa test Safari/WebKit thật), không đo được
> responsive trực quan ở từng breakpoint (chỉ suy luận qua DOM/CSS), chưa chạy thử conversion
> thực tế Video Trimmer/MP3↔WAV (thiếu file mẫu), chưa soát reciprocal đầy đủ 20×20 cặp hreflang
> ở quy mô lớn — các mục này KHÔNG lên checklist bên dưới, để lại cho người dùng tự kiểm tra thủ
> công trước khi launch.

### 3.8a — Bug thật Critical (phát hiện qua thao tác thật trên UI)
- [x] QR Code Generator: sửa báo sai "content too long" với nội dung hợp lệ/ngắn
- [x] JSON Formatter: sửa treo tab khi Format (Ctrl+I) trên JSON sai cú pháp
- [x] Text Case Converter: sửa snake_case/camelCase phá dữ liệu tiếng Việt có dấu (Unicode)

### 3.8b — Bug thật High
- [x] Compress Image: sửa hiển thị kết quả nén cũ khi đổi "By quality" → "By target size"
- [x] Regex Tester: panel Matches không tự cập nhật khi chỉ sửa Test String (phải bấm lại ô
      Pattern mới refresh)
- [x] SVG Optimizer: nhãn % sai khi file "tối ưu" lại LỚN hơn bản gốc (vẫn ghi "0% smaller")
- [x] Disable nút submit khi input rỗng (Merge PDF và các nút tương tự) — hiện bấm không có
      phản hồi gì
- [x] Trang chủ: chip "20 tools · 5 categories" không cập nhật số theo kết quả đang lọc

### 3.8c — UX/Feature gap Medium
- [x] Convert Image Format: thêm before/after slider (nhất quán với Compress Image đã có)
- [x] Trang 404 tùy chỉnh (nav + search + logo) thay vì mặc định Astro
- [x] Thêm og:image/twitter:image mặc định + theo từng nhóm công cụ
- [x] SVG Optimizer: cảnh báo <script> còn sót lại sau tối ưu là rủi ro XSS nếu nhúng inline
      (hành vi mặc định của svgo, không phải bug — chỉ cần cảnh báo)
- [x] Markdown Editor: sửa xung đột auto-continue list khi Enter với nội dung dán sẵn bắt đầu
      bằng "-"
- [x] Cấu hình response security headers (CSP, X-Content-Type-Options, Referrer-Policy,
      X-Frame-Options/frame-ancestors) cho Cloudflare qua file `public/_headers`
- [x] Rà soát lại aria-live cho trạng thái động (progress %, "Copied!") — Phase 3.5b từng làm,
      xác nhận còn thiếu chỗ nào không
- [x] Remove Background / Video Trim / Audio Converter: tách label "đang tải model/engine lần
      đầu" khác với "đang xử lý" để người dùng không tưởng bị treo
- [x] Thêm Undo tối thiểu (Ctrl+Z) cho thao tác nhiều bước (xoay/xoá trang PDF, Markdown editor)

## Phase 3.9 — 2 công cụ DevOps mới (theo yêu cầu trực tiếp người dùng, 2026-08-09)

> Nguồn: prompt trực tiếp từ người dùng yêu cầu thêm Nginx Config Validator & Kubernetes YAML
> Validator, có kèm route đề xuất cho các trang tham khảo directive/error/resource (SEO
> long-tail). Làm theo từng bước, dừng lại xin duyệt giữa các bước — xem chi tiết quyết định
> (routing/i18n/testing) trong log `PROGRESS.md` 2026-08-09.

### 3.9a — Nginx Config Validator (Step 1 — ĐÃ XONG)

- [x] Module logic thuần `src/lib/nginx-parser.ts` (tokenizer, phát hiện lỗi cấu trúc/context/
      bảo mật, regex tester, rewrite/return simulator, auto-fix) — tách khỏi UI, có test
- [x] Cài Vitest làm devDependency đầu tiên của repo (`npm test`), viết 20 test case cho parser
- [x] Component `NginxConfigValidator.tsx` + trang `NginxConfigValidatorPage.astro`
- [x] Đăng ký route `/{locale}/tools/nginx-config-validator/` (20 locale) trong `tools.ts` +
      wire vào `[slug].astro`, đúng convention routing hiện có (không tạo route trần riêng)
- [x] i18n: `ui.*`/`heading`/`tagline`/`related` dịch đủ 20 ngôn ngữ; `meta.*`/`faq.*`/
      `article.*` (nội dung SEO dài) chỉ en+vi trước, 18 ngôn ngữ còn lại fallback tiếng Anh
- [ ] Các trang tham khảo `/{locale}/nginx/directives/[directive]`,
      `/{locale}/nginx/errors/[error-slug]`, `/{locale}/nginx/examples/[use-case]` — CHƯA làm,
      để sau khi duyệt mẫu 3-5 trang (bước 5 trong prompt gốc)

### 3.9b — Kubernetes YAML Validator (Step 2 — ĐÃ XONG, chờ duyệt Step 3)

- [x] Module logic `src/lib/k8s-yaml-validator.ts` (parse YAML giữ vị trí dòng bằng package
      `yaml` + `LineCounter`, validate theo JSON Schema qua `ajv`, fetch schema on-demand từ
      CDN jsdelivr mirror của `yannh/kubernetes-json-schema` theo kind/version — đã xác nhận
      URL thật qua WebFetch trước khi code, không đoán — phát hiện deprecated apiVersion +
      auto-fix, hỗ trợ multi-document `---`)
  - Đã thêm dependency mới: `yaml` + `ajv` (người dùng đã xác nhận trong prompt gốc)
- [x] Component `KubernetesYamlValidator.tsx` + trang `KubernetesYamlValidatorPage.astro`,
      đăng ký route `/{locale}/tools/kubernetes-yaml-validator/` (20 locale) trong `tools.ts`
- [x] i18n: `ui.*`/`heading`/`tagline`/`related` đủ 20 ngôn ngữ; `meta.*`/`faq.*`/`article.*`
      chỉ en+vi trước (cùng quy ước với 3.9a)
- [x] Test cho parser/validator (`src/lib/__tests__/k8s-yaml-validator.test.ts`, mock `fetch`
      để không phụ thuộc mạng khi chạy test — phát hiện 1 bug thật trong chính bộ test lúc
      viết: cache module-level bị nhiễm bởi 1 lần fetch thật chưa mock ở block test trước)
- [ ] Trang tham khảo `/{locale}/k8s/resources/[kind]`, `/{locale}/k8s/errors/[error-slug]` —
      sau khi duyệt mẫu
- [ ] `/{locale}/k8s/api-versions/[migration-slug]` và `/{locale}/compare/kubeval-vs-kubeconform`
      — Phase sau, chưa làm ngay (đúng như prompt gốc yêu cầu)

## Phase 3.10 — Text Diff Checker: nút Format JSON/XML (theo yêu cầu trực tiếp người dùng, 2026-09-12)

> Nguồn: người dùng yêu cầu xem xét thêm chức năng format (làm đẹp) XML/JSON ngay trong công
> cụ So sánh văn bản, để so 2 payload API/config bị minify khác cách không báo "khác toàn bộ"
> một cách giả. Không thêm dependency mới — dùng `JSON.parse/stringify` + `DOMParser`/
> `XMLSerializer` có sẵn của browser.

- [x] Module thuần `src/lib/text-format.ts`: auto-detect JSON/XML, beautify, có test
      (`src/lib/__tests__/text-format.test.ts`; nhánh XML dùng `DOMParser` không test được
      trong Vitest môi trường Node mặc định — không có `jsdom`/`happy-dom` — chỉ test nhánh
      JSON + fallback null, nhánh XML xác minh tay trên browser thật)
- [x] Nút "Format" cho từng khung nhập (Original/Changed) trong `TextDiffChecker.tsx`, phản
      hồi `aria-live` cho biết đã format theo JSON/XML hay không nhận diện được
- [x] i18n: 4 key mới (`formatButton`/`formatDetectedJson`/`formatDetectedXml`/`formatError`)
      — ban đầu chỉ thêm en+vi (tool cũ này thực tế đã có tiền lệ: các key thêm ở Phase
      3.5g/3.6b như `copyShareLink`, cả khối `faq` v.v. cũng chỉ có ở en+vi, 18 locale còn lại
      đang fallback tiếng Anh âm thầm cho các key đó)
- [x] **Việc phụ đã xử lý (theo yêu cầu trực tiếp người dùng)**: dịch bổ sung đủ 18 locale còn
      thiếu — 9 key UI (`ignoreEmptyLines`/`normalizeLineEndings`/`normalizeUnicode`/
      `computing`/`copyShareLink`/`formatButton`/`formatDetectedJson`/`formatDetectedXml`/
      `formatError`) + toàn bộ khối `faq` (heading + 3 câu hỏi/đáp) — dịch tay từng ngôn ngữ
      (không máy dịch thô), không chỉ riêng 4 key mới của task này mà dọn sạch luôn phần nợ
      dịch cũ từ Phase 3.5g/3.6b. Cả 20 locale giờ đủ 37 key `ui` + 7 key `faq`, đã build lại
      full site (502 trang, exit 0) và grep xác nhận HTML thật của de/ja/ru/ar/zh có chữ đã
      dịch (không chỉ tin JSON đúng).
- [x] **QA senior-tester pass (theo yêu cầu trực tiếp người dùng, test thật bằng Puppeteer
      trên bundle production)**: tìm + sửa 1 bug High (tràn ngang mobile ở hàng checkbox
      ignore, có từ Phase 3.5g) + làm 3 cải tiến UX được đề xuất trong báo cáo:
  - [x] Diff side-by-side chuyển thành xếp chồng (stacked, có nhãn Original/Changed riêng)
        dưới breakpoint `md`, thay vì ép 2 cột ~180px khó đọc trên điện thoại
  - [x] Nút Clear giờ có Undo inline (giữ snapshot 6 giây, không cần dialog xác nhận gây
        vướng cho thao tác Clear-để-làm-lại bình thường)
  - [x] Autosave vào localStorage (theo đúng pattern Markdown Editor: debounce 500ms, xoá
        draft khi cả 2 ô rỗng, khôi phục sau F5) — có ưu tiên đúng: share-link hash luôn
        thắng draft cũ (verify bằng tab mới thật, không chỉ điều hướng hash trong cùng tab)
  - [x] i18n 2 key mới (`clearedNotice`/`undo`) thêm đủ **cả 20 locale** ngay từ đầu (không
        để nợ lại như trước, vì tool này vừa mới được đưa về đủ parity ở mục trên)

## Phase 3.11 — Layout: khu vực tool + trang chủ không mở hết chiều rộng màn hình
(theo yêu cầu trực tiếp người dùng, 2026-09-12)

> Người dùng hỏi tại sao các trang không mở hết về phía bên phải trên màn rộng. Xác nhận
> bằng screenshot 1920px: đúng — khu vực tương tác của TOÀN BỘ 22 trang tool bị `max-w-4xl`/
> `max-w-5xl` ghim sát trái, để trống ~650px (~34% màn hình) bên phải; trang chủ cũng bị
> tương tự (hero `max-w-2xl` ghim trái, lưới danh mục cứng tối đa 2 cột). Đã hỏi người dùng 2
> quyết định thiết kế trước khi sửa hàng loạt: (1) khu vực tool → mở full-width, bỏ hẳn
> max-width; (2) bài viết SEO (article/FAQ) → giữ hẹp `max-w-3xl` để dễ đọc nhưng thêm căn
> giữa thay vì ghim trái.

- [x] 22 file `*Page.astro`: bỏ `max-w-2xl/3xl/4xl/5xl` khỏi wrapper khu vực tool (`<div
      class="mt-6 ...">`), giữ nguyên `mt-6` — dùng 1 script Node chạy 1 lần (áp dụng đồng
      loạt an toàn hơn sửa tay 22 file, xác nhận cả 22/22 khớp pattern giống hệt nhau trước
      khi chạy) thay vì sửa từng file
- [x] 22 file `*Page.astro`: thêm `mx-auto` vào wrapper `article` (`max-w-3xl` giữ nguyên) —
      cùng 1 script ở trên
- [x] `FaqSection.astro` (component dùng chung, không lặp lại per-file): thêm `mx-auto
      max-w-3xl` vào `<section>` gốc — phát hiện lúc làm: phần FAQ trước đây KHÔNG hề có
      max-width nào (không phải do task này gây ra), đã bị bỏ sót từ trước, tiện sửa luôn
      theo đúng tinh thần "article/FAQ giữ hẹp + căn giữa" người dùng vừa chọn
- [x] Trang chủ (`src/pages/[locale]/index.astro`): thêm `mx-auto` cho hero section
      (`max-w-2xl`); lưới danh mục thêm breakpoint `xl:grid-cols-3` (trước đó cứng tối đa 2
      cột `lg:grid-cols-2` dù màn hình rộng bao nhiêu) — không nằm trong 2 câu hỏi đã hỏi
      người dùng (chỉ hỏi về trang tool + article/FAQ), nhưng cùng root cause và đã dùng
      chính trang chủ làm bằng chứng minh họa lúc giải thích vấn đề, nên sửa luôn cho nhất
      quán — cần nói rõ với người dùng đây là phần mở rộng phạm vi tự quyết định
- [x] Verify: build lại full site (502 trang, exit 0), 39/39 test Vitest pass, screenshot
      1920px cho 5 trang đại diện (trang chủ, Text Diff, JSON Formatter, Regex Tester,
      Markdown Editor) xác nhận lấp đầy chiều rộng đúng ý, và screenshot/đo `scrollWidth` ở
      375px cho cùng 5 trang xác nhận KHÔNG có hồi quy tràn ngang mobile (bỏ max-width chỉ
      ảnh hưởng khi có đủ chỗ rộng hơn max-width cũ, không ảnh hưởng viewport hẹp)

## Phase 4 — Kiếm tiền & PWA

- [ ] Tích hợp Google AdSense: banner dưới nav
- [ ] Tích hợp Google AdSense: sidebar phải
- [ ] Tích hợp Google AdSense: banner dưới khu vực kết quả (sau khi bấm "Nén"/"Chuyển đổi")
- [ ] Affiliate banner ngữ cảnh cho nhóm Dev Tools (Vultr, DigitalOcean, Supabase)
- [ ] Affiliate banner ngữ cảnh cho nhóm PDF/Văn bản (office software, NordVPN)
- [ ] Nút "Buy Me a Coffee" ở footer
- [ ] PWA: manifest.json + service worker (dùng offline được)
- [ ] Cookie consent / GDPR banner (bắt buộc nếu có ads + traffic EU)

## Phase 5 — Launch & Growth

- [ ] QA cross-browser (Chrome, Firefox, Safari) + mobile
- [ ] Đăng ProductHunt
- [ ] Đăng Reddit: r/webdev, r/AlternativeTo, r/FreeTools
- [ ] Đăng Hacker News (Show HN)
- [ ] Setup Google Analytics hoặc Plausible (privacy-friendly)
- [ ] Theo dõi index coverage trên Search Console hàng tuần
