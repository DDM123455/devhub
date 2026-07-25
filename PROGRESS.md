# PROGRESS.md — Nhật ký tiến độ dự án

> Đọc file này ĐẦU TIÊN khi bắt đầu một phiên mới. Ghi thêm một mục MỚI lên ĐẦU file
> (không xoá log cũ) ngay sau khi hoàn thành một task theo quy trình trong `CLAUDE.md`.

## 🔵 Trạng thái hiện tại

- Phase đang làm: **Phase 1 — 10 công cụ cốt lõi: HOÀN TẤT 10/10** ✅. Người dùng đã tự
  thêm **Phase 1.5 — Rà soát & Nâng cấp Feature Parity** vào `ROADMAP.md` (giữa Phase 1 và
  Phase 2) + mục "Checklist Feature Parity" vào `CLAUDE.md` — mục tiêu đưa từng tool từ
  "MVP chạy được" lên "ngang tầm đối thủ đầu ngành" (benchmark, so sánh feature-by-feature,
  nâng cấp).
- Task tiếp theo cần làm: **Phase 1.5**, tool #1, #2, #3 đã xong. Tool **#4 & #5
  "Gộp/Tách PDF"** đang làm dở — xem mục log mới nhất bên dưới để biết chính xác đã làm gì
  và còn thiếu gì trước khi tick ROADMAP.md.
- Ghi chú thiết kế (2026-07-25): đã redesign toàn bộ giao diện site (không phải task trong
  `ROADMAP.md`, làm theo yêu cầu trực tiếp của người dùng) dựa trên file mockup
  `Web Tool Hub.dc.html` ở gốc repo (file KHÔNG được commit vào git — chỉ là tài liệu tham
  khảo thiết kế, dùng 1 template engine riêng "x-dc" không liên quan tới Astro/Tailwind
  của dự án, không xoá vì có thể còn cần tham khảo sau). Đã áp dụng: font Space Grotesk
  (chữ chính) + JetBrains Mono (số liệu/badge/logo mark) tự host qua `@fontsource-variable`
  (gỡ Geist cũ), bảng màu accent emerald (`#047857` cho nền đặc/nút — đã tối hơn màu gốc
  `#10B981` trong mockup để đạt contrast ratio ≥4.5:1 theo WCAG AA, xem chi tiết trong log
  bên dưới), thanh privacy bar tối màu riêng biệt với theme, sidebar có badge chữ viết tắt
  theo màu xoay hue (`hue-rotate`) + đếm số tool, trang chủ có ô tìm kiếm lọc tool trực
  tiếp bằng JS thuần (không React), hero + stat chip, grid card danh mục. Áp dụng đồng bộ
  cho TOÀN BỘ site qua `Layout.astro`/`Header`/`Sidebar`/`Footer`/`PrivacyBanner` dùng
  chung nên cả 10 trang tool tự động thừa hưởng, không cần sửa riêng từng trang.
- Ghi chú dependency: đã chọn **jsoneditor** (không phải Monaco) cho tool #8 — nhẹ hơn
  nhiều, phù hợp triết lý Lighthouse/hiệu năng của dự án. Dùng bản **minimalist**
  (`jsoneditor/dist/jsoneditor-minimalist.js`, ~70KB gzip thay vì ~210KB bản đầy đủ) vì
  không cần chế độ `code` (Ace editor) hay JSON Schema validation (ajv) — chỉ dùng 2 chế
  độ `text`/`tree` đã đủ cho "Formatter & Validator". Có file khai báo type riêng
  `src/types/jsoneditor-minimalist.d.ts` (tái dùng type từ `@types/jsoneditor` vì package
  gốc không export type cho subpath `dist/jsoneditor-minimalist.js`).
