# PROGRESS.md — Nhật ký tiến độ dự án

> Đọc file này ĐẦU TIÊN khi bắt đầu một phiên mới. Ghi thêm một mục MỚI lên ĐẦU file
> (không xoá log cũ) ngay sau khi hoàn thành một task theo quy trình trong `CLAUDE.md`.

## 🔵 Trạng thái hiện tại

- Phase đang làm: **Phase 0 — Nền tảng & Hạ tầng**
- Task tiếp theo cần làm: Setup CI/CD — deploy tự động lên Cloudflare Pages khi push (xem
  `ROADMAP.md`)
- Ghi chú domain: `site` trong `astro.config.mjs` đang là placeholder
  `https://web-tool-hub.pages.dev` (chưa deploy thật) — PHẢI sửa lại đúng domain/tên
  project Cloudflare Pages thật khi làm task CI/CD kế tiếp, đồng thời sửa luôn dòng
  `Sitemap:` trong `public/robots.txt` cho khớp.
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

