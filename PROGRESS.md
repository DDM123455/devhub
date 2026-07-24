# PROGRESS.md — Nhật ký tiến độ dự án

> Đọc file này ĐẦU TIÊN khi bắt đầu một phiên mới. Ghi thêm một mục MỚI lên ĐẦU file
> (không xoá log cũ) ngay sau khi hoàn thành một task theo quy trình trong `CLAUDE.md`.

## 🔵 Trạng thái hiện tại

- Phase đang làm: **Phase 0 — Nền tảng & Hạ tầng**
- Task tiếp theo cần làm: Cài Tailwind CSS + Shadcn/UI (xem `ROADMAP.md`)
- Ghi chú đặc biệt: dự án dùng Node.js 22.23.1 độc lập trong `.tools/` (xem log bên dưới),
  không phải Node hệ thống (20.19.0). Luôn `export PATH` trỏ vào
  `.tools/node-v22.23.1-win-x64` trước khi chạy `npm`/`node` trong phiên terminal mới.

---

## Nhật ký (mới nhất ở trên cùng)

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

