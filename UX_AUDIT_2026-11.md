# UX_AUDIT — rà soát nút bấm, thanh tiến trình, bố cục từng công cụ (2026-11-01)

## Cách làm và giới hạn (đọc trước)

- Đo bằng DOM trên bản build + CSP production, 26 trang tiếng Anh, ở 1280×900 và 390×844 (mobile, 7 trang).
  Mỗi trang đo: số nút/ô nhập, vị trí dọc của nút chính (tính từ đầu khối công cụ), số điều khiển nằm trong màn hình đầu,
  có thanh tiến trình / nút Sao chép / Tải xuống / Xoá / Mẫu hay không. Đọc thêm code của các thanh tiến trình.
- **Không có ảnh chụp**: pane trình duyệt bị ẩn nên không "nhìn bằng mắt" được. Các nhận xét về thẩm mỹ là suy ra từ số liệu.
- Trạng thái đo là trạng thái **ban đầu** (chưa nạp file). Màn hình kết quả chỉ được xem ở các công cụ đã test tay trong phiên trước
  (JSON, SQL, Code, Nginx, K8s, SVG, Chuyển ảnh, Audio, Text Diff, Color Picker, Case Converter).
- Vị trí nút "chính" nhận diện bằng class `bg-primary`; công cụ chạy tức thì (không có nút chạy) sẽ không có mục này.

## 1. Vấn đề chung (xếp theo mức đáng làm)

### A. Nút chính nằm sau cả khối tuỳ chọn — nên đưa lên hoặc làm "dính"
| Công cụ | Nút chính | Vị trí (desktop) | Vị trí (mobile 390px) |
|---|---|---|---|
| Nén ảnh | Compress | y≈661 | y≈801 (khối cao 902) |
| Chuyển đổi ảnh | Convert | y≈505 | — |
| Xoá nền | Remove Background | y≈673 | — |
| OCR | Extract text | y≈497 | — |
| Text Diff | Compare | y≈529 | y≈1041 |
| Case Converter | Copy | y≈1087 | y≈1531 (khối cao 1632) |
| QR | Download PNG | y≈1007 | y≈1031 |
| JWT | Sign token | y≈759 | — |

Đề xuất: (1) với công cụ xử lý ảnh/file, **tự chạy khi đổi một tuỳ chọn nếu đã có file** (hiện đổi cài đặt chỉ đưa kết quả về "pending" và bắt bấm lại — đúng nhưng tốn một cú bấm);
(2) hoặc để nút chính **dính đáy màn hình trên mobile** (`sticky bottom-0`) khi đã có file; (3) nhóm tuỳ chọn nâng cao vào `<details>` như Text Diff đã làm.

### B. Nút Sao chép / Tải xuống nằm xa kết quả
- **Case Converter**: ô kết quả ở giữa, nút Copy/Download/Clear nằm cuối (y≈1087, mobile ≈1531). Đưa Copy + Download lên **cùng hàng với nhãn "Kết quả"** (như Code Formatter/SQL).
- **QR**: 4 nút tải (PNG/SVG/JPEG/PDF) ở cuối cột tuỳ chỉnh, còn bản xem trước đã dính ở phải (3.22). Đặt nút **Tải PNG ngay dưới bản xem trước**, 3 định dạng còn lại vào menu.
- **K8s / Nginx / ISO**: kết quả kiểm tra **không có Sao chép / Tải báo cáo** (đã đo: copyBtn=false, downloadBtn=false). Thêm "Sao chép báo cáo" (văn bản) và "Tải .txt/.json".

### C. Thiếu nút Xoá / Mẫu không nhất quán
- Thiếu **Xoá**: ISO Validator, QR, JSON Formatter, Color Picker (các công cụ cùng loại đều có).
- Thiếu **Nạp mẫu**: Base64, Word Counter, Case Converter, Regex (có preset nhưng không có "ví dụ đầy đủ"), JSON Formatter (đã nạp sẵn mẫu, không có nút nạp lại).
  SQL/Code dùng ô chọn "Load sample…" trong khi Text Diff/SVG/Nginx dùng nút — thống nhất một kiểu (nên là nút, ô chọn chỉ khi có nhiều mẫu).

