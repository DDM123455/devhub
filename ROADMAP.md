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
