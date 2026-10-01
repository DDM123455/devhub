# COMPETITOR_GAP.md — So sánh tính năng với đối thủ (2026-10-01)

> **Trạng thái 2026-10-01 (Phase 3.14):** phần lớn mục trong bảng dưới đã được làm — xem PROGRESS.md. Còn lại:
> nén PDF, brush đã xong nhưng model WebGPU chưa, flavor regex/debugger, Mermaid, TIFF, giữ EXIF, ID3 tag,
> fetch JWKS, sync cloud, self-host ffmpeg (cần quyết định), diff Word/PDF/folder, X.509/JWE/EdDSA cho JWT.

> Nguồn: 3 agent nghiên cứu (đọc code thật + WebSearch/WebFetch). Số liệu đối thủ lấy từ trang chủ/docs/
> bài so sánh bên thứ ba, KHÔNG phải trang pricing chính thức; ô nào đánh "~" chưa kiểm chứng trực tiếp
> (Coolors, nginxconfig.io, jsoneditoronline, Meld, Mergely, token.dev, HackMD... không fetch được).
> Tất cả mục dưới đây là **NEW FEATURE** — chưa làm, chờ chủ dự án chọn. Công sức: S nhỏ, M vừa, L lớn.
> "Cần server" = vi phạm ràng buộc 100% client-side → KHÔNG làm.

## Top ưu tiên theo từng tool

