# SEO_AUDIT.md — Web Tool Hub (kiểm toán 2026-10-10)

> Phạm vi: mã nguồn + **bản build thật** (`dist/`, 582 trang HTML, 20 ngôn ngữ). Lặp lại bằng
> `npm run build && npm run seo:audit` (script `scripts/seo-audit.mjs`, không phụ thuộc gói ngoài, thoát mã 1 nếu còn P0/P1).
> Bảng từng trang: [`SEO_PAGE_INVENTORY.csv`](SEO_PAGE_INVENTORY.csv). Test hồi quy: `src/lib/__tests__/seo-meta.test.ts`.

## A. Tóm tắt

- **Sức khoẻ kỹ thuật: tốt.** Sau sửa: P0 = 0, P1 = 0, P2 = 0 (script). Mọi trang có canonical tự trỏ, hreflang
  đủ 20 ngôn ngữ + x-default **đối ứng hai chiều** (0 lỗi trên 540 trang), JSON-LD hợp lệ (0 lỗi parse),
  0 ảnh thiếu `alt`, 0 liên kết nội bộ gãy, 0 trang mồ côi, sitemap khớp 100% trang đáng index.
- **Rủi ro lớn nhất không nằm ở code:** site chạy trên `devhub.duongdangmanh01.workers.dev` (tên miền con dùng chung), chưa
  gửi sitemap lên Search Console/Bing (ROADMAP Phase 2 vẫn treo). Đây là việc cần bạn làm (mục E).
- **Cơ hội tăng trưởng lớn nhất:** trang đích theo ý định tìm kiếm "so sánh/thay thế đối thủ" và "dùng cho tác vụ X",
  cộng liên kết chéo chủ đề (mục F). Đây là giả thuyết, chưa có dữ liệu Search Console để xác nhận.
- **Giới hạn:** chưa chạy Lighthouse/PageSpeed/CrUX (không có Chrome headless trong môi trường), chưa có dữ liệu Search Console,
  chưa kiểm HTTP header thật trên Cloudflare (chỉ thử qua server tĩnh áp `_headers` cục bộ). Số liệu hiệu năng bên dưới là
  **ước lượng phòng thí nghiệm từ file build**, không phải số đo người dùng thật.

## B. Sổ lỗi (issue register)

| ID | Mức | Hạng mục | Bằng chứng | Trạng thái / kiểm chứng |
|---|---|---|---|---|
| SEO-01 | P1 | Sitemap | 20 URL `/<locale>/tools/` (trang meta-refresh, `noindex`, canonical về trang chủ) nằm trong sitemap: 560 URL vs 540 trang đáng index | **Đã sửa** (`astro.config.mjs` filter). Sitemap còn 540; script báo `SITEMAP-REDIRECT` trước sửa, hết sau sửa |
| SEO-02 | P1 | Chuyển hướng | `/` và `/<locale>/tools/` sinh `content="2;url=…"` (302 → trễ 2 giây; Google coi refresh có độ trễ là yếu) | **Đã sửa**: 301 + `redirectToDefaultLocale:false`; `dist/index.html` nay `content="0;…"`. Vẫn chỉ là meta refresh, không phải HTTP 301 (xem OPEN-03) |
| SEO-03 | P1 | Tiêu đề trùng | 3 title dùng chung bởi 7 URL (Base64/SVG/Regex ở id, it, nl, sv đều "…Online Gratis — Web Tool Hub") | **Đã sửa** (it → "Gratuito", nl/sv → "Gratis Online"). Test `seo-meta` ép title **duy nhất trên cả 20 ngôn ngữ** |
| SEO-04 | P2 | Liên kết nội bộ | Merge PDF, Split PDF, MP3↔WAV, Video Trim chỉ có **1** liên kết "công cụ liên quan" (quy ước dự án 2–3) vì mỗi danh mục chỉ 2 công cụ | **Đã sửa**: `getRelatedTools()` thêm liên kết chéo có cơ sở (vd Merge PDF → Image Converter, OCR; Video Trim → Image Converter vì có xuất GIF). Đo lại: 2 liên kết/trang |
| SEO-05 | P2 | Dữ liệu có cấu trúc | Trang chủ 20 ngôn ngữ không có JSON-LD | **Đã thêm** `WebSite` (không `SearchAction` vì ô tìm kiếm chỉ lọc phía trình duyệt, không có URL cho crawler). Không thêm Organization/rating/review (không có dữ kiện thật) |
| SEO-06 | P3 | Meta description | en: code-formatter 218, sql-formatter 222, 3 tool khác ~175 ký tự; vi: 11 trang 166–228 | **Đã rút gọn en+vi** (≤165). 16 locale còn lại: **81 trang** > 175 ký tự (Google chỉ cắt hiển thị, không phải lỗi) — xem CSV, cột `issues` = `P3:desc-long` |
| SEO-07 | P3 | Title | en code-formatter 71 cột | **Đã sửa** (62 cột). Test: mọi locale ≤ 70 cột hiển thị (CJK tính 2) |
| SEO-08 | P3 | Cấu trúc heading | `text-case-converter` (mọi locale): H1 → H3 nhảy cấp | **Đã sửa** (H3 → H2); script: hết `heading-skip` |
| SEO-09 | — | Công cụ kiểm toán | Bản đầu của script báo 200 lỗi P0 giả (slug Ả Rập/Nhật… bị mã hoá phần trăm) và 46 "thin content" giả (CJK không có dấu cách) | **Đã sửa script** (giải mã URL, đếm CJK theo ký tự/2). Ghi lại để minh bạch: các con số trước đó không phải lỗi thật |