### D. Thanh tiến trình
| Công cụ | Hiện trạng | Đề xuất |
|---|---|---|
| Nén ảnh, Chuyển ảnh, Xoá nền, OCR, Gộp/Tách PDF, QR hàng loạt | Có `<Progress>` dùng chung | Giữ. Thêm `aria-label` mô tả (OCR đã có). |
| **Audio converter** | Chỉ **chữ** "Đang mã hoá N%", không có thanh | Dùng `<Progress>` như các tool khác. |
| **Video Trim** | Có thanh tự vẽ (`role=progressbar`) | Dùng `<Progress>` dùng chung cho đồng bộ. |
| **Tải engine ffmpeg (~32 MB)** (Audio OGG/FLAC/M4A, Video) | Không có % — chỉ chữ "đang tải…", và phải tải lại **mỗi lần mở trang** | Hiện "đã tải X/32 MB"; **tải sẵn engine khi người dùng chọn OGG/FLAC/M4A hoặc thả file** thay vì chờ bấm Convert. |
| OCR dữ liệu ngôn ngữ | Có pha `lang` + "từ bộ nhớ đệm" | Giữ; thêm dung lượng sắp tải (đã có bảng byte). |
| SVG, JSON, SQL, Code, Nginx, K8s | Không có (xử lý tức thì) | Không cần. K8s lần đầu có "Validating…" khi tải schema — thêm tên schema đang tải. |
- Không công cụ nào có **nút Huỷ** ngoài Nén ảnh/Xoá nền/OCR/Video. **Audio và Chuyển ảnh không huỷ được** khi đang chạy lô lớn. Không công cụ nào cảnh báo `beforeunload` khi đóng tab giữa chừng (Video/Audio/Xoá nền mất công việc).

### E. Bố cục trang — đề xuất một khuôn chung theo 3 nhóm
1. **Công cụ file/ảnh/media** (Nén, Chuyển, Xoá nền, OCR, PDF, Audio, Video, SVG): `Dropzone lớn` → danh sách file → *Tuỳ chọn (gập được)* → **một nút chính** → kết quả có Tải/Tải tất cả. Mobile: nút chính dính đáy.
2. **Công cụ chuyển đổi văn bản hai ô** (Case, Base64, CSV↔JSON, JSON→Excel, SQL, Code, Markdown): từ 1024px **hai cột Input | Output**, thanh nút (Mẫu · Dán · Xoá | Sao chép · Tải) nằm **trên mỗi ô**, tuỳ chọn gập; Ctrl+Enter = chạy.
   Hiện Case Converter và Base64 xếp dọc (kết quả bị đẩy xuống), SQL/Code đã là hai cột.
3. **Công cụ kiểm tra / phân tích** (JWT, Regex, Nginx, K8s, ISO, JSON Formatter): ô nhập trái, **kết quả phải (dính khi cuộn)**, preset/mẫu là chip gập được.

### F. Phím tắt và nhãn
- Ctrl+Enter có ở SQL, Code, Text Diff; **chưa có** ở JSON Formatter, Regex, Case, Base64, K8s, Nginx (những nơi chạy tức thì thì không cần; ở nơi có nút chạy thì nên thêm).
- Nhãn nút tải không nhất quán: "Download .txt", "Download .sql", "Download .…" (Code Formatter hiện dấu `.…` khi chưa biết ngôn ngữ), "Download". Nên thống nhất "Tải xuống" + đuôi file chỉ khi biết.

## 2. Từng công cụ — nhận xét ngắn