| Tool | Thiếu quan trọng nhất (ưu tiên giảm dần) | Công sức |
|---|---|---|
| Nén ảnh | PNG nén thật (OxiPNG/imagequant), MozJPEG, input HEIC/AVIF/GIF/SVG, giữ/xoá EXIF | M |
| Chuyển đổi ảnh | Input SVG→PNG/JPG, ảnh→PDF, ICO/TIFF, GIF/WebP động | S–M |
| Xoá nền | Brush Restore/Erase chỉnh mask, model chất lượng cao (WebGPU), xuất WebP/JPG, nền gradient/blur/shadow | M–L |
| Gộp PDF | Thêm ảnh JPG/PNG vào danh sách gộp, sort tên/ngày, nén PDF (khó), số trang/mục lục | S, M–L |
| Tách PDF | Tách theo dung lượng tối đa, theo bookmark, lẻ/chẵn, theo text | M |
| Cắt video | Xuất GIF, tách MP3, cắt nhiều đoạn + nối, mute/tốc độ/resize-nén, self-host ffmpeg core (giới hạn 25MB/file Cloudflare Pages) | S–M |
| MP3↔WAV | Batch + ZIP, input video (trích audio), output AAC/OGG/FLAC, trim, tag ID3 | M |
| Text Diff | Unified view, ẩn dòng không đổi, export .diff/HTML, ignore bằng regex | S–M |
| Word Counter | Keyword density lọc stop-word + n-gram, preset giới hạn SEO (meta title 60/desc 160), mục tiêu + autosave, upload .docx/.pdf | S–M |
| Case Converter | PascalCase/kebab/CONSTANT/dot.case, Capitalized Case, xoá dòng trùng, đảo dòng, sort Z-A, stylized Unicode | S |
| JSON Formatter | Repair JSON, chọn indent/minify, sinh code (TS/Go/Java/C#/Python), JSON Schema, JSONPath, share link hash | S–M |
| JWT | ES256/384/512, PS256, nhận JWK/JWKS, encoder tạo token mới, ký lại bằng private key RS/ES | M |
| Base64 | Auto-detect/nới lỏng input, validator báo vị trí lỗi, Hex/Base32, giải nén gzip/deflate, từng dòng | S–M |
| Regex | Explain pattern, thư viện pattern mẫu, code generator, cờ d/v, railroad diagram, unit tests (ghi rõ "JavaScript flavor") | M |
| Markdown | Export PDF, highlight code, TOC, KaTeX/Mermaid (lazy), find&replace, multi-doc local | S–M |
| QR | Kiểu/màu mắt riêng (thư viện đã hỗ trợ), xuất JPEG/PDF, thêm loại Location/Event/MeCard/Bitcoin/WhatsApp, lưu template | S–M |
| SVG | Hiển thị kích thước gzip, batch + zip, copy dạng data-URI/JSX, slider so sánh | S–M |
| Color Picker | Mô phỏng mù màu, OKLCH/CMYK/HSB, shades/tints (50–950), contrast cặp tuỳ ý/APCA, EyeDropper, link chia sẻ | S–M |
| CSV↔JSON | JSONL/keyed/array/column output, giữ số 0 đầu + ID dài (kiểm tra), chọn encoding, transpose/chọn cột | S–M |
| JSON→Excel | Ô kiểu Date/number, mảng lồng → sheet detail, freeze header + autofilter, chọn/sắp xếp cột | M |
| Nginx | Check kiểu Gixy (alias traversal, add_header redefinition, `if`, HSTS, allow-without-deny), validate giá trị tham số, trùng server_name/listen/default_server/upstream thiếu, export JSON | M–L |
| Kubernetes | Security/best-practice scorer kiểu Kubesec, CRD catalog (Datree), ghim schema, check chéo selector/label/Service port | M |

## Top 10 toàn site (tác động / công sức)

1. Nén ảnh: PNG nén thật + MozJPEG (điểm yếu cốt lõi so với TinyPNG/Squoosh) — M
2. Xoá nền: brush chỉnh mask — M
3. JPG→PDF: thêm ảnh vào Gộp PDF + ảnh→PDF ở Converter (từ khoá lớn) — S
4. Converter: input SVG→PNG — S
5. Video: xuất GIF/MP3 + cắt nhiều đoạn — S–M
6. Audio: batch + input video + AAC/OGG/FLAC (dùng chung ffmpeg.wasm với Video) — M
7. K8s: security scorer + CRD catalog + ghim schema — M
8. Nginx: check kiểu Gixy + validate tham số — M–L
9. Case Converter / JSON Formatter (repair, indent) / SVG (gzip size): thắng nhanh, rất rẻ — S
10. JWT ES256/PS256/JWK + encoder; Regex explain + thư viện mẫu — M

## Cần chủ dự án quyết định (chạm ràng buộc privacy)

- JWT: fetch JWKS từ URL ngoài (request mạng, không upload dữ liệu).
- Markdown: sync Google Drive/Dropbox/GitHub (OAuth, dữ liệu tới bên thứ ba).
- K8s: fetch schema/CRD từ CDN — cần nêu trong privacy note (privacy page đã cập nhật 2026-10-01).
- Self-host ffmpeg core / model imgly: bỏ phụ thuộc CDN nhưng cần kiểm tra giới hạn 25MB/file.

## KHÔNG làm (cần server)

QR dynamic + analytics; nginx-playground chạy nginx thật; nhập từ URL/API, Google Sheets/SQL/FTP;
đồng bộ cloud palette; bình luận từng dòng/AI summary (Diffchecker); đạo văn/Grammarly; cộng đồng pattern
regex101; cộng tác realtime (HackMD); speech-to-text (Web Speech API gửi âm thanh lên server).

## Điểm đã vượt đối thủ (nên nhấn mạnh trong nội dung SEO)

100% client-side, không giới hạn dung lượng/số lần/phút, không watermark, không đăng ký. Cụ thể: preset ảnh
thẻ theo mm+DPI, nén theo dung lượng mục tiêu, chỉnh sửa PDF ở mức trang + undo, cắt video stream-copy,
HEIC private, batch QR/CSV miễn phí, .ase miễn phí, cảnh báo XSS SVG, edit+re-sign JWT, Merge hunk Text Diff,
rewrite simulator + regex tester trong Nginx, worker chống ReDoS.

## Việc cần xác minh bằng code trước khi lập task

Màu nền khi PNG→JPG ở Converter; chế độ "checkbox" của Splitter xuất 1 hay nhiều file; AudioConverter có nghe
thử không; ICO có trong danh sách chọn của Converter không (đã thấy ICO hoạt động khi test runtime).