### Còn mở (không sửa được bằng code hoặc cần quyết định)

| ID | Mức | Việc | Ghi chú |
|---|---|---|---|
| OPEN-01 | P1 | **Tên miền riêng** thay `workers.dev` | Đổi domain = đổi toàn bộ canonical/hreflang/sitemap/OG; đặt `site` trong `astro.config.mjs` và 301 từ domain cũ. Cần bạn chọn domain |
| OPEN-02 | P1 | Gửi `sitemap-index.xml` lên Google Search Console + Bing Webmaster | Cần đăng nhập thủ công; có dữ liệu thật thì mới ưu tiên được nội dung |
| OPEN-03 | P2 | Chuyển hướng HTTP 301 thật cho `/` và `/<locale>/tools/` (hiện là meta refresh 0 giây) | Cloudflare `_redirects` chưa được tôi thử trên host thật nên **không thêm** (cú pháp/độ ưu tiên với file tĩnh cần kiểm trên staging) |
| OPEN-04 | P3 | CSS của KaTeX (29,8 KB thô) bị nạp trên cả 25 trang công cụ dù chỉ Markdown dùng | Nạp lười khi mở Markdown Editor; chưa làm vì cần thử font KaTeX tránh vỡ |
| OPEN-05 | P3 | `FAQPage` JSON-LD trên 500 trang | Từ 2023 Google chỉ hiện FAQ rich result cho site chính phủ/sức khoẻ → vô hại nhưng không mang lại rich result. Tôi chưa đối chiếu từng chữ với FAQ hiển thị |
| OPEN-06 | P3 | Chưa có `BreadcrumbList` | Cần breadcrumb hiển thị trên trang (Trang chủ › Danh mục › Công cụ) rồi mới thêm schema |
| OPEN-07 | P3 | Sitemap chưa có `lastmod` / `xhtml:link` | Tuỳ chọn: hreflang đã có đầy đủ trong HTML nên Google đã đủ thông tin |

## C. Kiểm kê trang

Toàn bộ 582 dòng trong [`SEO_PAGE_INVENTORY.csv`](SEO_PAGE_INVENTORY.csv) (route, indexable, title, độ dài, canonical tự trỏ, H1, JSON-LD, số từ, lỗi).
Tóm tắt: 540 trang đáng index (20 trang chủ, 20 privacy, 500 trang công cụ = 25 × 20), 21 trang 404 (`noindex`, đúng), 21 trang chuyển hướng (`noindex`, không còn trong sitemap).
Tiếng Anh: 513–1375 từ nội dung/trang công cụ; title 39–68 ký tự; 1 H1/trang.

## D. Thay đổi đã thực hiện