- Ghi chú kỹ thuật (từ tool #8): thư viện vanilla-JS nào chạm vào global browser-only
  (`self`, `window`, `document`) ngay ở module scope SẼ LÀM CRASH `npm run build` (không
  chỉ warning) vì Astro SSR-render component `client:load` một lần trong lúc build để sinh
  HTML tĩnh, và bước đó chạy trong Node — không có các global đó. Cách sửa chuẩn: nạp thư
  viện bằng `await import(...)` (dynamic import) BÊN TRONG `useEffect` thay vì `import`
  tĩnh ở đầu file, vì effect không chạy trong lượt SSR của React. Nhớ áp dụng cho mọi thư
  viện non-React tương tự ở các tool sau nếu có.
- Ghi chú kiến trúc tool page: `src/pages/[locale]/tools/[slug].astro` giờ rẽ nhánh theo
  `toolId` — nếu là tool đã có UI thật thì render component riêng
  (`src/components/tools/<Ten>Page.astro`), còn lại vẫn rơi vào nhánh "coming soon" mặc
  định. Khi làm tool mới, thêm 1 nhánh `toolId === '<id-trong-tools.ts>'` mới tương tự,
  KHÔNG sửa các nhánh tool đã xong.
- Ghi chú i18n: mỗi tool có file dictionary namespace RIÊNG
  (`src/i18n/locales/{lang}/tool-<id>.json`). **`src/i18n/i18next.ts` đã refactor dùng
  `import.meta.glob('./locales/*/*.json', { eager: true })` để tự động nạp MỌI file JSON
  trong `src/i18n/locales/` theo đúng `{locale}/{namespace}.json`** — thêm file JSON tool
  mới KHÔNG cần sửa `i18next.ts` nữa, chỉ cần tạo đủ 8 file theo đúng tên
  `tool-<id>.json` và gọi `getFixedT(lang, 'tool-<id>')`.
- Ghi chú dependency AI: `@imgly/background-removal` có `onnxruntime-web` là
  **peerDependency** — npm KHÔNG tự cài kèm, phải `npm install onnxruntime-web@<version
  khớp>` thủ công, nếu không `npm run build` sẽ lỗi
  `Rolldown failed to resolve import "onnxruntime-web/webgpu"`.
- Ghi chú repo/deploy: repo đã push lên GitHub tại `DDM123455/devhub`
  (`https://github.com/DDM123455/devhub`), nhánh mặc định `main`. Deploy qua Cloudflare
  Git integration (Workers static assets, không phải `*.pages.dev` cổ điển) — domain thật:
  `https://devhub.duongdangmanh01.workers.dev` (đã cập nhật vào `astro.config.mjs`
  (`site`) và `public/robots.txt`). Mỗi lần push lên `main` sẽ tự deploy, không cần GitHub
  Actions/wrangler trong repo.
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

### 2026-07-25 — Phase 1.5, tool #4 & #5: Nâng cấp "Gộp/Tách PDF" — ĐANG LÀM DỞ
- Đang làm: benchmark iLovePDF/Smallpdf/PDF2GO cho tool #4 "Gộp PDF" và #5 "Tách PDF".
- Đã làm (commit `f1dbe2b`, chỉ ở local, CHƯA push lên `origin/main`):
  - Thêm `src/lib/pdf-thumbnails.ts` dùng chung cho cả 2 tool: gọi `pdfjs-dist` (đã hỏi và
    được đồng ý cài trước đó) để render thumbnail từng trang PDF, nạp qua dynamic import.
  - `PdfMerger.tsx`: đổi từ danh sách file sang lưới thumbnail theo TỪNG TRANG (mọi trang
    của mọi file gộp chung 1 lưới, không nhóm theo file) — kéo-thả sắp xếp lại (kèm nút
    mũi tên dự phòng cho bàn phím/không kéo được), xoay 90°/lần, xóa từng trang trước khi
    gộp.
  - `PdfSplitter.tsx`: thêm hiển thị thumbnail từng trang, xoay/xóa trang, thêm chế độ tách
    "Mỗi N trang" bên cạnh "Khoảng tùy chỉnh" đã có.
  - Cập nhật 16 file i18n (`tool-pdf-merge.json` + `tool-pdf-split.json` × 8 ngôn ngữ) —
    key UI mới + viết lại nội dung bài viết.
  - `npm run build` đã chạy **thành công** (exit code 0, xác nhận qua task notification)
    trước khi phiên bị gián đoạn.
- **CHƯA xong / còn thiếu trước khi tick ROADMAP.md**:
  - Test tương tác thật qua CDP (đúng quy trình đã áp dụng cho tool #1-#3) — đang test dở
    `PdfMerger.tsx` (upload 2 file PDF thật, xoay/xóa/sắp xếp trang, gộp, kiểm tra file kết
    quả bằng `pdf-lib` trong Node) thì bị gián đoạn giữa chừng, CHƯA có kết quả pass/fail.
  - Chưa test `PdfSplitter.tsx` (chế độ "Mỗi N trang" mới, xoay/xóa trang trước khi tách)
    hoàn toàn chưa chạy thử.
  - Chưa tick checkbox nào của tool #4/#5 trong `ROADMAP.md` Phase 1.5 — ĐÚNG, vì theo quy
    trình `CLAUDE.md` chỉ tick sau khi build + test xác nhận ổn, chưa được làm xong ở đây.
  - Chưa push commit `f1dbe2b` lên GitHub.
- Task tiếp theo khi mở phiên mới (làm đúng theo thứ tự): (1) chạy lại `npm run build` để
  xác nhận vẫn sạch, (2) chạy/hoàn tất test tương tác cho cả `PdfMerger.tsx` và
  `PdfSplitter.tsx` (script test CDP tham khảo nằm trong thư mục scratchpad của phiên
  trước, cần viết lại nếu không còn), (3) nếu mọi thứ ổn mới tick các checkbox tương ứng
  trong `ROADMAP.md` Phase 1.5 và ghi log hoàn tất, (4) hỏi người dùng trước khi push,
  (5) sau đó mới chuyển sang tool #6 "So sánh văn bản".

### 2026-07-25 — Phase 1.5, tool #3: Nâng cấp "Xóa nền ảnh" lên Feature Parity
- Benchmark: remove.bg, Adobe Express Background Remover.
- Trạng thái trước khi nâng cấp: batch nhiều ảnh + kéo-thả đã có sẵn từ Phase 1; preview
  chỉ là 2 thumbnail tĩnh cạnh nhau (không kéo so sánh được), chưa có thay nền, chưa có
  tinh chỉnh viền.
- Kiểm tra `Config` schema của `@imgly/background-removal` — thư viện KHÔNG có option
  edge refinement/feathering nào (chỉ có `model` isnet/isnet_fp16/isnet_quint8 và
  `output.format`/`quality`), đúng như `ROADMAP.md` dự liệu trước ("nếu thư viện hỗ trợ").
  Quyết định tự làm mềm viền bằng hậu xử lý JS thuần thay vì bỏ qua mục này.
- Đã làm:
  - Viết `softenAlphaEdges()`: box blur 2 lượt (ngang rồi dọc) áp dụng CHỈ lên kênh alpha
    của ảnh đã xóa nền — không đụng RGB — tạo hiệu ứng viền mềm tự nhiên hơn cho tóc/lông
    thú. Luôn tính lại từ `resultBlob` GỐC (không lặp làm mờ lên kết quả đã mờ trước đó)
    nên non-destructive, đổi slider qua lại không bị cộng dồn.
  - Viết `buildDisplayBlob()`: pipeline hợp nhất "làm mềm viền (nếu có) → ghép nền (màu
    solid / ảnh tùy chọn / giữ trong suốt)" thành 1 blob hiển thị (`displayUrl`), tách
    biệt hoàn toàn khỏi `resultBlob` gốc (không sửa/ghi đè kết quả AI thật) — cho phép đổi
    nền/độ mềm viền qua lại nhiều lần mà không cần chạy lại mô hình AI (chỉ chạy lại thao
    tác canvas nhẹ).
  - Thêm `useEffect` tính lại `displayUrl` cho MỌI ảnh đã xong mỗi khi nền hoặc độ mềm
    viền thay đổi — dependency dùng số lượng ảnh `status === 'done'` (không dùng
    `items` trực tiếp để tránh vòng lặp effect vô hạn do bản thân effect cũng gọi
    `setItems`).
  - Thêm UI slider so sánh trước/sau: 2 ảnh xếp chồng, ảnh kết quả bọc trong 1 lớp có nền
    caro (hiện qua vùng trong suốt) và bị cắt bằng CSS `clip-path` theo % vị trí; điều
    khiển bằng 1 `<input type="range">` trong suốt phủ toàn bộ khung (kéo bằng chuột/chạm/
    phím mũi tên đều dùng được, tận dụng accessibility có sẵn của range input thay vì tự
    viết logic kéo-thả bằng pointer events).
  - Thêm control chọn nền: 3 nút Trong suốt/Màu solid (kèm color picker)/Ảnh tùy chọn
    (kèm input file + nút xóa), áp dụng CHUNG cho toàn bộ danh sách ảnh (không phải từng
    ảnh riêng) — khớp UX phổ biến của remove.bg/Adobe (chọn 1 nền, áp cho cả batch).
  - Track mọi object URL (preview gốc, ảnh nền tùy chọn, display đã ghép) trong 1
    `useRef<Set>`, revoke hết khi unmount — giống pattern đã dùng ở tool Nén ảnh.
  - Thêm 7 key i18n UI mới (`backgroundLabel`, `backgroundTransparent`, `backgroundColor`,
    `backgroundImage`, `backgroundImageSelect`, `backgroundImageClear`,
    `edgeSoftnessLabel`) cho cả 8 ngôn ngữ, viết lại `meta`/`heading`/`tagline`/`p3`/`p4`
    của bài viết để phản ánh tính năng mới.
  - `npm run build` sạch, 89 trang.
  - **Test tương tác thật với model AI thật** (không mock) qua CDP: upload ảnh test thật
    200×150px, bấm Xóa nền — xác nhận model tải về + chạy suy luận thật (~15-27 giây tuỳ
    lần chạy, log tiến trình 0%→100% đúng), tải xuống PNG hợp lệ ở TRẠNG THÁI TRONG SUỐT
    MẶC ĐỊNH. Sau đó test lần lượt: chuyển sang nền màu solid (PNG mới, dung lượng khác —
    xác nhận ghép nền thật), tăng độ mềm viền lên 5px (PNG khác nữa), quay lại trong suốt
    (PNG khác nữa) — cả 4 bước đều cho ra PNG hợp lệ với dung lượng khác nhau ở mỗi bước,
    xác nhận pipeline ghép nền/làm mềm viền hoạt động đúng, không bị cache nhầm hay đứng
    yên. Gặp 1 lỗi giả trong chính script test (Chrome tự động tải xuống ghi đè file trùng
    tên thay vì thêm hậu tố "(1)" như tải tương tác thường — khiến bước so sánh
    before/after của script tưởng nhầm là "không có file mới"); sửa bằng cách xóa sạch thư
    mục tải trước mỗi lần kiểm tra thay vì so sánh diff — không phải lỗi sản phẩm.
- Quyết định kỹ thuật quan trọng:
  - Chọn nền áp dụng CHUNG cho cả danh sách thay vì từng ảnh riêng — đơn giản hóa UI đáng
    kể và khớp đúng cách các đối thủ benchmark làm (remove.bg cũng chọn 1 nền áp cho ảnh
    đang xử lý, không phải nền riêng biệt phức tạp cho từng ảnh trong batch).
  - Test bằng ảnh tổng hợp 200×150px (hình chữ nhật màu, không phải ảnh người/vật thật) —
    đủ để xác nhận toàn bộ PIPELINE kỹ thuật hoạt động đúng (model chạy, alpha blur đúng,
    ghép nền đúng), nhưng KHÔNG xác nhận được chất lượng cắt nền trên ảnh thật có chủ thể
    phức tạp (tóc, lông thú...) — việc đó cần thử bằng ảnh thật.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa tự thử bằng ảnh người/thú cưng thật để đánh giá chất lượng cắt nền và hiệu quả
    thực tế của slider làm mềm viền trên tóc/lông — nên thử tay khi có dịp.
  - Model AI tải từ CDN công khai của thư viện mất khoảng 15-27 giây trong lần test (mạng
    + máy chủ CI/test), thời gian thực tế cho người dùng cuối có thể khác tùy tốc độ mạng.
- Task tiếp theo: Phase 1.5, tool #4 & #5 "Gộp/Tách PDF".

### 2026-07-25 — Phase 1.5, tool #2: Nâng cấp "Chuyển đổi định dạng ảnh" lên Feature Parity
- Benchmark: Convertio, CloudConvert, iLoveIMG.
- Trạng thái trước khi nâng cấp: chỉ hỗ trợ 3 định dạng đích (WebP/JPEG/PNG); batch +
  chọn định dạng đích chung cho tất cả file **đã có sẵn từ Phase 1** (không phải làm lại).
- Đã hỏi người dùng trước khi cài `gifenc` (encoder GIF thuần JS, ~5KB gzip, không WASM)
  — được đồng ý dùng thư viện nhỏ thay vì bỏ qua GIF. `heic2any` cài không cần hỏi lại vì
  chính `ROADMAP.md` đã nêu tên thư viện này làm gợi ý cho mục HEIC.
- Đã làm:
  - Cài `gifenc` (không có type sẵn → viết `src/types/gifenc.d.ts` khai báo tối thiểu
    đúng API dùng tới: `quantize`, `applyPalette`, `GIFEncoder`) và `heic2any` (có sẵn
    `.d.ts`).
  - Mở rộng `TargetFormat` từ 3 lên 7: thêm AVIF, BMP, GIF, ICO.
    - AVIF: vẫn dùng `canvas.toBlob('image/avif', quality)` có sẵn của trình duyệt, nhưng
      **tự kiểm tra `blob.type` sau khi tạo** — một số trình duyệt (kể cả Chrome headless
      dùng để test) âm thầm trả về blob khác định dạng khi không hỗ trợ AVIF thay vì báo
      lỗi, nên phải tự phát hiện và báo message riêng (`errorAvifUnsupported`) thay vì tải
      xuống 1 file .avif rởm.
    - BMP: `canvas.toBlob` KHÔNG trình duyệt nào hỗ trợ xuất BMP — tự viết encoder JS
      thuần (`encodeBmp`) ghi trực tiếp bytes theo chuẩn BITMAPFILEHEADER +
      BITMAPINFOHEADER 24bpp không nén, không cần thư viện.
    - ICO: `canvas.toBlob` cũng không hỗ trợ — tự viết `encodeIco` bọc 1 PNG blob trong
      container ICO tối giản (header 22 byte + dữ liệu PNG nguyên vẹn — hợp lệ từ Windows
      Vista trở lên, không cần tự nén lại pixel). Tự động resize ảnh nếu lớn hơn 256×256
      (giới hạn kích thước icon chuẩn).
    - GIF: dùng `gifenc` (`quantize` → `applyPalette` → `GIFEncoder`) để nén palette +
      LZW từ dữ liệu pixel thô.
  - Mở rộng input `accept` + bộ lọc file để nhận thêm GIF/BMP/AVIF và đặc biệt HEIC/HEIF —
    ảnh HEIC từ iPhone thường có `file.type` RỖNG trên một số trình duyệt/hệ điều hành nên
    không thể chỉ lọc theo MIME type, phải kiểm tra thêm đuôi file `.heic`/`.heif`.
  - Thêm `toDecodableBlob()`: nếu file là HEIC/HEIF, chuyển qua `heic2any` thành PNG
    TRƯỚC khi đưa vào `createImageBitmap` (không trình duyệt nào giải mã HEIC trực tiếp
    được). Cả `heic2any` và `gifenc` đều nạp bằng **dynamic `import()`** thay vì import
    tĩnh — áp dụng đúng bài học rút ra từ lỗi SSR crash của `jsoneditor` ở tool #8 (thư
    viện chạm global trình duyệt ở module scope sẽ làm crash `npm run build` nếu import
    tĩnh, dù ở đây kiểm tra riêng thấy `heic2any` không trực tiếp đụng `self` — vẫn phòng
    ngừa theo nguyên tắc chung đã ghi trong log tool #8).
  - Thêm key i18n `ui.errorAvifUnsupported` và `ui.formatsNote` (giải thích giới hạn ICO
    256×256, yêu cầu trình duyệt mới cho AVIF, tự động đọc HEIC) cho cả 8 ngôn ngữ. Viết
    lại toàn bộ `meta`/`heading`/`tagline`/`article` cho cả 8 ngôn ngữ để phản ánh đúng 7
    định dạng + HEIC input (nội dung cũ chỉ nhắc JPEG/PNG/WebP đã lỗi thời, cũng là cơ hội
    SEO tốt hơn vì bắt thêm từ khóa "avif converter", "heic to jpg", "ico converter"...).
  - `npm run build` sạch, 89 trang.
  - **Test tương tác thật cho cả 7 định dạng đích** bằng CDP (viết tiếp từ script của tool
    #1): phát hiện lần chạy đầu TOÀN BỘ 7 định dạng đều lỗi "Something went wrong" — điều
    tra bằng cách bật `console.error` tạm thời trong catch block, phát hiện nguyên nhân
    thật là `createImageBitmap()` báo `InvalidStateError` vì ảnh test 1×1 pixel tổng hợp
    (dùng từ log tool #1) quá tối giản để giải mã — **không phải lỗi do code sửa** (dòng
    gọi `createImageBitmap` y hệt code gốc trước khi nâng cấp). Tạo lại ảnh test thật
    (200×150px, PNG hợp lệ qua GDI+/.NET) rồi chạy lại: **WebP/JPEG/PNG/BMP/ICO đều PASS
    (kiểm tra đúng magic bytes)**, **AVIF phát hiện đúng "trình duyệt không hỗ trợ" và báo
    message rõ ràng thay vì tạo file lỗi** (đúng thiết kế phòng ngừa), **GIF** ban đầu báo
    "MAGIC_BYTES_INVALID" nhưng khi đọc trực tiếp file thật trên đĩa xác nhận header
    `GIF89a` hợp lệ 542 byte — té ra là race condition trong logic so sánh
    before/after-download của SCRIPT TEST (đọc nhầm thời điểm), không phải lỗi encoder.
    Gỡ dòng `console.error` debug tạm trước khi build bản cuối.
- Quyết định kỹ thuật quan trọng:
  - Tự viết encoder BMP/ICO bằng tay thay vì thêm thư viện — cả 2 định dạng đủ đơn giản
    (BMP: header cố định + pixel thô; ICO: header cố định + PNG có sẵn) nên viết tay rẻ
    hơn và ít rủi ro hơn thêm dependency.
  - AVIF không dùng thư viện mã hoá riêng (như `@jsquash/avif` WASM) — chấp nhận phụ
    thuộc vào hỗ trợ native của trình duyệt vì đây đúng tinh thần "ưu tiên Web API có sẵn
    trước khi thêm thư viện" của `CLAUDE.md`; có UI báo lỗi rõ ràng cho trường hợp không
    hỗ trợ thay vì giả vờ luôn hoạt động.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chrome headless dùng để test có thể chưa hỗ trợ xuất AVIF (không xác nhận được AVIF
    thật trên trình duyệt có hỗ trợ) — logic phát hiện lỗi đã test đúng nhánh "không hỗ
    trợ", nhưng nhánh "trình duyệt CÓ hỗ trợ AVIF thật" chưa được test trực tiếp. Nên thử
    tay trên Chrome/Firefox bản mới khi có dịp.
  - Chưa test HEIC thật (không có sẵn file .heic mẫu trong môi trường build để test) — chỉ
    verify code logic `toDecodableBlob`/`isHeic` bằng đọc lại, chưa chạy qua CDP với file
    HEIC thật. Nên tự thử tay với ảnh HEIC thật từ iPhone khi có dịp.
  - Bài học phương pháp luận: khi viết script test tự động, nhớ 1×1 pixel test image quá
    tối giản với `createImageBitmap` — dùng ảnh test có kích thước/nội dung thực tế hơn
    (đã tạo `test-real.png` 200×150px qua PowerShell GDI+, lưu trong scratchpad phiên) cho
    các lần test sau liên quan tới decode ảnh qua Canvas API.
- Task tiếp theo: Phase 1.5, tool #3 "Xóa nền ảnh".

### 2026-07-25 — Phase 1.5, tool #1: Nâng cấp "Nén ảnh" lên Feature Parity
- Benchmark: TinyPNG, Squoosh, iLoveIMG (theo đúng yêu cầu trong `ROADMAP.md`).
- Trạng thái trước khi nâng cấp: batch upload nhiều ảnh, quality slider, kéo-thả đã có sẵn
  từ Phase 1 (không phải làm lại) — chỉ thiếu 2 mục: preview ảnh trực quan trước/sau (trước
  đó chỉ có số liệu dung lượng dạng text) và nút "Download All" dạng .zip.
- Đã hỏi người dùng trước khi cài `jszip` (thư viện zip, chưa có trong danh sách
  `ROADMAP.md`) — được đồng ý.
- Đã làm:
  - Cài `jszip` (bundle sẵn type TypeScript, không cần `@types` riêng).
  - Sửa `src/components/tools/ImageCompressor.tsx`:
    - Thêm `previewUrl` (tạo bằng `URL.createObjectURL(file)` ngay khi thêm ảnh) và
      `compressedPreviewUrl` (tạo sau khi nén xong) vào state từng item — hiển thị 2
      thumbnail 64×64 cạnh nhau (ảnh gốc → mũi tên → ảnh đã nén) kèm alt text mô tả đầy đủ
      (đáp ứng checklist SEO alt text).
    - Track mọi object URL đã tạo trong 1 `useRef<Set>`, revoke tất cả trong cleanup của
      `useEffect` khi component unmount — tránh leak memory vì object URL không tự giải
      phóng, và component này (khác các tool trước) tạo khá nhiều URL nếu người dùng
      upload nhiều ảnh.
    - Thêm `handleDownloadAll`: dùng `JSZip` gộp toàn bộ `compressedBlob` đã nén xong
      thành 1 file `compressed-images.zip`, chỉ hiện nút khi có > 1 ảnh đã nén xong
      (`doneCount > 1`) — nén 1 ảnh thì nút tải riêng lẻ đã đủ, không cần zip 1 file.
  - Thêm key i18n `ui.downloadAll` cho cả 8 ngôn ngữ trong `tool-image-compress.json`
    (dạng "Download All (.zip)" dịch tự nhiên từng ngôn ngữ), cập nhật
    `ImageCompressPage.astro` truyền message mới.
  - `npm run build` sạch, 89 trang.
  - **Test tương tác thật** (không chỉ tin build sạch/HTML tĩnh như phần lớn task trước) —
    viết 1 script Node dùng Chrome DevTools Protocol thuần (không cài puppeteer/playwright,
    dùng `WebSocket`/`fetch` built-in của Node 22) để: mở trang thật qua `npm run preview`,
    dùng `DOM.setFileInputFiles` set 2 file ảnh test vào đúng input, bấm nút Nén qua
    `Runtime.evaluate`, chờ và xác nhận cả 2 ảnh nén xong + 4 thẻ `<img>` preview hiện đúng
    (2 gốc + 2 đã nén), bấm "Download All", xác nhận 1 file `.zip` thật được tải xuống
    (231 bytes cho 2 ảnh test 68 bytes). Toàn bộ pass. Có chụp ảnh màn hình cuối cùng xác
    nhận UI đúng như thiết kế.
- Quyết định kỹ thuật quan trọng:
  - Không thêm nút xóa từng ảnh khỏi danh sách (không có trong checklist Phase 1.5, không
    tự ý mở rộng phạm vi) — giữ đúng scope 2 mục còn thiếu.
  - Nút "Download All" chỉ hiện khi `doneCount > 1` thay vì luôn hiện — tránh UI thừa khi
    chỉ có 1 ảnh (nút tải riêng lẻ đã đủ dùng).
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Ảnh test dùng để verify là PNG 1×1 pixel tổng hợp (không phải ảnh thật) nên % giảm dung
    lượng ra số ÂM (-40%, vì overhead định dạng lớn hơn nội dung cho ảnh siêu nhỏ) — đây là
    đặc thù của ảnh test, KHÔNG phải lỗi công thức tính (`1 - compressedSize/originalSize`
    vẫn đúng, ảnh thật vài trăm KB-vài MB sẽ luôn ra số dương như mong đợi).
  - Script test CDP (`cdp-test.js`) lưu trong thư mục scratchpad của phiên, không phải file
    dự án — nếu muốn tái sử dụng cho các tool khác ở Phase 1.5 cần viết lại/tham số hóa
    (chọn selector input, tên nút Compress khác nhau theo từng tool).
- Task tiếp theo: Phase 1.5, tool #2 "Chuyển đổi định dạng ảnh".

### 2026-07-25 — Redesign toàn site theo mockup `Web Tool Hub.dc.html` (ngoài ROADMAP.md)
- Bối cảnh: sau khi hoàn tất Phase 1, người dùng để lại 1 file mockup thiết kế
  `Web Tool Hub.dc.html` ở gốc repo và yêu cầu trực tiếp "dùng thiết kế của file đó" +
  "thiết kế các màn hình khác dựa trên file đó". File này xuất từ 1 công cụ thiết kế khác
  (dùng custom element `<x-dc>`, style dạng JS object + template `{{ }}`) — KHÔNG copy
  nguyên code (không tương thích Astro/Tailwind/Shadcn), chỉ dùng làm tài liệu tham khảo
  ngôn ngữ thiết kế (màu sắc, font, layout, spacing).
- Đã hỏi người dùng 2 câu hỏi phạm vi trước khi làm: (1) áp dụng toàn site hay chỉ trang
  chủ → chọn **toàn site**; (2) nguồn font Space Grotesk/JetBrains Mono — Google Fonts CDN
  (như mockup) hay tự host → chọn **tự host qua `@fontsource-variable`** (khớp cách dự án
  đã làm với font Geist cũ, tránh gọi ra ngoài).
- Đã làm:
  - Gỡ `@fontsource-variable/geist`, cài `@fontsource-variable/space-grotesk` +
    `@fontsource-variable/jetbrains-mono`. Cập nhật `src/styles/global.css`: `--font-sans`
    → Space Grotesk, thêm `--font-mono` → JetBrains Mono.
  - Viết lại toàn bộ token màu Shadcn (`:root`/`.dark` trong `global.css`) sang bảng màu
    của mockup (bg/card/border/text riêng cho light và dark, accent emerald, thêm 2 biến
    mới `--privacy-bar-bg`/`--privacy-bar-fg` cho thanh privacy bar tối màu cố định không
    theo theme).
  - Thêm `letter` (IMG/PDF/TXT/DEV — mã hiển thị cố định, không dịch, giống cách "PDF"
    không dịch) và `hue` (0/45/100/160) vào `src/data/categories.ts` để tô màu badge từng
    danh mục bằng kỹ thuật CSS `filter: hue-rotate()` trên cùng 1 màu accent — đúng kỹ
    thuật mockup dùng để có 4 màu hài hòa từ 1 token duy nhất thay vì tự định nghĩa 4 màu
    rời rạc.
  - Viết lại `PrivacyBanner.astro` (thanh mono nhỏ, nền tối cố định), `Header.astro` (logo
    mark `>_` + tên site, ô tìm kiếm CÓ ĐIỀU KIỆN qua prop `showSearch` — chỉ hiện ở trang
    có JS lọc thật, tránh UI giả không hoạt động trên trang tool), `Sidebar.astro` (badge
    chữ viết tắt + đếm số tool mỗi nhóm, đọc trực tiếp từ `tools.ts`), `Footer.astro` (1
    dòng giữa trang, có thêm key `footer.tagline` mới), restyle nhẹ `ThemeToggle.astro`/
    `LanguageSwitcher.astro` cho khớp bo góc/kích thước mới.
  - Viết lại hoàn toàn trang chủ `src/pages/[locale]/index.astro`: hero (kicker + heading +
    tagline + 3 stat chip: số tool/số nhóm/"0 KB ever uploaded"), grid card danh mục (2
    cột), MỖI card liệt kê tool kèm mũi tên hiện khi hover. **Nhân tiện dọn nợ kỹ thuật cũ**
    đã ghi trong log Phase 0: xoá nút `<Button client:load>Shadcn Button OK</Button>` demo
    còn sót lại từ lúc setup Shadcn, không phục vụ mục đích gì từ Phase 1.
  - **Thêm tính năng tìm kiếm lọc tool trực tiếp trên trang chủ** (không có trong scope gốc
    của `ROADMAP.md`, nhưng mockup thể hiện rõ đây là 1 phần thiết kế/tương tác, không chỉ
    trang trí) — dùng JS thuần (không React) trong `<script>` cuối `index.astro`: input với
    id `tool-search` (render trong `Header` qua prop `showSearch`), lọc bằng cách so khớp
    `data-tool-name` trên từng link tool, ẩn/hiện qua class `hidden`, ẩn card danh mục nếu
    không còn tool nào khớp, hiện thông báo "không tìm thấy" khi cần. Không dùng React vì
    đây chỉ là filter DOM đơn giản, đúng tinh thần "JS thuần khi có thể" đã áp dụng cho các
    tool JS-only trước đó.
  - Thêm key i18n mới cho cả 8 ngôn ngữ trong `common.json`: `home.kicker`,
    `home.stats.{tools,categories,uploaded}`, `search.{placeholder,noResults}`,
    `sidebar.note`, `footer.tagline`; viết lại nội dung `home.heading`/`home.tagline` theo
    đúng câu chữ mockup (dịch tự nhiên riêng từng ngôn ngữ, không máy móc).
  - `npm run build` sinh đủ 89 trang không lỗi. Chạy `npm run preview` + chụp ảnh bằng
    Chrome headless (`--screenshot`, và `--force-dark-mode` để xem đúng theme tối) cho cả
    trang chủ và 1 trang tool (`split-pdf`) — xác nhận bằng mắt giao diện khớp mockup ở cả
    2 theme, không chỉ tin vào build sạch/HTML tĩnh như các task trước.
  - Chạy Lighthouse trên trang chủ sau khi đổi giao diện: phát hiện Accessibility tụt còn
    95 (trước đó 100) do `color-contrast` — chữ mono nhỏ màu accent (`text-primary`) trên
    nền sáng chỉ đạt tỉ lệ tương phản 2.36 (cần ≥4.5), tương tự badge chữ trắng trên nền
    accent (2.53) và text phụ dùng `/70` opacity ở Footer/Sidebar (2.87). Đây là lỗi thật
    (ảnh hưởng người dùng khiếm thị), không bỏ qua dù 95 điểm đã đạt ngưỡng ≥90 của
    `CLAUDE.md`.
  - **Sửa contrast**: đổi `--primary` (nền đặc dùng cho nút/badge, CẢ 2 theme) từ
    `#10B981` sang `#047857` (đậm hơn, vẫn rõ ràng là "xanh emerald" nhưng chữ trắng trên
    nền này đạt ~5.3:1). Với 2 chỗ dùng màu accent làm CHỮ trực tiếp trên nền trang (kicker
    ở hero, logo mark `>_`), tách riêng dùng `text-emerald-700 dark:text-emerald-400`
    (không qua token `--primary` dùng chung) vì 2 theme cần độ sáng khác nhau để đủ tương
    phản trên nền riêng của từng theme. Bỏ hết `/70` opacity ở text phụ trong
    `Footer.astro`/`Sidebar.astro`, vì bản thân `--muted-foreground` đã đủ tương phản
    (~5.2:1) — giảm opacity là nguyên nhân duy nhất gây lỗi.
  - Build lại + chạy Lighthouse lần 2: **Performance 99, Accessibility 100, Best Practices
    100, SEO 100**. Chụp lại ảnh xác nhận màu emerald đậm hơn vẫn giữ đúng tinh thần thiết
    kế, không bị "chìm"/xỉn màu.
- Quyết định kỹ thuật quan trọng:
  - KHÔNG commit file mockup `Web Tool Hub.dc.html` vào git — không phải mã nguồn dự án,
    chỉ là tài liệu thiết kế tham khảo của người dùng, để nguyên trong working directory
    (không xoá).
  - Ô tìm kiếm trong `Header` chỉ hiện khi trang truyền `showSearch` (hiện tại chỉ trang
    chủ) — tránh hiển thị UI tìm kiếm "chết" (không hoạt động) trên 10 trang tool, đúng
    nguyên tắc "không xây UI nửa vời" đã nêu trong hướng dẫn hành vi chung.
  - Không thêm badge "New" cho tool nào trên trang chủ dù mockup có ví dụ minh hoạ badge
    này — dự án không có dữ liệu "tool nào thực sự mới" đáng tin cậy trong `tools.ts`, thêm
    badge tuỳ tiện sẽ là bịa dữ liệu thay vì phản ánh thực tế.
  - Giữ nguyên cấu trúc token Shadcn hiện có (`--primary`, `--card`, `--muted`...) thay vì
    viết CSS tuỳ biến riêng — đảm bảo `Button`/component Shadcn khác ở 10 trang tool tự
    động ăn theme mới mà không cần sửa từng trang.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa test tương tác thật bằng chuột/bàn phím thật (gõ vào ô tìm kiếm xem lọc đúng
    không, bấm toggle sidebar mobile, bấm đổi theme) — chỉ verify qua ảnh chụp Chrome
    headless tĩnh (2 theme) + đọc code logic script. Nên tự thử tay khi có dịp.
  - Thanh JSON editor (`jsoneditor`, tool #8) vẫn giữ theme sáng riêng bất kể theme site
    (giới hạn đã ghi nhận từ trước, không đổi trong lần redesign này).
  - Category `DEV` hiện chỉ có 2 tool thật (JSON Formatter, QR Generator) — card "Dev
    Tools" trên trang chủ có khoảng trống dưới do card khác trong hàng cao hơn (grid 2 cột
    không đồng chiều cao) — chấp nhận được ở v1, có thể cân nhắc `items-start` hoặc masonry
    nếu thấy chưa ổn khi có thêm tool Phase 3.
- Task tiếp theo: theo con trỏ ROADMAP.md mới nhất — **Phase 1.5**, bắt đầu từ công cụ #1
  "Nén ảnh" (xem "Trạng thái hiện tại" phía trên).

### 2026-07-25 — Phase 1, công cụ #10 (CUỐI CÙNG): Chuyển đổi Case văn bản — HOÀN TẤT Phase 1
- Đã làm:
  - Tạo `src/components/tools/TextCaseConverter.tsx` (React, `client:load`), JS thuần
    không dùng thư viện: 1 textarea nhập, hàng nút chọn 1 trong 5 kiểu case
    (UPPERCASE/lowercase/Title Case/camelCase/snake_case), 1 textarea kết quả read-only
    tính bằng `useMemo` (cập nhật ngay khi đổi text hoặc đổi nút chọn), nút Sao chép
    (`navigator.clipboard.writeText`) và nút Xóa hết.
  - Viết hàm `splitWords()` dùng chung cho camelCase/snake_case: trước khi tách từ theo
    khoảng trắng/gạch ngang/gạch dưới/dấu câu, tự động chèn khoảng trắng tại các ranh giới
    chữ-thường-sang-chữ-hoa và CHUỖI-HOA-sang-Chữ-hoa-thường có sẵn — nghĩa là dán
    `"hello-world"`, `"Hello World"`, hay thậm chí `"helloWorld"` đã có case sẵn đều ra
    cùng 1 kết quả đúng, không bị dính chữ thành `"helloworld"` hay tách sai.
  - Tạo `src/components/tools/TextCaseConverterPage.astro`: theo khuôn các trang tool
    trước, JSON-LD `WebApplication`, nội dung hướng dẫn 4 đoạn/ngôn ngữ, link tới 2 tool
    cùng category `text` (So sánh văn bản, Đếm từ & ký tự). Với `ja`/`ko`, ghi rõ trong
    bài viết rằng bản thân văn bản tiếng Nhật/Hàn không có khái niệm hoa/thường như chữ
    Latin, nên tính năng này chủ yếu hữu ích với định danh/từ tiếng Anh xen trong văn bản.
  - Tạo 8 file dictionary i18n `tool-text-case-converter.json`.
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh
    `toolId === 'text-case-converter'` — đây là nhánh cuối cùng, tất cả 10 tool trong
    `src/data/tools.ts` giờ đều có UI thật, không còn tool nào rơi vào nhánh "coming soon"
    mặc định.
  - `npm run build` sinh đủ 89 trang không lỗi; đọc thử
    `dist/en/tools/text-case-converter/index.html` xác nhận title/heading/UI đúng.
- Quyết định kỹ thuật quan trọng:
  - Chỉ làm đúng 5 kiểu case nêu trong `ROADMAP.md` (không tự thêm PascalCase/kebab-case/
    CONSTANT_CASE dù kỹ thuật rất dễ thêm) — giữ đúng phạm vi task đã định, tránh
    over-engineer.
  - UI dùng nút bấm + 1 khung kết quả (thay vì hiện cả 5 kết quả cùng lúc) — nhất quán với
    cách chọn 1-trong-nhiều bằng radio ở Text Diff Checker, và tránh màn hình bị rối với 5
    khung văn bản cùng lúc.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa test tương tác thật (gõ trực tiếp, bấm từng nút case, bấm Sao chép xem có copy
    đúng vào clipboard) trên trình duyệt thật — chỉ verify qua `npm run build` + đọc HTML
    tĩnh, giống tình trạng chung của các tool trước.
  - `navigator.clipboard.writeText` yêu cầu HTTPS hoặc `localhost` mới hoạt động (Clipboard
    API bị trình duyệt chặn trên HTTP thường) — không phải vấn đề vì Cloudflare luôn phục
    vụ qua HTTPS, nhưng cần nhớ nếu sau này test bằng `npm run preview` qua HTTP thuần trên
    mạng LAN thì nút Sao chép có thể không hoạt động.
- **Phase 1 — 10 công cụ cốt lõi: HOÀN TẤT toàn bộ 10/10 task.** Toàn bộ 10 trang công cụ
  đều có UI thật, đủ 8 ngôn ngữ, đủ checklist SEO (title/description riêng, JSON-LD,
  nội dung 300-500 từ, link liên quan, sitemap tự động).
- Task tiếp theo: Bắt đầu Phase 2 — mở rộng i18n từ 8 lên 15-20 ngôn ngữ (xem `ROADMAP.md`
  Phase 2, task đầu tiên).

### 2026-07-25 — Phase 1, công cụ #9: QR Code Generator
- Đã làm:
  - Cài `qrcode.react` (đã kèm sẵn type TypeScript, không cần `@types` riêng như
    `jsoneditor`). Component `QRCodeCanvas` của thư viện này có sẵn prop `imageSettings`
    (src/height/width/excavate) — đúng khớp yêu cầu "logo giữa" của `ROADMAP.md`, không
    cần tự viết logic vẽ logo đè lên canvas bằng tay.
  - Tạo `src/components/tools/QrCodeGenerator.tsx` (React, `client:load`): ô nhập
    text/URL, 2 input `type="color"` (màu chính/màu nền), thanh trượt kích thước
    (128-512px), input file chọn logo (đọc qua `FileReader.readAsDataURL` — không upload
    đi đâu), nút xóa logo, nút tải PNG (lấy `canvasRef.current.toDataURL('image/png')` —
    `QRCodeCanvas` forward ref thẳng ra thẻ `<canvas>` nên không cần `querySelector`).
    Luôn set `level="H"` (mức sửa lỗi cao nhất, ~30% dự phòng) vì logo đè lên giữa mã sẽ
    che mất một phần dữ liệu — mức H đảm bảo mã vẫn quét được.
  - Tạo `src/components/tools/QrCodeGeneratorPage.astro`: theo khuôn các trang tool
    trước, JSON-LD `WebApplication` (`DeveloperApplication`), nội dung hướng dẫn 4
    đoạn/ngôn ngữ giải thích vì sao nên tạo QR tại chỗ thay vì qua dịch vụ rút gọn link có
    theo dõi, link tới tool cùng category `dev` (JSON Formatter).
  - Tạo 8 file dictionary i18n `tool-qr-generator.json`.
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh `toolId === 'qr-generator'`.
  - `npm run build` sinh đủ 89 trang không lỗi ngay từ lần đầu (không gặp vấn đề SSR như
    tool #8 vì `qrcode.react` là component React chuẩn, không đụng global browser-only ở
    module scope).
- Quyết định kỹ thuật quan trọng:
  - Không tự vẽ QR code bằng canvas tay (dù `ROADMAP.md` có nhắc "Canvas") — dùng
    `QRCodeCanvas` của `qrcode.react` vì nó ĐÃ render ra đúng 1 thẻ `<canvas>` HTML thật
    (đáp ứng đúng yêu cầu công nghệ), tự lo phần mã hóa QR (thuật toán Reed-Solomon phức
    tạp) và excavate vùng logo — tự viết lại từ đầu là việc thừa, rủi ro cao hơn.
  - Mặc định luôn dùng `level="H"` kể cả khi không có logo — đơn giản hóa logic (không cần
    tính lại mức sửa lỗi mỗi khi bật/tắt logo), và mức H không có nhược điểm đáng kể ngoài
    mã hơi dày hơn cho cùng nội dung, chấp nhận được.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa test tương tác thật (đổi màu, upload logo thật, quét thử mã QR bằng điện thoại)
    trên trình duyệt thật — chỉ verify qua `npm run build` + đọc HTML tĩnh.
  - Chưa validate URL hợp lệ hay giới hạn độ dài text đầu vào — người dùng nhập gì cũng
    được mã hóa (kể cả text thường, không nhất thiết phải là URL), đúng tinh thần tên tool
    "QR Code Generator" chung chung, không giới hạn riêng cho URL.
- Task tiếp theo: Phase 1, công cụ #10 (CUỐI CÙNG) "Chuyển đổi Case văn bản"
  (upper/lower/Title/camelCase/snake_case), JS thuần.

### 2026-07-25 — Phase 1, công cụ #8: JSON Formatter & Validator
- Đã làm:
  - Hỏi người dùng chọn giữa Monaco editor và jsoneditor (2 lựa chọn `ROADMAP.md` để mở)
    — người dùng chọn **jsoneditor** vì nhẹ hơn, ít rủi ro ảnh hưởng điểm Lighthouse
    Performance hơn Monaco (Monaco nặng ~2-3MB và cần cấu hình Web Worker riêng cho ngôn
    ngữ, phức tạp hơn nhiều so với nhu cầu thực tế của 1 tool định dạng JSON).
  - Cài `jsoneditor` (dependency) + `@types/jsoneditor` (devDependency, vì package gốc
    không kèm sẵn type declaration).
  - Tạo `src/types/jsoneditor-minimalist.d.ts`: khai báo ambient module cho subpath
    `jsoneditor/dist/jsoneditor-minimalist.js` (bản **minimalist** — loại bỏ Ace editor,
    ajv, vanilla-picker — giảm từ ~210KB xuống ~70KB gzip), tái sử dụng type có sẵn từ
    `@types/jsoneditor` vì bản đầy đủ và bản minimalist có cùng API bề mặt (chỉ khác chế
    độ `code` không khả dụng, mà tool này không dùng chế độ đó).
  - Tạo `src/components/tools/JsonFormatter.tsx` (React, `client:load`): widget
    `jsoneditor` là thư viện vanilla JS tự quản lý DOM riêng, nên khởi tạo bằng
    `useEffect` (tạo instance khi mount, `destroy()` khi unmount) thay vì điều khiển qua
    React state như các component khác — đây là cách chuẩn để bọc 1 thư viện widget
    non-React trong React island. Bật 2 chế độ `text` (dán JSON thô, có nút Format/Compact
    sẵn trong thanh công cụ mặc định của thư viện) và `tree` (duyệt cây tương tác,
    mở/đóng/sửa từng node) — validate lỗi cú pháp tự động hiển thị sẵn trong UI của thư
    viện (không cần tự viết thêm UI báo lỗi).
  - Tạo `src/components/tools/JsonFormatterPage.astro`: theo khuôn các trang tool trước —
    title/description theo từ khóa "json formatter"/"json validator", JSON-LD
    `WebApplication` (`applicationCategory: DeveloperApplication` thay vì
    `UtilitiesApplication` vì đây rõ ràng là công cụ cho dev), nội dung hướng dẫn 4
    đoạn/ngôn ngữ, link tới tool cùng category `dev` (QR Code Generator — dù chưa có UI
    thật, route vẫn tồn tại nên link không chết, chỉ tạm rơi vào trang "coming soon").
  - Tạo 8 file dictionary i18n `tool-json-formatter.json`. **Tự phát hiện và sửa 1 lỗi gõ
    nhầm** trong bản tiếng Pháp (`p2` ban đầu lỡ gõ "Il repose sur pdf-lib — non, sur
    jsoneditor..." — vết tích copy nhầm từ ngữ cảnh tool PDF trước đó) trước khi commit.
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh `toolId === 'json-formatter'`.
  - `npm run build` sinh đủ 89 trang không lỗi; đọc thử
    `dist/en/tools/json-formatter/index.html` xác nhận title/heading đúng.
- Quyết định kỹ thuật quan trọng:
  - Không theme lại `jsoneditor` để khớp dark mode của site — thư viện này không hỗ trợ
    dark theme sẵn cho chế độ `text`/`tree` (chỉ chế độ `code` dùng Ace mới có option
    `theme`, mà bản minimalist không dùng chế độ đó). Chấp nhận widget giữ giao diện sáng
    riêng (ghi rõ 1 dòng chú thích nhỏ ngay dưới editor cho người dùng biết đây là hành vi
    có chủ đích, không phải lỗi UI) thay vì tự viết CSS override phức tạp cho một thư viện
    bên thứ ba — đúng tinh thần "không over-engineer" của dự án.
  - Không dùng JSON Schema validation (`ajv`, option `schema`) — tool này chỉ cần validate
    cú pháp JSON cơ bản, không có khái niệm "schema chuẩn" nào để so khớp; đây cũng là lý
    do chọn bản minimalist thay vì bản đầy đủ.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa test tương tác thật (dán JSON lỗi, xem thông báo lỗi, chuyển đổi qua lại
    text/tree mode) trên trình duyệt thật — chỉ verify qua `npm run build` + đọc HTML
    tĩnh. Vì đây là lần đầu tích hợp một thư viện widget non-React khá phức tạp
    (`useEffect` + cleanup + DOM ngoài React), nên ưu tiên test tay thật sớm nếu có dịp mở
    dev server, rủi ro cao hơn các tool JS thuần trước.
  - Chưa chạy Lighthouse riêng cho trang này để xác nhận `jsoneditor` (dù đã chọn bản nhẹ
    nhất) không kéo điểm Performance xuống dưới ngưỡng 90 — nên làm ở lần kiểm tra
    Lighthouse toàn site kế tiếp (Phase 2).
- Task tiếp theo: Phase 1, công cụ #9 "QR Code Generator" (tùy chỉnh màu, logo giữa) dùng
  `qrcode.react` + Canvas.

### 2026-07-25 — Phase 1, công cụ #7: Đếm từ & ký tự
- Đã làm:
  - Tạo `src/components/tools/WordCounter.tsx` (React, `client:load`): 1 ô textarea, các
    chỉ số (số từ, số ký tự, số ký tự không tính khoảng trắng, số câu, số đoạn văn, thời
    gian đọc ước tính) tính bằng `useMemo` và **cập nhật trực tiếp khi gõ** — không có nút
    "tính toán" vì đây là phép đếm JS thuần cực nhẹ, không cần bước xử lý riêng biệt như
    các tool trước (khác với Diff Checker cần bấm "So sánh" vì thuật toán diff tốn hơn).
    Số câu đếm theo dấu kết thúc câu (`.`, `?`, `!`); số đoạn văn tính theo khối văn bản
    cách nhau bởi dòng trống; thời gian đọc ước tính theo tốc độ trung bình 200 từ/phút,
    làm tròn lên tối thiểu 1 phút. Có nút "Xóa hết".
  - Tạo `src/components/tools/WordCounterPage.astro`: theo đúng khuôn các trang tool
    trước — title/description riêng theo từ khóa "word counter"/"character counter",
    JSON-LD `WebApplication` giá 0 USD, nội dung hướng dẫn 4 đoạn/ngôn ngữ, link tới 2 tool
    cùng category `text` (So sánh văn bản, và tool #10 Chuyển đổi Case khi được làm).
  - Tạo 8 file dictionary i18n `tool-word-counter.json` — dịch tay riêng cho từng ngôn
    ngữ; với `ja`/`ko`, chú thích rõ trong bài viết rằng số liệu "số từ" chỉ mang tính
    tham khảo vì 2 ngôn ngữ này không tách từ bằng khoảng trắng như các ngôn ngữ Latin.
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh `toolId === 'word-counter'` →
    `<WordCounterPage lang={locale} />`.
  - `npm run build` sinh đủ 89 trang không lỗi; đọc thử
    `dist/en/tools/word-counter/index.html` và `dist/vi/tools/dem-tu-va-ky-tu/index.html`
    xác nhận title/heading/link liên quan đúng.
- Quyết định kỹ thuật quan trọng:
  - Không dùng thư viện đếm từ nào — đúng chỉ định "JS thuần" trong `ROADMAP.md`, phép
    đếm dựa trên `split`/`match`/regex cơ bản là đủ chính xác cho mục đích công cụ này.
  - Cập nhật số liệu live theo từng ký tự gõ (không cần nút bấm) — khác pattern
    "chọn file rồi bấm nút xử lý" của các tool trước, vì đây là phép tính tức thời trên
    text đã có sẵn trong bộ nhớ, không có bước I/O hay xử lý nặng nào cần chờ.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Số câu/đoạn văn dùng heuristic đơn giản (regex dấu câu, dòng trống) nên có thể đếm
    sai với văn bản không theo chuẩn (danh sách gạch đầu dòng không có dấu chấm, văn bản
    dùng dấu câu Á Đông như `。`) — đã ghi rõ giới hạn này trong nội dung SEO thay vì giả
    vờ chính xác tuyệt đối; có thể cải thiện regex cho dấu câu CJK ở Phase 2/3 nếu cần.
  - Chưa test tương tác thật trên trình duyệt (gõ trực tiếp, xem số liệu cập nhật live) —
    chỉ verify qua `npm run build` + đọc HTML tĩnh, giống tình trạng các tool trước.
- Task tiếp theo: Phase 1, công cụ #8 "JSON Formatter & Validator" (Monaco editor hoặc
  jsoneditor).

### 2026-07-25 — Phase 1, công cụ #5: Tách PDF (Split)
- Đã làm:
  - Tạo `src/components/tools/PdfSplitter.tsx` (React, `client:load`): chọn 1 file PDF
    (input hoặc kéo-thả), đọc bằng `PDFDocument.load` để hiển thị tổng số trang. Ô nhập
    "khoảng trang" dạng text tự do (VD `1-3, 4, 5-7`) — mỗi nhóm cách nhau dấu phẩy tách
    thành 1 file PDF kết quả riêng; để trống thì mặc định tách MỖI TRANG thành 1 file
    riêng (dùng `Array.from({length: pageCount})` sinh range 1 trang). Parse range bằng
    regex đơn giản (`^\d+$` hoặc `^\d+-\d+$`), validate trong khoảng `1..pageCount`, ném
    lỗi kiểu `RangeParseError` riêng (không dùng string-matching mong manh) để phân biệt
    rõ với lỗi đọc PDF khi hiển thị thông báo lỗi đúng loại. Mỗi file kết quả có nút tải
    riêng (giống pattern `PdfMerger`/`ImageCompressor`) — không dùng zip vì không có trong
    danh sách dependency được phép của `ROADMAP.md`.
  - Tạo `src/components/tools/PdfSplitPage.astro`: bám sát khuôn mẫu `PdfMergePage.astro`
    — title/description riêng theo từ khóa "split pdf"/"tách pdf", JSON-LD
    `WebApplication` giá 0 USD, nội dung hướng dẫn 4 đoạn/ngôn ngữ (~300-400 từ), link tới
    2 tool cùng category `pdf` (Gộp PDF, và tool #10 nếu category liên quan — thực tế
    Phase 1 category `pdf` hiện chỉ có 2 tool nên link 1 chiều rõ ràng tới Gộp PDF).
  - Tạo 8 file dictionary i18n `tool-pdf-split.json`, dịch tay riêng cho từng ngôn ngữ
    (không AI-spin lặp cấu trúc y hệt nhau — mỗi bản dịch giữ đúng văn phong/cách diễn đạt
    tự nhiên của ngôn ngữ đó, theo đúng phong cách đã dùng ở `tool-pdf-merge.json`).
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh `toolId === 'pdf-split'` →
    `<PdfSplitPage lang={locale} />`.
  - `npm run build` sinh đủ 89 trang không lỗi; đọc thử
    `dist/en/tools/split-pdf/index.html` và `dist/vi/tools/tach-pdf/index.html` xác nhận
    title/heading/UI đúng.
- Quyết định kỹ thuật quan trọng:
  - Không dùng thư viện zip để gộp nhiều file kết quả thành 1 lần tải — giữ đúng nguyên
    tắc "không thêm dependency ngoài danh sách `ROADMAP.md`", mỗi file kết quả có nút tải
    riêng là đủ cho v1, giống cách tool Nén ảnh (#1) đã quyết định trước đó.
  - Định dạng "khoảng trang" nhập tay dạng text (`1-3, 4, 5-7`) thay vì UI chọn trang bằng
    checkbox/thumbnail — đơn giản, nhất quán với các input dạng text khác trong dự án,
    tránh phải render thumbnail từng trang PDF (tốn thêm xử lý/dependency render PDF
    không cần thiết cho v1).
  - Không bọc trong Web Worker riêng — lý do giống hệt tool Gộp PDF (#4): thao tác copy
    trang bằng `pdf-lib` là xử lý byte nhanh, không phải suy luận ML hay giải mã pixel.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa test tương tác thật (chọn PDF thật, nhập range, tải từng file kết quả) trên
    trình duyệt thật — chỉ verify qua `npm run build` + đọc HTML tĩnh, giống tình trạng
    các tool PDF/ảnh trước.
  - Category `pdf` hiện có đúng 2 tool (Gộp PDF, Tách PDF) nên phần "công cụ liên quan"
    của cả 2 trang chỉ hiện 1 link chéo nhau — sẽ tự động có thêm lựa chọn nếu Phase 3 bổ
    sung tool PDF khác, không cần sửa gì thêm (logic lọc theo `category` đã tổng quát).
- Task tiếp theo: Phase 1, công cụ #7 "Đếm từ & ký tự" (JS thuần).

### 2026-07-25 — Sửa `.git/index` hỏng + gộp (merge) công cụ #4 và #6 từ worktree agent
- Bối cảnh: người dùng yêu cầu kiểm tra xem các chức năng đã code có được gộp vào `main`
  và đã push lên GitHub chưa. Khi chạy `git status`, phát hiện `.git/index` của repo
  chính bị hỏng (`fatal: index file corrupt`, file toàn byte `0x00`) — chặn mọi lệnh cần
  đọc index. Đào sâu bằng các lệnh git không cần index (`cat-file`, `log`,
  `worktree list`) phát hiện `.claude/worktrees/` còn 3 worktree phụ (dấu vết background
  agent chạy song song ở phiên trước):
  - `agent-a3473eb7a9c0f0cfc` → branch riêng, commit `198efe5` = code đầy đủ **công cụ #4
    Gộp PDF (Merge)** dùng `pdf-lib` (component + trang SEO + 8 file i18n).
  - `agent-a28729a2e6a090b60` → branch riêng, commit `aa89f80` = code đầy đủ **công cụ #6
    So sánh văn bản (Diff Checker)** dùng `diff` (jsdiff).
  - Cả hai agent CỐ Ý không sửa `[slug].astro`/`ROADMAP.md`/`PROGRESS.md` (ghi rõ trong
    commit message, để tránh xung đột khi chạy song song) — bước tích hợp cuối cùng chưa
    từng xảy ra, nhiều khả năng đúng lúc đó `.git/index` bị hỏng (tiến trình bị ngắt giữa
    chừng).
  - `agent-a494ece694ff1143f` — worktree thứ 3 hỏng hẳn, ref branch là 41 byte NUL thuần
    (không phải SHA hợp lệ), thư mục chưa từng `npm install`/có commit nào — agent bị
    crash/kill ngay từ bước khởi tạo, không có gì để cứu.
- Đã làm:
  - Xóa `.git/index` rồi `git reset` (mixed reset, đọc lại index từ `HEAD` tree) — không
    đụng working tree, không mất commit nào (toàn bộ lịch sử `main` vẫn nguyên vẹn).
  - `git merge worktree-agent-a3473eb7a9c0f0cfc` (công cụ #4) — fast-forward sạch.
  - `git merge worktree-agent-a28729a2e6a090b60` (công cụ #6) — auto-merge sạch
    (`package.json`/`package-lock.json` chỉ conflict do thêm dependency ở vị trí khác
    nhau, git tự resolve đúng).
  - Hoàn tất phần tích hợp mà 2 agent cố ý bỏ qua: thêm 2 nhánh `toolId === 'pdf-merge'`
    và `toolId === 'text-diff'` vào `src/pages/[locale]/tools/[slug].astro`; tick `[x]`
    task #4 và #6 trong `ROADMAP.md`.
  - Dọn worktree: `git worktree remove` 2 worktree đã merge xong + xóa 2 branch
    `worktree-agent-*` tương ứng (an toàn vì đã nằm trong lịch sử `main`); force-remove
    worktree hỏng `agent-a494ece694ff1143f` + xóa ref hỏng của nó.
  - `npm run build` sạch, đọc `dist/en/tools/merge-pdf/index.html` và
    `dist/en/tools/text-diff-checker/index.html` xác nhận route mới sinh trang đúng.
  - `git push origin main` — đồng bộ lại với remote sau khi merge.
- Quyết định kỹ thuật quan trọng:
  - Không squash 2 commit gốc của agent — giữ nguyên lịch sử/tác giả (`Co-Authored-By`),
    chỉ thêm 1 commit riêng cho phần wiring + ROADMAP/PROGRESS.
  - Không thử "cứu" worktree hỏng thứ 3 — ref bị hỏng ở mức byte (NUL thuần), không phải
    lỗi git logic có thể phục hồi bằng lệnh git thông thường, và thư mục không có commit
    nào để mất.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Nguyên nhân gốc khiến `.git/index` và ref của worktree thứ 3 bị hỏng cùng lúc nhiều
    khả năng là tiến trình agent bị kill/crash đột ngột (mất điện, force-kill...) giữa
    lúc đang ghi file — nếu hiện tượng này lặp lại, cần điều tra tại sao tiến trình bị
    ngắt đột ngột thay vì chỉ sửa hậu quả như lần này.
  - Code của công cụ #4 và #6 do agent khác viết, phiên này CHƯA tự test tương tác thật
    trên trình duyệt (chọn PDF/gộp, dán văn bản/so sánh) — chỉ verify qua `npm run build`
    + đọc HTML tĩnh, giống tình trạng các tool trước.
- Task tiếp theo: Phase 1, công cụ #5 "Tách PDF (Split)" dùng `pdf-lib`.

### 2026-07-24 — Phase 1, công cụ #3: Xóa nền ảnh (AI, chạy local)
- Đã làm:
  - Cài `@imgly/background-removal` — build lỗi ngay lần đầu vì package này khai báo
    `onnxruntime-web` là **peerDependency** (không phải dependency thường), npm không tự
    cài kèm nên Vite/Rolldown báo lỗi không resolve được `onnxruntime-web/webgpu` (import
    động có điều kiện trong package, dùng khi bật tăng tốc WebGPU). Sửa bằng cách
    `npm install onnxruntime-web@1.21.0` (đúng version peer yêu cầu) — build sạch ngay sau
    đó.
  - Tạo `src/components/tools/BackgroundRemover.tsx` (React, `client:load`): chọn ảnh
    (kéo-thả/click), gọi `removeBackground(file, { output: { format: 'image/png' },
    progress })` — callback `progress` cập nhật % hiển thị trực tiếp trên từng ảnh đang xử
    lý. Hiển thị thumbnail ảnh gốc VÀ ảnh kết quả (nền trong suốt, có pattern caro làm nền
    thumbnail để nhìn rõ vùng trong suốt) — đây là tool đầu tiên có `<img>` thật, đã thêm
    `alt` mô tả đầy đủ theo đúng checklist SEO. Tải xuống luôn là PNG (bắt buộc vì cần kênh
    alpha).
  - Có 1 dòng `modelNotice` ngay dưới khung chọn ảnh, giải thích rõ: lần đầu bấm sẽ tải một
    model AI nhỏ (vài MB) về máy, sau đó chạy hoàn toàn offline — nhấn mạnh ảnh CỦA NGƯỜI
    DÙNG không bao giờ được tải lên, phân biệt rõ với việc tải model (dữ liệu công khai, đi
    một chiều xuống máy) để không gây hiểu lầm với banner "100% Privacy" toàn site.
  - Tạo `src/components/tools/BackgroundRemoverPage.astro`: đầy đủ checklist SEO như 2 tool
    trước (title/description/JSON-LD/4 đoạn nội dung ~300-350 từ mỗi ngôn ngữ/2 link liên
    quan cùng nhóm `image`).
  - **Refactor `src/i18n/i18next.ts`**: file này đang phình to dần (mỗi tool mới cộng thêm 8
    dòng import + phải sửa object `resources`). Đổi sang dùng
    `import.meta.glob('./locales/*/*.json', { eager: true })` của Vite để tự động quét và
    nạp MỌI file JSON trong `src/i18n/locales/{locale}/{namespace}.json` — từ giờ thêm tool
    mới chỉ cần tạo đúng 8 file JSON `tool-<id>.json`, KHÔNG cần đụng vào `i18next.ts`.
    Build lại xác nhận 2 tool cũ (`image-compress`, `image-convert`) vẫn hoạt động đúng sau
    refactor.
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh `toolId === 'background-remover'`.
  - `npm run build` sinh đủ 89 trang. Đọc `dist/en/tools/remove-background/index.html` xác
    nhận title/heading/link liên quan đúng. Chạy Lighthouse trên
    `http://localhost:4326/en/tools/remove-background/`: **Performance 99, Accessibility
    100, Best Practices 100, SEO 100**; kiểm tra thêm bằng `network-requests` audit của
    Lighthouse xác nhận tổng dung lượng tải khi MỞ TRANG chỉ ~147 KB — model AI (WASM
    runtime ~23 MB + trọng số model) KHÔNG được tải cho tới khi người dùng thật sự bấm nút
    "Xóa nền", đúng như UI đã thông báo.
- Quyết định kỹ thuật quan trọng:
  - Không tự viết Web Worker — `proxyToWorker` là option của `@imgly/background-removal`
    và mặc định `true` theo schema của package, nên thư viện đã tự lo việc này (giống lý do
    ở tool #1).
  - Không tự host model AI trong `public/` (dù có thể) — để mặc định tải từ CDN publicPath
    của package, vì đây là dữ liệu công khai tải VỀ máy người dùng, không phải dữ liệu
    người dùng gửi ĐI, nên không vi phạm nguyên tắc zero-server-cost/privacy của
    `CLAUDE.md`. Tự host sẽ chỉ làm phình kích thước repo mà không có lợi ích rõ ràng.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Cũng như 2 tool trước: chưa test tương tác thật (chọn ảnh, xem thanh tiến trình chạy,
    xem kết quả xóa nền thực tế) trên trình duyệt thật — Lighthouse + đọc HTML tĩnh không
    verify được việc model AI có thực sự chạy đúng.
  - `package.json` giờ có thêm `onnxruntime-web` như dependency trực tiếp (dù về bản chất
    là peer dep của `@imgly/background-removal`) — nếu sau này nâng cấp
    `@imgly/background-removal`, nhớ kiểm tra lại version `onnxruntime-web` yêu cầu có đổi
    không.
- Task tiếp theo: Phase 1, công cụ #4 "Gộp PDF (Merge)" dùng `pdf-lib`.

### 2026-07-24 — Phase 1, công cụ #2: Chuyển đổi định dạng ảnh
- Đã làm:
  - Tạo `src/components/tools/ImageFormatConverter.tsx` (React, `client:load`): chọn nhiều
    ảnh (kéo-thả hoặc click, tái dùng đúng pattern UI từ tool #1), dropdown chọn định dạng
    đích (WebP/JPEG/PNG), thanh trượt chất lượng (ẩn khi đích là PNG vì PNG không nén theo
    quality), nút Chuyển đổi xử lý tuần tự, hiển thị định dạng+dung lượng gốc/sau khi
    chuyển, nút tải xuống đổi đúng phần mở rộng file theo định dạng đích.
  - Dùng thẳng `createImageBitmap()` + `<canvas>` + `canvas.toBlob()` (HTML5 Canvas API
    thuần, đúng như chỉ định trong `ROADMAP.md`) — KHÔNG bọc trong Web Worker riêng, vì thao
    tác decode/draw/encode 1 ảnh qua canvas là tác vụ nhẹ, được trình duyệt tăng tốc phần
    cứng, khác với thuật toán nén lặp nhiều vòng của công cụ #1 (lý do tool #1 cần
    `browser-image-compression` với Worker nội bộ). Khi chuyển sang JPEG, tự động tô nền
    trắng trước khi vẽ ảnh vì JPEG không có kênh alpha (tránh vùng trong suốt bị đổi thành
    màu đen mặc định).
  - Tạo `src/components/tools/ImageConvertPage.astro`: đầy đủ checklist SEO giống tool #1
    (title/description riêng theo từ khóa, JSON-LD `WebApplication` giá 0 USD, nội dung
    hướng dẫn 4 đoạn/ngôn ngữ giải thích JPEG/PNG/WebP khác nhau thế nào, 2 link tới tool
    cùng nhóm `image`).
  - Namespace i18n riêng `tool-image-convert` (8 file JSON) đăng ký vào
    `src/i18n/i18next.ts` — đúng pattern namespace-per-tool đã đặt ra từ tool #1.
  - Sửa `src/pages/[locale]/tools/[slug].astro` thêm nhánh `toolId === 'image-convert'` →
    `<ImageConvertPage lang={locale} />`, giữ nguyên nhánh `image-compress` và "coming soon".
  - `npm run build` sinh đủ 89 trang không lỗi. Đọc `dist/en/tools/convert-image-format/
    index.html` và `dist/vi/tools/doi-dinh-dang-anh/index.html` xác nhận title/heading/link
    liên quan đúng; đếm từ script Node xác nhận đoạn nội dung EN 316 từ (trong khoảng
    300-500). Lighthouse trên `http://localhost:4325/en/tools/convert-image-format/`:
    **Performance 100, Accessibility 100, Best Practices 100, SEO 100**.
- Quyết định kỹ thuật quan trọng:
  - Không dùng Web Worker cho tool này (khác tool #1) — lý do nêu ở trên; đây là quyết định
    có chủ đích chứ không phải bỏ sót quy tắc Web Worker trong `CLAUDE.md`.
  - Không hỗ trợ chuyển đổi sang GIF/BMP/TIFF hay các định dạng khác — `ROADMAP.md` chỉ nêu
    "chuyển đổi định dạng ảnh" chung chung nhưng ngữ cảnh 10 công cụ đều xoay quanh
    JPEG/PNG/WebP (khớp tool #1), nên giới hạn 3 định dạng này cho nhất quán.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Cũng như tool #1: chưa test tương tác thật (chọn ảnh/kéo-thả/xem preview) trên trình
    duyệt thật, chỉ verify qua HTML tĩnh + Lighthouse.
- Task tiếp theo: Phase 1, công cụ #3 "Xóa nền ảnh (AI, chạy local)" dùng
  `@imgly/background-removal`.

### 2026-07-24 — Phase 1, công cụ #1: Nén ảnh (JPEG/PNG/WebP)
- Đã làm:
  - Cài `browser-image-compression` (thư viện chỉ định trong `ROADMAP.md`) — thư viện này
    tự chạy nén ảnh trong Web Worker nội bộ (`useWebWorker: true`), nên KHÔNG cần tự viết
    Worker riêng vẫn đáp ứng đúng quy tắc "xử lý file nặng luôn bọc trong Web Worker" của
    `CLAUDE.md`.
  - Tạo `src/components/tools/ImageCompressor.tsx` (React, hydrate qua `client:load`): chọn
    nhiều ảnh JPEG/PNG/WebP cùng lúc, thanh trượt chất lượng (10-100%, mặc định 80%), nút
    Nén xử lý tuần tự từng ảnh, hiển thị dung lượng gốc/sau nén/phần trăm giảm, nút tải
    xuống riêng từng ảnh (không dùng zip vì không có trong danh sách dependency được phép).
  - Tạo `src/components/tools/ImageCompressPage.astro`: bọc `Layout` + component React ở
    trên + đầy đủ checklist SEO cho trang công cụ theo `CLAUDE.md`:
    - Title/description riêng, tối ưu từ khóa, không trùng ngôn ngữ khác.
    - JSON-LD `schema.org/WebApplication`, `price: "0"`, `priceCurrency: "USD"`.
    - Đoạn nội dung hướng dẫn ~300-380 từ/ngôn ngữ (4 đoạn), viết riêng cho từng ngôn ngữ
      (không dịch máy thô, không AI-spin lặp cấu trúc).
    - Link nội bộ tới 2 tool cùng nhóm `image` (Chuyển đổi định dạng ảnh, Xóa nền ảnh).
    - Tự động có trong sitemap (route động đã có sẵn từ task URL structure).
  - Tạo namespace i18n riêng `tool-image-compress` (8 file JSON, xem ghi chú kiến trúc ở
    trên) thay vì nhồi vào `common.json`.
  - Sửa `src/pages/[locale]/tools/[slug].astro`: rẽ nhánh `toolId === 'image-compress'` →
    render `<ImageCompressPage lang={locale} />`; các `toolId` khác vẫn giữ nhánh "coming
    soon" cũ.
  - `npm run build` sinh đủ 89 trang không lỗi. Đọc trực tiếp `dist/en/tools/compress-image/
    index.html` và `dist/vi/tools/nen-anh/index.html` xác nhận: title/description/JSON-LD
    đúng, heading dịch đúng ngôn ngữ, input file compressor có mặt, link liên quan trỏ đúng
    2 tool cùng nhóm. Đếm số từ bằng script Node xác nhận đoạn nội dung EN (315 từ) và VI
    (381 từ) đều nằm trong khoảng 300-500 từ yêu cầu.
  - Chạy Lighthouse (Chrome headless local) trên `http://localhost:4322/en/tools/
    compress-image/` qua `npm run preview`: **Performance 100, Accessibility 100, Best
    Practices 100, SEO 100** — component React + nội dung mới không ảnh hưởng điểm số.
- Quyết định kỹ thuật quan trọng:
  - Không tự viết Web Worker riêng vì `browser-image-compression` đã tự quản lý Worker nội
    bộ — viết thêm Worker riêng sẽ là trùng lặp không cần thiết.
  - Không hỗ trợ tải xuống hàng loạt (zip) — không có trong danh sách dependency
    `ROADMAP.md` cho phép, mỗi ảnh có nút tải riêng là đủ cho v1.
  - Không thêm chuyển đổi định dạng (JPEG↔PNG↔WebP) vào tool này dù thư viện hỗ trợ — đó là
    phạm vi của tool #2 "Chuyển đổi định dạng ảnh" riêng biệt trong `ROADMAP.md`, giữ đúng
    ranh giới 1 tool = 1 chức năng.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Chưa test bằng mắt việc chọn ảnh thật + kéo thả trên trình duyệt thật (chỉ verify HTML
    tĩnh sinh ra đúng + Lighthouse chạy trên trang tĩnh, KHÔNG verify tương tác JS runtime
    thực tế của component React) — nên tự thử tay khi có dịp mở dev server.
  - (Đã tự phát hiện và sửa trong lúc làm: `dropHint` ghi "hoặc kéo thả ảnh vào đây" nhưng
    bản đầu chỉ có input click-to-select — đã thêm `onDrop`/`onDragOver` thật vào
    `ImageCompressor.tsx` kèm hiệu ứng viền khi kéo ảnh vào, để UI không nói sai tính năng.)
- Task tiếp theo: Phase 1, công cụ #2 "Chuyển đổi định dạng ảnh" dùng HTML5 Canvas API.

### 2026-07-24 — Kiểm tra Lighthouse trang chủ (hoàn tất Phase 0)
- Đã làm:
  - `npm run build` rồi `npm run preview --port 4321` để có server tĩnh thật (không phải
    dev server, sát với production hơn).
  - Chạy `npx lighthouse http://localhost:4321/en/ --only-categories=performance,
    accessibility,best-practices,seo` bằng Chrome headless cài sẵn trên máy
    (`C:\Program Files\Google\Chrome\Application\chrome.exe`), xuất báo cáo JSON+HTML vào
    thư mục scratchpad.
  - Kết quả: **Performance 99, Accessibility 100, Best Practices 100, SEO 100** — vượt mục
    tiêu ≥ 90 ở cả 4 mục.
  - Soát các audit chưa đạt điểm tuyệt đối (không kéo tổng điểm xuống dưới 90 nên không bắt
    buộc sửa ngay): `first-contentful-paint` (0.96), `largest-contentful-paint` (0.98),
    `unused-javascript` (do bundle React/`client:load` của nút Button demo), và cảnh báo
    render-blocking từ file CSS — ghi lại để lưu ý khi Phase 1 thêm nhiều JS/component thật,
    tránh điểm Performance tụt dần.
- Quyết định kỹ thuật quan trọng: không tối ưu thêm vì đã vượt ngưỡng yêu cầu của task; tối
  ưu sâu hơn (code-splitting, lazy-load Button demo...) để dành khi có tín hiệu thực tế điểm
  giảm ở Phase 1.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Component `<Button client:load>` ở trang chủ chỉ là demo verify Shadcn từ task đầu tiên
    — cân nhắc xoá hẳn khi bắt đầu Phase 1 vì không phục vụ mục đích thật nào nữa và là
    nguồn `unused-javascript` chính hiện tại.
  - Lighthouse mới chạy trên trang chủ (`/en/`) theo đúng phạm vi task — CHƯA chạy cho các
    trang `/tools/{slug}` (những trang đó sẽ có audit riêng theo checklist SEO trong
    `CLAUDE.md` khi làm từng tool ở Phase 1).
- **Phase 0 — Nền tảng & Hạ tầng: HOÀN TẤT toàn bộ 9 task.**
- Task tiếp theo: bắt đầu Phase 1 — công cụ #1 "Nén ảnh (JPEG/PNG/WebP)" với
  `browser-image-compression` (xem `ROADMAP.md`).

### 2026-07-24 — Setup CI/CD: deploy tự động lên Cloudflare khi push
- Đã làm:
  - Push repo local lên GitHub: tạo remote `origin` trỏ
    `https://github.com/DDM123455/devhub.git` (repo do người dùng tự tạo rỗng trên
    github.com), đổi tên nhánh `master` → `main` cho khớp mặc định GitHub, `git push -u
    origin main`.
  - Thêm `.node-version` (nội dung `22`) ở root — Cloudflare build system đọc file này để
    chọn đúng Node runtime (dự án yêu cầu Node ≥ 22.12.0, mặc định Cloudflare có thể dùng
    bản cũ hơn nếu không chỉ định).
  - Người dùng tự kết nối repo trong Cloudflare dashboard (Workers & Pages → Connect to
    Git) — build command `npm run build`, output directory `dist`. Cloudflare hiện thống
    nhất Pages vào nền tảng Workers nên domain cấp ra có dạng
    `<project>.workers.dev` (KHÔNG phải `*.pages.dev` như các dự án Cloudflare Pages cũ) —
    domain thật: `https://devhub.duongdangmanh01.workers.dev`.
  - Cập nhật `site` trong `astro.config.mjs` và dòng `Sitemap:` trong `public/robots.txt`
    từ placeholder `web-tool-hub.pages.dev` sang domain thật ở trên; `npm run build` lại,
    xác nhận `dist/sitemap-index.xml` và `dist/robots.txt` đều trỏ đúng domain mới.
- Quyết định kỹ thuật quan trọng:
  - Dùng Cloudflare Git integration (native, connect trực tiếp trong dashboard) thay vì
    GitHub Actions + `wrangler pages deploy` — đã hỏi và người dùng chọn hướng này vì đơn
    giản hơn (không cần tạo/API token + GitHub secrets, không cần workflow YAML trong
    repo). Do đó repo này KHÔNG có file `.github/workflows/*.yml` nào cho việc deploy —
    đúng như thiết kế, không phải thiếu sót.
- Vấn đề còn tồn đọng / cần lưu ý cho phiên sau:
  - Domain sản phẩm thực tế là subdomain `workers.dev` do Cloudflare cấp tự động — nếu sau
    này gắn custom domain riêng, phải cập nhật lại `site` (`astro.config.mjs`) và
    `Sitemap:` (`public/robots.txt`) thêm 1 lần nữa, y hệt bước vừa làm ở đây.
  - Chưa xác nhận bằng mắt là deploy trên Cloudflare thực sự thành công cho code MỚI NHẤT
    (chỉ xác nhận Worker URL tồn tại từ dashboard người dùng cung cấp) — nên tự mở
    `https://devhub.duongdangmanh01.workers.dev` kiểm tra sau khi Cloudflare build xong lần
    push gần nhất.
- Task tiếp theo: Kiểm tra Lighthouse trên trang chủ rỗng, mục tiêu ≥ 90 mọi mục (task cuối
  Phase 0 trong `ROADMAP.md`).

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

