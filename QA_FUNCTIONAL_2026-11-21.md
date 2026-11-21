# Kiểm thử chức năng Web Tool Hub · 21/11/2026

Bản build tĩnh có 27 công cụ. Bộ Playwright chạy đủ 27 công cụ, 10 trang đổi đơn vị trong một nhóm và trang chủ trong một nhóm. Cả 29 nhóm đạt trên Chromium ở 390 × 844 và 1366 × 900. Máy kiểm thử phục vụ `dist/` trên loopback với chính sách từ `public/_headers`. Ảnh, PDF, âm thanh, video và văn bản mẫu đều được tạo cho kiểm thử. Trình duyệt tải mô hình và engine từ các địa chỉ công khai mà công cụ sử dụng.

## Kết quả theo chức năng

| Công cụ | Dữ liệu và thao tác đã kiểm | Kết quả quan sát |
|---|---|---|
| Base64 | Chuỗi sai, tiếng Việt và emoji, ảnh PNG, text → hex, nén và giải nén gzip, thay input | Báo lỗi chuỗi sai. PNG tải về khớp từng byte. Gzip giải được cả bằng Node và bằng công cụ. Kết quả cũ biến mất khi sửa input. |
| Code Formatter | JSON thiếu giá trị, sau đó JSON có tiếng Việt và số 0 | Hiện lỗi rồi phục hồi. File JSON tải về giữ cả hai giá trị. |
| Color Picker | HEX sai, HEX rút gọn, sao chép, bảng màu và tương phản | Báo HEX sai. Clipboard nhận `#AABBCC` từ `#abc`, tab tương phản hiện WCAG. |
| Nén ảnh | File không hỗ trợ, PNG mẫu | Hiện cảnh báo, sau đó nén được. Đọc lại ảnh tải về đúng 640 × 120. |
| Đổi định dạng ảnh | File sai, ảnh 1 × 6000, đổi loại đầu ra | Ảnh sau resize còn 1 × 1920. Kiểm tra kích thước ảnh, header ICO và số trang PDF. Với AVIF, chấp nhận ảnh hợp lệ hoặc thông báo riêng khi trình duyệt thiếu encoder. |
| CSV ↔ JSON | Dấu ngoặc kép chưa đóng, ô chứa dấu phẩy và chữ có dấu, đảo chiều | Báo lỗi dòng CSV hỏng. JSON giữ nguyên hai giá trị, đảo chiều đặt lại dấu ngoặc kép đúng. |
| OCR | File sai, ảnh có dòng chữ mẫu, tải TXT và DOCX | Đọc lại cả TXT và XML bên trong DOCX đều có `LOCAL TEST 42`. |
| ISO Validator | Mẫu ISO 8583, chuỗi vô nghĩa, IBAN, tra DE39/F39 và MCC | CSV có MTI 0200. Phân biệt mã hợp lệ và không nhận diện. Tra được 00, DE39, 5411 và trạng thái tìm không thấy. |
| JSON và XML | Cây JSON với hai field, nhân đôi, xóa, chèn, XML sai thẻ, XML có khoảng trắng | Số field đổi đúng sau mỗi thao tác. XML lỗi có cảnh báo. Chuyển Tree/Text và Minify vẫn giữ nguyên `<a> x </a>` trong file tải về. |
| JSON → Excel | JSON thiếu giá trị rồi nạp mẫu nhiều sheet | Báo JSON lỗi. Đọc lại XLSX thấy hai sheet employees, departments và dữ liệu Ada Lovelace. |
| JWT | Token ba đoạn sai, token mẫu, đặt iat/exp, ký bằng khóa thử | Báo lỗi decode, đọc được claim của mẫu và sinh token ba đoạn. |
| Kubernetes YAML | YAML sai rồi lập tức nạp mẫu và tải báo cáo, xóa input | Báo vị trí lỗi cú pháp. Báo cáo thuộc manifest mới. Test tài nguyên tra đủ 130 tổ hợp phiên bản và kind. |
| Markdown | Tải Markdown mẫu, thay ngay nội dung, tải HTML, xóa | HTML chứa đúng chữ đậm vừa gõ. Nút tải Markdown bị khóa sau khi xóa. |
| Gộp PDF | File sai, PDF và ảnh, xoay trang, gộp | PDF tải về mở lại được, có ba trang và trang đầu xoay 90°. |
| Audio | File sai, WAV mẫu → MP3, chọn lại file | Báo file sai, tải được MP3 có header nhận diện được. |
| Nginx | Block thiếu dấu đóng rồi nạp cấu hình mẫu | Từ một lỗi về 0 lỗi. Tải được báo cáo JSON và xóa được input. |
| QR | Input trống rồi điền URL mẫu | Khóa tải khi trống. File tải ở bốn định dạng PNG, SVG, JPEG, PDF có chữ ký hoặc nội dung tương ứng. |
| Regex | Mẫu có ba kết quả, pattern lỗi, kết quả độ dài bằng 0 | Hiện ba kết quả, báo lỗi cho dấu ngoặc mở và trả kết quả cho `^`. |
| Xóa nền | Sai loại file, mô phỏng mất mạng khi tải model, bấm Thử lại, xuất PNG, mở/hủy sửa mask | Tải lại thành công, ảnh PNG đọc được đúng 640 × 120. Kiểm CSP của trang và worker riêng. |
| Tách PDF | File sai, PDF hai trang → ZIP | Mở ZIP đọc lại được hai file PDF, mỗi file một trang. |
| SQL Formatter | SQL thiếu ngoặc, SQL hợp lệ chứa chữ có dấu | Check syntax phân biệt hai trường hợp. File SQL sau format giữ nguyên literal. |
| SQL ↔ Java | DDL thiếu tên bảng, thay bằng dữ liệu mẫu rồi chuyển | Trường hợp sai báo chưa có output. ZIP chứa mã Java và metadata JSON. |
| SVG Optimizer | SVG chưa đóng, dữ liệu mẫu, Compare, Code, Download | Có cảnh báo lỗi, chuyển được chế độ và file tải về chứa SVG. |
| Text Case Converter | Trống, hai dòng tiếng Việt kèm emoji và số, đổi chữ thường | Đếm 18 ký tự, 4 từ. File tải về khớp chuỗi chữ thường, khóa Copy khi xóa. |
| Text Diff | Hai bản tin ISO ngắn căn cột bằng khoảng trắng, sau đó hai chuỗi giống hệt | Ở Word và Character, phần số thay đổi được tô, đoạn TERM giống nhau giữ nguyên. Ctrl+Enter chạy so sánh. |
| Cắt video | File sai, WebM mẫu, tiến/lùi một frame, cắt và tải | Tải được clip có header WebM. |
| Word Counter | Trống, tiếng Việt và emoji, tải TXT, xóa | Clipboard bị khóa khi trống, TXT khớp input và bảng tần suất có kết quả 25%. |
| Đổi đơn vị bếp | 10 cặp, input trống, âm, 0, đổi chiều hai lần, đổi nguyên liệu, số cực nhỏ và cực lớn | Khôi phục kết quả khi đảo hai lần. 0,00001 tsp ra 0,0000493 ml. Khi vượt giới hạn số, giao diện hiện dấu gạch. |
| Trang chủ | Tìm Base64, nhập từ không khớp, xóa tìm kiếm, đổi theme, tải lại, chuyển sang tiếng Việt | Danh sách lọc rồi phục hồi, theme được lưu, trang đích có ngôn ngữ vi. |