| File | Lý do |
|---|---|
| `astro.config.mjs` | Loại `/<locale>/tools/` khỏi sitemap; `redirectToDefaultLocale:false`; `optimizeDeps.include` (sửa lỗi dev Vite, không ảnh hưởng SEO) |
| `src/pages/index.astro`, `src/pages/[locale]/tools/index.astro` | Chuyển hướng 301 không trễ |
| `src/pages/[locale]/index.astro` | JSON-LD `WebSite` |
| `src/data/tools.ts` + 22 file `*Page.astro` | `getRelatedTools()` liên kết chéo chủ đề |
| `src/i18n/locales/{en,vi}/tool-*.json` (16 file), `{it,nl,sv}` (4 file) | Rút gọn meta, hết tiêu đề trùng |
| `src/components/tools/TextCaseConverter.tsx` | Heading đúng cấp |
| `scripts/seo-audit.mjs`, `package.json` (`seo:audit`) | Kiểm toán lặp lại được |
| `src/lib/__tests__/seo-meta.test.ts` | Test: title ≤70 cột & duy nhất 20 locale, mô tả en/vi ≤165, liên kết liên quan, slug duy nhất |

Kiểm chứng đã chạy thật: `npm run build` (582 trang), `npx vitest run` (58 file, 757 test qua), `node scripts/seo-audit.mjs` (P0=P1=P2=0).

## E. Việc còn lại (cần quyền truy cập/quyết định của bạn)

1. Chọn và trỏ **tên miền riêng**, rồi cập nhật `site` (OPEN-01).
2. Đăng nhập Search Console + Bing, **gửi sitemap**, đưa dữ liệu truy vấn cho tôi để chọn nội dung theo số liệu (OPEN-02).
3. Trên Cloudflare, thử thêm `_redirects` ở môi trường staging (OPEN-03).
4. Duyệt nội dung bài viết mới (mục F) — không tự viết hàng loạt.
5. Dịch người bản ngữ cho 18 ngôn ngữ (bản dịch hiện là AI, chưa rà).

## F. Kế hoạch 30 ngày (giả thuyết — chưa có dữ liệu Search Console để xác nhận)

| Tuần | Việc | KPI đo được |
|---|---|---|
| 1 | Chốt domain, gửi sitemap, bật theo dõi Search Console/Bing; chạy `npm run seo:audit` trong CI | Số URL đã gửi/đã index; 0 lỗi P0/P1 mỗi lần build |
| 2 | Rà truy vấn thật; sửa title/H1 của 5 công cụ có impression cao nhưng CTR thấp (en, vi trước) | CTR theo trang; vị trí trung bình |
| 3 | Trang đích theo ý định (ưu tiên en/vi): "Nén ảnh xuống 100KB/200KB" (đã có chế độ dung lượng đích), "Gộp ảnh thành PDF", "Chọn màu từ ảnh" (tính năng mới). Mỗi trang cần nội dung riêng, không nhân bản mẫu | Số trang mới được index; impression nhóm truy vấn đó |
| 4 | Liên kết chéo thêm theo hành trình người dùng (OCR → Word Counter/Case Converter; Text Diff → Code Formatter); breadcrumb + `BreadcrumbList`; lười nạp KaTeX CSS | Số lần nhấp từ liên kết nội bộ (analytics); điểm Lighthouse khi có công cụ |

**Kỳ vọng thực tế:** việc kỹ thuật trên loại bỏ cản trở thu thập/chỉ mục, nhưng **không đảm bảo** thứ hạng hay lưu lượng; với domain mới và ngách công cụ cạnh tranh (TinyPNG, Squoosh, Diffchecker…) thường cần nhiều tháng và backlink. Không có số liệu để dự báo cụ thể.

## Hiệu năng (ước lượng phòng thí nghiệm từ build, không phải Core Web Vitals thật)

- Trang chủ: 0 JS khách (không hydrate), HTML ~6,3 KB gzip, CSS ~16 KB gzip.
- Trang công cụ: JS ~79–128 KB gzip (Word Counter 79, Text Diff 103, Nén ảnh 128); **Merge PDF 254 KB** (pdf-lib + pdf.js nạp ngay) — ứng viên nạp lười nếu INP kém khi có dữ liệu thật. CSS ~30 KB gzip (gồm KaTeX, OPEN-04).
- `_astro/*` đã cache `immutable` 1 năm; phông tự host. Chưa đo LCP/INP/CLS.