| Công cụ | Số nút / điều khiển | Nhận xét chính |
|---|---|---|
| Nén ảnh | 1 / 7 | Gọn. Nút Compress y≈661; cân nhắc tự chạy khi thả file. Có tiến trình + huỷ. |
| Chuyển ảnh | 1 / 5 | Gọn. Kết quả cũ vẫn bị loại khi đổi cài đặt (đã sửa race). Chưa có huỷ; AVIF báo lỗi thân thiện. |
| Xoá nền | 5 / 11 | 4 nút nền (Trong suốt/Màu/Gradient/Mờ) là nhóm chọn, đặt tốt; nút chính y≈673. Có tiến trình + huỷ. |
| OCR | 7 / 12 | Nhiều ô (4 checkbox, 3 select). Gom ngôn ngữ + tiền xử lý vào "Nâng cao". Đã có tiến trình theo pha. |
| SVG | 2 / 31 | 39 checkbox plugin nằm trong `<details>` — đúng. Nút Sao chép/Tải chỉ xuất hiện sau khi có kết quả: ổn. |
| Gộp PDF / Tách PDF | 1 / 1 | Rất gọn (khối 386px). Có tiến trình. |
| Video / Audio | 0 nút ban đầu | Sạch (chỉ dropzone). Cần thanh % + tải sẵn engine + huỷ (mục D). |
| QR | 7 / 10 | Khối 1152px. Nút tải xa preview (mục B). "Lưu trong trình duyệt / Tải đã lưu / Xuất JSON" là 3 nút ít dùng → gập. |
| Word Counter | 3 / 7 | Tốt; không có nút nạp mẫu. Mục "Mục tiêu viết" và "Khả năng đọc" thấp hơn màn đầu — chấp nhận được. |
| Case Converter | 33 | Đã chia 4 nhóm. Chuyển Copy/Download lên đầu ô kết quả; cân nhắc hai cột trên desktop. |
| Text Diff | 9 / 18 | Đã gọn (3.24). Còn 4 `<details>`; kết quả cách ô nhập 170px. |
| Markdown | 25 | Thanh công cụ 11 nút định dạng + 5 nút xuất/sao chép: nhóm Copy/Download vào menu "Xuất". |
| JSON Formatter | 18 | **Format/Minify/Repair nằm sau trình soạn thảo** (y≈779 desktop; mobile ≈941): đưa thanh công cụ lên **trên** editor. 5 nút "chính" cạnh nhau (Repair/Generate/Schema/Validate/Query) làm loãng trọng tâm — chỉ giữ Format làm chính. 3 `<details>`. |
| CSV↔JSON | 7 / 18 | Hai nút chiều chuyển + Swap là ổn. Không có nút chính "Chuyển" (tự chạy) — rõ ràng, giữ. |
| JSON→Excel | 2 / 13 | **Chưa thấy nút tải .xlsx ở trạng thái đầu** (downloadBtn=false) — kiểm tra nó xuất hiện sau khi có dữ liệu. |
| Base64 | 8 | Xếp dọc; thêm "Mẫu", đặt Copy lên đầu ô kết quả. |
| JWT | 4 / 11 | Ổn; "Sign token" y≈759. Có Mẫu/Xoá. |
| Regex | 15 | **15 chip preset** chiếm cả hàng → gom thành một ô chọn "Mẫu có sẵn" hoặc chip gập. Khối cao 1246px. |
| Color Picker | 20 | Đã chia 3 thẻ (3.25). |
| Nginx / K8s | 2 | Rất gọn ở đầu (khối 1342/874px do kết quả). Thiếu Sao chép/Tải báo cáo; nên có chuyển đổi "chỉ lỗi / cả cảnh báo". |
| SQL | 8 / 21 | 13 ô chọn trong một khối (đã gập 11 tuỳ chọn). Nút Format mobile y≈500: tốt. |
| Code Formatter | 6 / 8 | Gọn, tốt. Nhãn "Download .…" xem mục F. |
| ISO Validator | 1 / 3 | Chưa có nút Xoá; kết quả không có Sao chép/Tải ở trạng thái đầu (có sau khi nhập — cần kiểm). |

## 3. Thứ tự làm đề xuất (ít công, nhiều lợi)

1. **Thanh công cụ JSON Formatter lên trên editor** + bỏ 4 nút "chính" thừa. (nhỏ, tác động lớn)
2. **Copy/Download lên đầu ô kết quả** ở Case Converter, Base64 (và QR: Tải PNG cạnh preview). (nhỏ)
3. **Audio/Video: thanh `<Progress>` + hiện dung lượng tải engine + tải sẵn engine khi chọn định dạng.** (vừa)
4. **Thêm Sao chép / Tải báo cáo** cho Nginx, K8s, ISO; thêm Xoá cho ISO/QR/JSON. (vừa)
5. **Nút chính dính đáy trên mobile** cho nhóm công cụ file (Nén, Chuyển, Xoá nền, OCR, PDF). (vừa)
6. Regex: chip preset → một ô chọn. Markdown: gom nút xuất. (nhỏ)
7. Nút Huỷ cho Audio/Chuyển ảnh + cảnh báo đóng tab khi đang xử lý. (vừa)
8. Khuôn bố cục hai cột (mục E.2) cho Case/Base64/CSV/JSON→Excel. (lớn nhất — làm sau cùng, cần xem ảnh chụp trước)

## 4. Chưa kiểm được

- Không có ảnh chụp / nhìn bằng mắt (pane ẩn). Nên mở site thật ở 3 cỡ (1440, 768, 390) để xác nhận các đề xuất về thứ tự và khoảng cách.
- Trạng thái "có file" của Nén ảnh, Xoá nền, PDF, OCR, QR hàng loạt chưa được thử tay trong phiên này.
- Mới đo mobile cho 7/26 công cụ.
