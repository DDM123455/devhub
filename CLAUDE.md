# CLAUDE.md — Hướng dẫn cố định cho dự án Web Tool Hub

> File này được Claude Code tự động đọc vào đầu MỖI phiên làm việc.
> Không xoá, không rút gọn quá mức — đây là "hợp đồng hành vi" của dự án.

## 🎯 Tầm nhìn & triết lý cốt lõi (RÀNG BUỘC CỨNG — không được vi phạm)

**100% Client-Side & Zero Server Cost.**
File, ảnh, văn bản của người dùng KHÔNG BAO GIỜ được upload lên server dưới bất kỳ hình
thức nào (kể cả tạm thời, kể cả "để test nhanh"). Toàn bộ xử lý chạy bằng JS/WASM/Web API
ngay trên trình duyệt người dùng (Canvas, WebWorker, WebAssembly...).

Nếu một tính năng bắt buộc phải xử lý phía server mới làm được, KHÔNG được tự ý thêm
server-side code để "cho xong việc" — phải dừng lại và hỏi người dùng trước.

## 🧱 Tech stack (đã chốt — không tự đổi nếu chưa hỏi)

- Framework: **Astro** (SSG, static export) — ưu tiên vì Lighthouse 100/100, SEO tốt nhất
- UI: **Tailwind CSS + Shadcn/UI**, có Dark Mode
- i18n: **i18n routing native của Astro + i18next thuần** (đổi từ `astro-i18next` trong
  Phase 0 — xem lý do trong `PROGRESS.md`; không đổi lại nếu chưa hỏi)
- Hosting: **Cloudflare Pages** (free tier, không giới hạn băng thông)
- Xử lý file nặng: luôn bọc trong **Web Worker**, không block main thread

## 📋 Quy trình bắt buộc trong MỌI phiên làm việc

1. Đọc `PROGRESS.md` trước tiên để biết đang ở đâu, task nào dở.
2. Đọc `ROADMAP.md`, chọn task đầu tiên chưa được tick `[x]`.
3. Chỉ làm **một task/chức năng tại một thời điểm** — không nhảy cóc sang task khác dù có
   vẻ liên quan, trừ khi người dùng yêu cầu.
4. Sau khi code xong task đó:
   - Build thử, đảm bảo không lỗi (`npm run build`).
   - Tick checkbox tương ứng trong `ROADMAP.md`.
   - Ghi một mục log ngắn vào **đầu** `PROGRESS.md` theo đúng mẫu có sẵn trong file đó.
   - Commit git với message dạng: `feat(ten-cong-cu): mo ta ngan gon`.
5. Sau khi hoàn thành, báo ngắn gọn cho người dùng đã xong gì, hỏi có tiếp tục task kế
   tiếp trong `ROADMAP.md` không (trừ khi người dùng đã dặn "cứ chạy tự động liên tục").

Đây chính là cơ chế để **phiên làm việc tiếp theo** (dù mất hết context) vẫn biết chính
xác phải làm gì tiếp — chỉ cần đọc `PROGRESS.md` + `ROADMAP.md`.

## ✅ Checklist SEO bắt buộc cho MỌI trang công cụ mới

- [ ] Title tag + meta description riêng cho từng ngôn ngữ, có từ khóa chính, không trùng
      với trang khác trên site.
- [ ] Nhúng JSON-LD `schema.org/WebApplication` (hoặc `SoftwareApplication`), giá = 0,
      currency = USD.
- [ ] URL slug bản địa hóa theo từng ngôn ngữ (ví dụ `/vi/tools/nen-anh`, không phải dịch
      nguyên văn slug tiếng Anh).
- [ ] Đoạn nội dung hướng dẫn/giải thích 300–500 từ phía dưới công cụ — viết riêng cho
      từng ngôn ngữ, không AI-spin lặp lại giữa các ngôn ngữ (tránh duplicate content).
- [ ] Alt text đầy đủ cho mọi hình minh họa.
- [ ] Internal link tới 2–3 công cụ liên quan.
- [ ] Trang tự động có mặt trong `sitemap.xml` (không thao tác tay).
- [ ] Lighthouse Performance + SEO ≥ 90 trước khi coi task là "xong".

## 🏆 Checklist Feature Parity (bắt buộc trước khi coi 1 công cụ là "Done")

Một công cụ KHÔNG được tick `[x]` chỉ vì nó "chạy được". Trước khi coi là hoàn thành:

- [ ] Liệt kê tối thiểu 2 đối thủ đầu ngành cho công cụ đó (ví dụ: nén ảnh → TinyPNG,
      Squoosh; so sánh văn bản → Diffchecker.com; QR code → qr-code-generator.com...).
- [ ] So sánh feature-by-feature: công cụ của mình đang thiếu gì so với họ?
- [ ] Không dừng ở bản MVP tối giản — nếu đối thủ hỗ trợ N định dạng/tùy chọn, công cụ
      của mình phải hỗ trợ tương đương hoặc nêu rõ lý do kỹ thuật nếu không thể (ví dụ:
      một số định dạng không decode được bằng JS thuần trên trình duyệt).
- [ ] Ưu tiên các tính năng UX mà đối thủ có nhưng dễ bị bỏ quên: preview trước/sau,
      xử lý hàng loạt (batch), kéo-thả, thanh trạng thái tiến trình, export nhiều định dạng.

## ⚙️ Quy tắc kỹ thuật khác

- Không thêm dependency mới ngoài danh sách trong `ROADMAP.md` nếu không thực sự cần thiết.
- Mọi chuỗi hiển thị cho người dùng phải đi qua key i18n — không hardcode text.
- Banner "100% Privacy — Files Stay On Your Device" phải xuất hiện ở layout chung, không
  chỉ ở 1 trang riêng lẻ.

## 🌍 Ngôn ngữ

Giai đoạn đầu (Phase 0–1): `en, vi, es, pt, fr, de, ja, ko` (8 ngôn ngữ).
Mở rộng lên 15–20 ngôn ngữ ở Phase 2 (xem `ROADMAP.md`).

## 📁 Tài liệu liên quan (luôn tồn tại trong repo, không xoá)

- `ROADMAP.md` — chi tiết từng phase và từng task, có checkbox.
- `PROGRESS.md` — nhật ký tiến độ, đọc đầu mỗi phiên, cập nhật cuối mỗi task.