## Đối chiếu và chạy lại

Sổ kiểm có 674 dòng nhãn theo công cụ và trạng thái. Trong đó, 106 dòng ghi nhận thao tác trong kịch bản có kiểm kết quả, 554 dòng ghi nhận thao tác thăm dò và 14 dòng chỉ được quan sát khi đang khóa. Một nút có thể đổi nhãn khi đang xử lý hoặc sau khi sao chép. Vì vậy, các số này đo phạm vi tương tác theo nhãn.

Kiểm tra bổ sung trên cả hai kích thước đã xác nhận nút đổi chế độ JSON Tree bấm được sau khi tách hàng tìm kiếm trên khung hẹp. Với lấy màu màn hình, đã mô phỏng hai kết quả từ API của trình duyệt (hủy và chọn màu), sau đó đọc lại màu qua clipboard. Với in Markdown, đã bấm nút và đọc nội dung tài liệu trong khung in.

Build sinh 647 trang. Vitest đạt 1.115 test, bỏ qua 1. Audit SEO ghi nhận 83 URL cho phép index và 83 URL sitemap, P0/P1/P2 bằng 0, còn ba nhóm P3. Kiểm tra i18n vẫn báo thiếu 256 khóa tiếng Việt, toàn bộ ở cụm đổi đơn vị bếp hiện chỉ có tiếng Anh. Mỗi locale trong 18 ngôn ngữ còn lại thiếu 559 khóa so với tiếng Anh. Không phát hiện sai biến nội suy. Nội dung cập nhật về tải model ở 20 ngôn ngữ chưa được người bản ngữ rà lại.

- Danh sách thao tác trên từng công cụ nằm trong [sổ kiểm tra nút](QA_CONTROLS_2026-11-21.csv). Một nhãn có thể xuất hiện ở nhiều trạng thái. Mỗi dòng ghi rõ thao tác thuộc kịch bản kiểm đầu ra, lượt bấm thăm dò hay còn cần kiểm tay. Nút bị khóa theo điều kiện chỉ được tính là đã bấm khi có sự kiện bấm thực tế.
- Chạy `npm ci`, `npx playwright install chromium`, `npm run build` rồi `npm run test:browser`. Trên PowerShell, đặt `$env:QA_DESKTOP='1'` để chạy desktop. Có thể thêm slug sau `--`, ví dụ `npm run test:browser -- remove-background json-formatter`.
- Ngữ cảnh Chromium kiểm cả dữ liệu đầu ra lẫn lỗi JS. Việc nhận diện header file âm thanh/video chỉ xác minh loại file. Chất lượng âm thanh, độ mượt video, độ đẹp của mask và khả năng quét mã QR trên camera thật cần kiểm thực tế.
- Bài kiểm tra dùng giao diện tiếng Anh và kiểm chuyển ngôn ngữ sang tiếng Việt. Safari, Firefox, thiết bị thật, hộp thoại in của hệ điều hành và lấy màu ngoài cửa sổ trình duyệt nằm ngoài phạm vi lần chạy này.
