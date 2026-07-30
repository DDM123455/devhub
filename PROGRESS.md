# PROGRESS.md — Nhật ký tiến độ dự án

> Đọc file này ĐẦU TIÊN khi bắt đầu một phiên mới. Ghi thêm entry mới lên ĐẦU mục
> "Nhật ký" (không xoá log cũ) sau khi hoàn thành một task, theo quy trình trong `CLAUDE.md`.
> File này được viết lại gọn (2026-07-27) vì bản cũ quá dài (~2500 dòng) gây khó mở trong
> một số editor — bản đầy đủ cũ vẫn còn nguyên trong lịch sử git (`git log -- PROGRESS.md`),
> không mất dữ liệu, chỉ không giữ trong file sống nữa.

## 🔵 Trạng thái hiện tại

- **Phase 0 — Nền tảng**: HOÀN TẤT 100%.
- **Phase 1 — 10 công cụ cốt lõi**: HOÀN TẤT 10/10.
- **Phase 1.5 — Feature Parity 10 công cụ cốt lõi**: HOÀN TẤT 10/10, trừ 1 mục con nhỏ
  chưa làm (nén PDF cho Gộp/Tách PDF — không phải lỗi chặn, chỉ chưa bắt đầu).
- **Phase 2 — SEO & đa ngôn ngữ**: HOÀN TẤT 6/8 mục. 2 mục còn treo (submit sitemap lên
  Google Search Console / Bing Webmaster Tools) bị chặn vì chưa có public domain thật + cần
  đăng nhập thủ công, không phải việc agent tự làm được.
- **Phase 3 — HOÀN TẤT 10/10 tool** (JWT Decoder, Base64 Encode/Decode, Regex Tester, SVG
  Optimizer, Color Picker & Palette Generator, CSV ↔ JSON Converter, JSON → Excel Converter,
  Markdown Viewer/Editor, Trim video ngắn, Chuyển đổi Audio MP3 ↔ WAV). Category `media`
  (thêm ở Phase 3 #9) nay có đủ 2 tool nên related-tools của cả Trim video ngắn và MP3 ↔ WAV
  Converter đã hiển thị lẫn nhau, không còn khoảng trống.
- **Phase 3.6 — Audit Remediation vòng 2**: HOÀN TẤT 7/7 mục (M1 song song hoá Image
  Compressor, M2 resize Image Compressor + Converter, M4 dot-style/gradient QR Generator
  qua `qr-code-styling`, M5 focus-visible pass toàn site, M6 bỏ ô "0 KB uploaded", M8 mở
  rộng bảng MIME Base64, M9 claim aud/iss/sub JWT Decoder; M7 đánh dấu N/A). Build sạch mọi
  mục nhưng KHÔNG có Puppeteer/browser trong môi trường phiên làm việc đó để test tương tác
  thật — đặc biệt mục M4 (đổi hẳn engine render QR) cần người dùng tự mở trang QR Generator
  kiểm tra bằng mắt trước khi coi là chắc chắn ổn định. Task tiếp theo: chọn 1 hạng mục ở
  Phase 4 (Kiếm tiền & PWA) hoặc Phase 5 (Launch & Growth) trong `ROADMAP.md`.
- **Quy ước i18n hiện hành (từ 2026-07-27, theo yêu cầu trực tiếp người dùng)**: các tool
  MỚI trong Phase 3 chỉ cần file dịch `en` + `vi`. Vẫn khai báo đủ slug/tên cho cả 20 ngôn
  ngữ trong `tools.ts` (để routing sẵn sàng), 18 ngôn ngữ còn lại người dùng tự bổ sung sau —
  đây là quyết định chủ động, KHÔNG phải bug fallback âm thầm.

## ⚙️ Ghi chú kỹ thuật quan trọng (áp dụng lâu dài, không phải log)

- **Node.js**: dự án cần Node 22.23.1 (Node hệ thống chỉ là 20.19.0, không đủ cho Astro 7).
  Bản Node đúng nằm sẵn ở `.tools/node-v22.23.1-win-x64/` trong repo — luôn `export PATH`
  trỏ vào đó trước khi chạy `npm`/`node` trong phiên terminal mới.
- **i18n auto-load**: `src/i18n/i18next.ts` dùng `import.meta.glob('./locales/*/*.json', {
  eager: true })` để tự nạp mọi file `{locale}/{namespace}.json` — thêm file JSON tool mới
  KHÔNG cần sửa `i18next.ts`, chỉ cần đặt đúng tên `tool-<id>.json`.
- **Fallback âm thầm khi thiếu file dịch**: nếu 1 locale thiếu file `tool-<id>.json`,
  i18next KHÔNG báo lỗi build — nó tự fallback sang tiếng Anh một cách âm thầm (gặp ở
  `zh-tw` Phase 2, và 7 ngôn ngữ của SVG Optimizer trước khi sửa). Muốn biết chắc 1 ngôn ngữ
  có bản dịch thật hay không, phải mở HTML build ra xem nội dung (`grep '<h1'` trên
  `dist/{locale}/tools/{slug}/index.html`), không chỉ tin vào "build không lỗi".
- **Hydration mismatch với state ngẫu nhiên (React + Astro `client:load`)**: Astro
  pre-render mọi component `client:load` một lần lúc build (chạy trong Node, không có
  `window`/`document`). Nếu `useState(() => ...)` khởi tạo bằng giá trị non-deterministic
  (`Math.random()`, `Date.now()`...), HTML server-render và lúc client hydrate sẽ lệch nhau
  → lỗi console "Minified React error #418" (hydration mismatch), phát hiện được qua
  `page.on('pageerror', ...)` khi test Puppeteer, KHÔNG thấy được chỉ bằng đọc code tĩnh.
  Cách sửa: khởi tạo state bằng giá trị cố định, random hóa thật trong `useEffect` chạy sau
  mount (gặp ở Color Picker, tool ngẫu nhiên hóa bảng màu ban đầu).
- **Thư viện vanilla-JS chạm global browser-only ở module scope** (`self`/`window`/
  `document` ngay khi import tĩnh) sẽ crash `npm run build` vì lý do tương tự ở trên (gặp ở
  `jsoneditor`, tool #8). Sửa bằng `await import(...)` động bên trong `useEffect` thay vì
  `import` tĩnh đầu file.
- **Kiến trúc trang tool**: `src/pages/[locale]/tools/[slug].astro` rẽ nhánh theo `toolId`
  (so sánh chuỗi) sang component riêng `src/components/tools/<Ten>Page.astro`. Tool mới =
  thêm 1 nhánh mới, KHÔNG sửa nhánh tool đã xong.
- **i18n namespace**: mỗi tool có file riêng `src/i18n/locales/{lang}/tool-<id>.json`, gọi
  bằng `getFixedT(lang, 'tool-<id>')`.
- **Thêm key i18n mới cho 1 tool đã có sẵn (từ 2026-07-29)**: mỗi `*Page.astro` build object
  `messages` bằng cách liệt kê **thủ công từng key** (`xxx: t('ui.xxx')`), không spread cả
  namespace `ui`. Thêm key mới vào file JSON locale KHÔNG đủ — phải thêm cả dòng tương ứng
  vào object `messages` trong `*Page.astro`, nếu không component React nhận `undefined` cho
  key đó và **render ra chuỗi rỗng, không lỗi build, không lỗi console** (interface
  `Messages` trong file `.tsx` chỉ khai kiểu, TypeScript không xác nhận `.astro` đã truyền đủ
  field vì `.astro` không typecheck cross-file field-by-field kiểu đó). Chỉ phát hiện được
  bằng test tương tác thật (Puppeteer đọc text nút/nhãn), không phải chỉ tin `npm run build`
  sạch — gặp bug thật kiểu này ở `ImageConvertPage.astro` khi thêm nút "Download All".
- **`@imgly/background-removal`** cần cài thêm `onnxruntime-web` thủ công (peerDependency,
  npm không tự cài) — nếu thiếu, build lỗi "Rolldown failed to resolve import
  onnxruntime-web/webgpu".
- **`xlsx` (SheetJS) trên npm bị bỏ qua, dùng `exceljs` thay thế** (JSON → Excel Converter,
  Phase 3 #7): bản `xlsx@0.18.5` duy nhất có trên npm registry mang 2 lỗ hổng chưa vá
  (Prototype Pollution + ReDoS, "no fix available" — SheetJS chỉ phát hành bản vá qua CDN
  riêng của họ, không qua npm). Đã hỏi người dùng, chọn `exceljs` — dù `npm audit` báo nhiều
  lỗ hổng hơn (12, qua chuỗi phụ thuộc `archiver`/`zip-stream` phía Node), đã xác minh trực
  tiếp bundle client (`dist/exceljs.min.js`, ~930KB minified) KHÔNG chứa `archiver`/`fs` —
  các gói lỗ hổng đó chỉ tồn tại trong `node_modules` lúc build, không lọt vào bundle gửi cho
  trình duyệt người dùng. Dùng `await import('exceljs')` động bên trong hàm xử lý (không
  import tĩnh) theo đúng pattern đã có với `jsoneditor`.
- **Deploy**: repo tại GitHub `DDM123455/devhub`, nhánh `main`. Deploy qua Cloudflare Git
  integration (Workers static assets) tại `https://devhub.duongdangmanh01.workers.dev`, tự
  deploy mỗi lần push `main`, không cần GitHub Actions/wrangler riêng trong repo.
- **`@ffmpeg/core` (ffmpeg.wasm) phải load bản `dist/esm/`, KHÔNG phải `dist/umd/`, khi dùng
  qua CDN** (Trim video ngắn, Phase 3 #9): file wasm engine ~30.7MB vượt giới hạn 25MiB/file
  của Cloudflare Pages cổ điển, nên KHÔNG tự host trong `public/` — tải qua jsDelivr CDN lúc
  runtime (`toBlobURL`, xem code `VideoTrim.tsx`). Bug thật đã gặp và sửa: `@ffmpeg/ffmpeg`
  tạo Web Worker kiểu `type: "module"`; khi worker không gọi được `importScripts()` (API chỉ
  tồn tại ở classic worker), nó fallback sang `import()` động trên chính URL core — nếu URL
  đó trỏ vào bản UMD (`dist/umd/ffmpeg-core.js`, không có `export default`), `import()` thất
  bại âm thầm và ném lỗi chung "failed to import ffmpeg-core.js" không có stack trace rõ
  ràng. Phải trỏ `coreURL`/`wasmURL` vào `dist/esm/` mới đúng. Ngoài ra: KHÔNG dùng tham số
  `progress` của `toBlobURL()` (gọi `downloadWithProgress` nội bộ) — nếu CDN nén gzip/br file
  `.js`, header `Content-Length` (kích thước nén) sẽ lệch với số byte thực nhận sau giải nén,
  khiến thư viện cố đọc lại một `Response` đã đọc hết và crash "body stream already read";
  dùng `toBlobURL(url, mimeType)` không kèm progress để tránh nhánh code lỗi này (mất progress
  % khi tải engine, chỉ còn hiển thị trạng thái "đang tải" chung chung).
- **Chuyển đổi Audio MP3 ↔ WAV không dùng ffmpeg.wasm** (Phase 3 #10, khác với Trim video ngắn):
  giải mã MP3/WAV bằng `AudioContext.decodeAudioData` có sẵn của trình duyệt (native, không
  cần thư viện), mã hóa WAV bằng cách tự viết RIFF header (44 byte) + PCM 16-bit, mã hóa MP3
  bằng `@breezystack/lamejs` (fork `lamejs` gốc còn được cập nhật, có kèm type Typescript).
  Không cần tải engine ngoài qua CDN như Trim video ngắn — toàn bộ tự host trong bundle, nhẹ
  hơn nhiều (không có giới hạn 25MiB của Cloudflare). Phần mã hóa nặng (vòng lặp encode MP3)
  chạy trong Web Worker riêng (`audioEncodeWorker.ts`, dùng `new Worker(new URL(...), {type:
  'module'})` — cùng pattern Vite đã dùng cho worker của `@ffmpeg/ffmpeg`) để không đứng UI
  khi xử lý file dài, đúng yêu cầu Web Worker cho xử lý nặng trong `CLAUDE.md`. Lưu ý:
  `AudioContext`/`decodeAudioData` chỉ chạy được ở main thread (không có trong Worker), nên
  bước giải mã luôn ở component chính, chỉ phần đóng gói byte (WAV) và mã hóa (MP3) chuyển
  cho worker qua `postMessage` với `Float32Array` transferable.
- **URL routing**: `/{lang}/...` cho MỌI ngôn ngữ kể cả `en` (`prefixDefaultLocale: true`).
  `src/pages/index.astro` phải luôn tồn tại (dù rỗng) để Astro sinh redirect `/` → `/en/`,
  xoá file này sẽ lỗi `MissingIndexForInternationalizationError`.
- **Layout dùng chung**: `Header`/`Sidebar`/`Footer` ở `src/components/layout/`, tự nhận
  `lang` + tự gọi `getFixedT` — mọi trang bọc trong `Layout.astro` tự động có đủ 3 phần,
  không cần import lại thủ công.
- **Test Puppeteer cho thao tác kéo-thả bằng `page.mouse`/`elementHandle.boundingBox()`
  (từ 2026-07-29)**: viewport mặc định của Puppeteer chỉ 800×600. Nếu phần tử cần kéo nằm ở
  vị trí y > 600px trên trang dài (rất dễ gặp với tool có nhiều control phía trên), `page.
  mouse.move/down/up` gửi tọa độ hợp lệ về mặt API nhưng **không trúng gì trên màn hình
  thật** — không báo lỗi, chỉ đơn giản là không có sự kiện `pointerdown`/`pointermove` nào
  được kích hoạt, khiến test kết luận nhầm "tính năng kéo bị hỏng" dù code đúng. Luôn
  `page.setViewport({ width: 1280, height: 1600 })` (hoặc đủ cao hơn chiều cao trang) trước
  khi lấy `boundingBox()` để mô phỏng kéo-thả bằng `page.mouse`.
- **Test tương tác**: dùng Puppeteer (không phải dependency chính thức của repo, chạy qua
  bản cài sẵn trong npx cache của máy). Luôn `npm run build` + `npm run preview` rồi test
  trên bundle production thật, không test trên dev server.
- **Test Puppeteer cho tính năng copy-to-clipboard (từ 2026-07-29)**: môi trường headless
  Chrome ở máy này từ chối `navigator.clipboard.writeText` thật với lỗi "Write permission
  denied", `navigator.permissions.query({name:'clipboard-write'})` báo `denied` dù đã gọi
  `browserContext.overridePermissions(origin, ['clipboard-read','clipboard-write'])` — giới
  hạn sandbox của môi trường, không phải bug ở code. Muốn test phần logic "hiện chữ Copied
  rồi tự ẩn sau timeout" của bất kỳ nút copy nào, phải stub API trước khi trang load:
  `page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'clipboard', { value: {
  writeText: () => Promise.resolve() }, configurable: true }))`, rồi mới `page.goto(...)`.
  Ngoài ra bấm nút phải dùng `elementHandle.click()` thật của Puppeteer (trusted mouse event
  qua CDP), không phải `btn.click()` gọi trong `page.evaluate()` (synthetic, không có user
  activation) — nếu không dù có stub clipboard cũng không chắc phản ánh đúng hành vi thật.

## Nhật ký (mới nhất ở trên cùng, rút gọn)

- **2026-07-30** — Phase 3.6b (nhóm 🔴 Cao, mục 1/3) — mục "Markdown Editor: syntax
  highlighting thật" (vs StackEdit/Dillinger): thay `<textarea>` thuần bằng **CodeMirror 6**
  — thêm 2 dependency mới `codemirror` (meta-package bundle sẵn `basicSetup`: line number,
  undo history, bracket matching, VÀ `syntaxHighlighting(defaultHighlightStyle)` — xác nhận
  qua đọc thẳng source package, không cần thêm gói riêng cho màu cú pháp) và
  `@codemirror/lang-markdown` (ngôn ngữ Markdown cho CodeMirror, tự kéo theo
  `@codemirror/state`/`@codemirror/view`/`@codemirror/language` làm dependency bắc cầu —
  không thêm vulnerability mới, xác nhận qua `npm audit` trước/sau giống hệt nhau).
  **Theme**: viết `EditorView.theme()` tham chiếu thẳng CSS custom property có sẵn của site
  (`var(--background)`, `var(--foreground)`...) thay vì dùng package theme đóng gói riêng —
  tự động khớp light/dark mode hiện tại của site mà không cần logic JS phát hiện dark mode.
  **Kiến trúc mới (mệnh lệnh thay vì khai báo)**: EditorView không phải React component, nên
  `applyEdit()` (dùng lại NGUYÊN VẸN các hàm transform thuần `wrapInline`/`linePrefix`/
  `headingTransform`/... không đổi 1 dòng nào, vì chúng chỉ thao tác trên string+offset) giờ
  đọc `view.state.selection`/`view.state.doc` và dispatch transaction thay vì
  `textarea.selectionStart`/`.setSelectionRange`. Ctrl+B/Ctrl+I chuyển vào
  `EditorView.domEventHandlers` bên trong extension thay vì `onKeyDown` React. **Bug tự phát
  hiện lúc code**: container div của CodeMirror trước đây định conditionally render theo
  `viewMode !== 'preview'` như cũ — nếu làm vậy, chuyển sang preview-only rồi quay lại sẽ gỡ
  DOM của CodeMirror mà không tái tạo lại (effect mount chỉ chạy 1 lần) — sửa bằng cách LUÔN
  render div này, chỉ ẩn qua class `hidden` khi ở preview-only (cùng pattern đã dùng ở
  QrCodeGenerator cho vấn đề tương tự). Đồng bộ nội dung 2 chiều qua 1 effect so sánh
  `view.state.doc.toString()` với `content` state — chỉ dispatch khi khác nhau (tránh vòng
  lặp vô hạn khi gõ). Xác nhận **an toàn cho Astro SSR** (khác `jsoneditor`/`qr-code-styling`
  trước đó): CodeMirror 6 chỉ chạm DOM lúc gọi `new EditorView()` bên trong `useEffect`
  (không chạy lúc SSR), import tĩnh ở đầu file KHÔNG lỗi build — build sạch xác nhận điều
  này (421 trang, không crash "document is not defined"). Autosave/localStorage, drag-drop
  upload file, load sample, scroll-sync 2 chiều với preview, đếm từ/ký tự — giữ nguyên logic
  cũ, chỉ đổi cách đọc/ghi nội dung. **Giới hạn quan trọng**: đây là thay đổi kiến trúc lớn
  nhất trong Phase 3.6b, KHÔNG có Puppeteer/trình duyệt thật trong môi trường phiên này để
  test tương tác (gõ chữ, bấm toolbar, kéo-thả file, cuộn đồng bộ) — chỉ verify được qua
  build sạch + đọc lại code cẩn thận. Người dùng nên tự mở trang Markdown Editor kiểm tra
  bằng tay trước khi coi mục này chắc chắn ổn định.
- **2026-07-30** — Phase 3.6b (hoàn tất nhóm A 7/7) — mục "Image Compressor: chọn định dạng
  đích ngay lúc nén" (vs TinyPNG/Squoosh): `browser-image-compression` đã có sẵn tham số
  `fileType` (xác nhận qua đọc thẳng `.d.ts` của thư viện) — chỉ cần truyền
  `fileType: targetFormat === 'original' ? undefined : targetFormat`, không cần code riêng.
  Thêm select "Convert to": giữ nguyên định dạng gốc / WebP / JPEG / PNG / AVIF. AVIF cần xử
  lý thêm vì thư viện fallback ÂM THẦM (không lỗi) khi `canvas.toBlob` của trình duyệt không
  hỗ trợ AVIF thật — phát hiện bằng cách so `compressedBlob.type` với định dạng đã yêu cầu,
  đúng pattern `AvifUnsupportedError` đã dùng ở Image Format Converter. Tên file tải về
  (đơn lẻ + zip) tự đổi đuôi theo định dạng đích thay vì giữ nguyên đuôi gốc gây sai lệch với
  nội dung thật bên trong. Build sạch (421 trang), xác nhận label mới trong
  `dist/en/tools/compress-image/index.html`. **Hoàn tất toàn bộ 7/7 mục nhóm A** đã thống
  nhất với người dùng — chuyển sang nhóm B (Markdown CodeMirror, Audio thêm định dạng, Video
  multi-clip/crop/watermark).
- **2026-07-30** — Phase 3.6b — mục "Chuyển đổi Audio: resample/normalize/fade" (vs
  CloudConvert) — **cộng 1 bug thật tự phát hiện lúc code**: `channelDownmixWarning` (cảnh
  báo Critical C2 tưởng đã sửa ở Phase 3.5a) hoá ra chưa từng được nối vào object `messages`
  trong `AudioConverterPage.astro` — `messages.channelDownmixWarning` là `undefined` trong
  production, và vì code gọi `.replace()` trực tiếp lên nó (không chỉ render rỗng như các
  bug tương tự trước đây), **bất kỳ file audio nào có >2 kênh sẽ crash thẳng component**
  (TypeError "Cannot read properties of undefined") thay vì hiện cảnh báo — đã sửa cùng lúc.
  **3 tính năng mới, cả 3 dùng thuần Web Audio API có sẵn, không cần dependency mới**:
  Resample qua `OfflineAudioContext` (render buffer gốc qua context có sample rate khác,
  trình duyệt tự resample nội bộ — không cần thư viện DSP riêng); Normalize quét peak toàn
  bộ kênh rồi nhân gain để đạt -1dBFS (0.891, ngưỡng chuẩn hầu hết tool audio dùng mặc định);
  Fade in/out tuyến tính theo số giây tại 2 đầu tín hiệu. Cả 3 chạy trên main thread ngay sau
  decode (trước khi gửi cho Worker encode) vì là phép toán rẻ theo từng sample. Verify
  `normalizeChannels()`/`applyFade()` bằng script Node độc lập: normalize đưa đúng peak lên
  0.891 chính xác tuyệt đối; fade tạo đúng đường tuyến tính tăng/giảm ở 2 đầu tín hiệu test
  10 sample. Build sạch (421 trang), xác nhận cả bug fix lẫn label mới trong
  `dist/en/tools/mp3-wav-converter/index.html`. **Nhóm A còn 1 mục cuối** (Image Compressor:
  chọn định dạng đích lúc nén) trước khi sang nhóm B (Markdown CodeMirror, Audio thêm định
  dạng, Video multi-clip/crop/watermark — cần thêm dependency/viết lại lớn).
- **2026-07-30** — Phase 3.6b — mục "Tách PDF: checkbox chọn trang + preview từng file +
  kéo-thả sắp xếp" (vs iLovePDF/Smallpdf, 3 mục cùng lúc vì cùng 1 file): **Kéo-thả** — copy
  đúng pattern `dragPageId`/`handleDrop` đã có sẵn ở Gộp PDF, áp dụng cho danh sách trang
  nguồn — quan trọng vì range ("1-3") và "mỗi N trang" đều tính theo VỊ TRÍ hiện tại trên màn
  hình, nên kéo sắp xếp lại trước sẽ đổi luôn ý nghĩa của range. **Checkbox đa lựa chọn** —
  thêm `SplitMode = 'checkbox'` thứ 3 (cạnh ranges/everyN), tách logic chung thành
  `SplitGroup[] = {entries, label}[]` để cả 3 chế độ dùng chung 1 vòng lặp tạo file thay vì
  code riêng — chế độ checkbox lọc `pages` theo `selectedPageIds` giữ ĐÚNG thứ tự tài liệu
  (không phải thứ tự click chọn — verify bằng script Node: chọn theo thứ tự c,a,e vẫn trả về
  a,c,e). **Preview từng file** — tái dùng trực tiếp `dataUrl` thumbnail đã render sẵn cho
  từng trang nguồn (không cần rasterize lại file kết quả), gắn vào `ResultFile.
  previewThumbnails` hiển thị dải ảnh nhỏ dưới mỗi file trong danh sách kết quả. Cũng phát
  hiện gap tương tự Gộp PDF: trước đây danh sách trang không có gì cho biết trang nào đã
  chọn ngoài việc gõ range bằng tay. Build sạch (421 trang), xác nhận label mới trong
  `dist/en/tools/split-pdf/index.html`.
- **2026-07-30** — Phase 3.6b (bắt đầu nhóm A đã thống nhất với người dùng — không cần
  dependency mới) — mục "Gộp PDF: preview file gộp + xử lý lỗi PDF có mật khẩu" (vs
  iLovePDF/Smallpdf): **Lỗi mật khẩu** — phát hiện qua `err.name === 'PasswordException'`
  (class lỗi riêng của `pdfjs-dist`, xác nhận qua đọc thẳng source `pdf.mjs`:
  `BaseException` set `this.name` bằng chuỗi tên class), hiện thông báo riêng biệt thay vì
  lỗi chung chung — đồng thời phát hiện ra **gap ẩn**: trước giờ file load lỗi (mật khẩu hay
  hỏng) không hề hiển thị GÌ cho người dùng (chỉ âm thầm không đóng góp trang nào), nay thêm
  hẳn danh sách lỗi theo từng file. **Preview merged file** — sau khi merge xong, gọi lại
  `renderPdfThumbnails()` (hàm dùng chung `@/lib/pdf-thumbnails.ts`, vốn đã dùng để tạo
  thumbnail từng trang lúc chọn file) trên CHÍNH bytes vừa merge ra (không phải trang gốc) —
  đảm bảo preview phản ánh đúng thứ tự/xoay/xóa trang thật sự đã áp dụng, không chỉ tin logic
  đã đúng. Mọi thao tác đổi trang (xóa/xoay/di chuyển/kéo-thả) đều xóa preview cũ (6 điểm reset
  đồng bộ với `mergedBlob`). Build sạch (421 trang), xác nhận label mới trong
  `dist/en/tools/merge-pdf/index.html`.
- **2026-07-30** — Phase 3.6b — mục "So sánh văn bản: link chia sẻ kết quả" (vs
  Diffchecker.com): dùng **Compression Streams API** có sẵn của trình duyệt
  (`CompressionStream`/`DecompressionStream`, hỗ trợ mọi browser evergreen, không cần thư
  viện) để gzip mỗi văn bản trước khi base64-encode vào URL — khác JWT Decoder/Regex Tester
  (dùng query param `?token=`/`?pattern=`), ở đây dùng **URL hash** (`#...`) vì 2 văn bản so
  sánh có thể rất dài: hash không giới hạn độ dài thực tế nghiêm ngặt như query string, và
  không bao giờ gửi lên server (kể cả server của chính site) nên an toàn để chứa nội dung
  nhạy cảm hơn. Đọc lại lúc mount qua `window.location.hash`, lỗi giải nén (link hỏng/bị cắt
  bởi ứng dụng chat nào đó) chỉ âm thầm bỏ qua thay vì báo lỗi cho 1 link người dùng không
  tự tạo. Verify bằng script Node độc lập: văn bản 2624 ký tự (lặp lại + ký tự Unicode/emoji)
  nén xuống còn 119 ký tự base64 URL-safe, giải nén khớp lại chính xác 100%. Build sạch (421
  trang), xác nhận label mới trong `dist/en/tools/text-diff-checker/index.html`.
- **2026-07-30** — Phase 3.6b — mục "QR Generator: frame/CTA text dưới QR" (vs
  qr-code-generator.com — tính năng "premium" cuối cùng còn thiếu sau khi đã làm dot-style/
  gradient ở 3.6a): `qr-code-styling` không có sẵn tùy chọn khung viền/CTA text, nên tự viết
  `composeFramedPng()`: lấy PNG thô của QR qua `getRawData('png')`, vẽ lên canvas lớn hơn có
  viền đen + nền trắng + dòng chữ CTA bên dưới (dùng `ctx.font`/`fillText` canvas gốc, không
  cần thư viện). **Chỉ áp dụng cho PNG**, không áp dụng SVG (chèn text đọc được vào SVG cần
  xử lý font-metrics thật, ngoài phạm vi hợp lý cho tính năng phụ này — nút Download SVG tự
  disable khi bật khung viền, kèm ghi chú rõ trong UI). Áp dụng nhất quán cho cả download đơn
  lẻ lẫn batch (mỗi QR trong zip đều có khung nếu bật). Live preview KHÔNG hiển thị khung
  (giữ nguyên kiến trúc `.append()` hiện có của qr-code-styling, tránh phải viết lại toàn bộ
  cách render preview) — có ghi chú rõ "khung chỉ xuất hiện trong PNG tải về". Build sạch
  (421 trang), xác nhận label mới trong `dist/en/tools/qr-code-generator/index.html`.
- **2026-07-30** — Phase 3.6b — mục "Color Picker: trích xuất palette từ ảnh" (vs Coolors —
  audit gọi đây là tính năng chủ lực "Image to Palette" của Coolors): tự viết thuật toán
  **median-cut quantization** (không cần dependency mới) — cùng họ thuật toán dùng để tạo
  bảng màu GIF 256 màu, áp dụng ở đây để chọn ra 5 màu chủ đạo: liên tục tách nhóm pixel làm
  đôi theo kênh R/G/B có độ trải rộng lớn nhất, tới khi đủ 5 nhóm, rồi lấy trung bình mỗi
  nhóm làm 1 màu. Ảnh được downscale về tối đa 150px trước khi lấy mẫu pixel (không cần độ
  chính xác từng pixel cho việc trích màu, tránh ảnh 12MP làm chậm đáng kể). Kết quả ghi
  thẳng vào `palette` state hiện có nên mọi tính năng khác (lock, save, export CSS/JSON/SCSS/
  Tailwind/ASE) tự động hoạt động luôn không cần sửa gì thêm. Verify bằng script Node độc
  lập: ảnh giả gồm 4 nhóm màu đã biết trước (đỏ/xanh lá/xanh dương/trắng, 100 pixel mỗi
  nhóm) → quantize ra đúng cả 4 màu chính xác tuyệt đối. Build sạch (421 trang), xác nhận
  label mới trong `dist/en/tools/color-picker/index.html`.
- **2026-07-30** — Phase 3.6b — mục "Xóa nền ảnh: crop/resize" (vs remove.bg): thay vì cọ
  tinh chỉnh mask thủ công (audit tự ghi nhận đây là tính năng "Pro" phức tạp, để lại phiên
  sau nếu cần), triển khai 2 phần khả thi ngay: **Trim viền trong suốt** —
  `computeOpaqueBoundingBox()` quét alpha channel tìm hình chữ nhật nhỏ nhất chứa toàn bộ
  pixel không trong suốt, tự crop theo đó — auto-crop không cần UI kéo-thả tay, chỉ hiện khi
  `backgroundMode === 'transparent'` (crop mất ý nghĩa khi đã tô màu/ảnh nền). **Resize** —
  cùng pattern checkbox + slider maxDimension (320-4096px) đã dùng ở Image Compressor/
  Converter, áp dụng sau bước trim. Cả 2 tích hợp vào `buildDisplayBlob()` hiện có (đã chạy
  lại mỗi khi đổi nền/edge-softness, giờ chạy lại luôn khi đổi 2 tùy chọn mới). Verify
  `computeOpaqueBoundingBox()` bằng script Node độc lập: ảnh giả 10×10 với vùng vuông opaque
  đã biết tọa độ → trả đúng bounding box; ảnh toàn trong suốt → trả `null` đúng (không crash/
  crop sai). Build sạch (421 trang), xác nhận label mới trong
  `dist/en/tools/remove-background/index.html`.
- **2026-07-30** — Phase 3.6b — mục "CSV↔JSON Converter: batch nhiều file" (vs CloudConvert/
  Convertio): tách logic convert ra hàm thuần `convertOne()` (dùng chung cho cả live preview
  qua `useMemo` lẫn xử lý batch, tránh trùng lặp code). `handleFiles` (đổi tên từ `handleFile`
  số ít) giờ nhận `multiple`: nếu chỉ 1 file → giữ nguyên hành vi cũ (load vào editor để xem/
  sửa); nếu >1 file → convert độc lập từng file với cùng cấu hình delimiter/header/nested/
  pretty, load file ĐẦU TIÊN vào editor chính để vẫn xem/chỉnh được (tool này về bản chất là
  1 editor văn bản, không phải danh sách file như Image Compressor, nên batch mode chỉ cộng
  thêm chứ không thay thế UX chính), các file còn lại gộp vào 1 nút "Download All (.zip)"
  (JSZip, dynamic import theo đúng convention). File nào lỗi parse thì báo riêng, không chặn
  tải các file hợp lệ khác. Build sạch (421 trang), xác nhận label mới trong
  `dist/en/tools/csv-json-converter/index.html`.
- **2026-07-30** — Phase 3.6b (bắt đầu nhóm 🔴 Cao — cần quyết định kiến trúc/dependency cho
  đa số mục còn lại) — mục "Image Compressor: chế độ target size" (vs TinyPNG/Squoosh): thêm
  radio chọn "By quality" (giữ nguyên slider % cũ) vs "By target size" (slider KB, 10-10000,
  mặc định 200) — không cần code thuật toán nén-tới-X-KB riêng, `browser-image-compression`
  đã có sẵn tham số `maxSizeMB` tự lặp giảm chất lượng tới khi dưới ngưỡng (trước đây gọi
  cố định `maxSizeMB: 10` chỉ như ngưỡng an toàn, chưa từng expose cho người dùng chọn).
  Build sạch (421 trang), xác nhận label mới trong `dist/en/tools/compress-image/index.html`.
  **Chưa làm** (cùng nhóm nhưng khác hẳn phạm vi — cần viết thêm encoder canvas riêng như
  Image Converter đã có, dễ trùng lặp code nếu làm vội): "chọn định dạng đích ngay lúc nén
  (WebP/AVIF/MozJPEG)" của Image Compressor — để lại phiên sau.
- **2026-07-30** — Phase 3.6b (hoàn tất nhóm 🟠 Trung bình 5/5) — mục "Color Picker: export
  ASE/SCSS/Tailwind config" (vs Coolors/Adobe Color): thêm 2 nút copy đơn giản (SCSS: `$color-
  N: #hex;`, Tailwind: object `colors: { 'palette-N': '#hex' }`) cùng pattern với nút CSS/JSON
  copy có sẵn. Riêng **ASE** (Adobe Swatch Exchange) — định dạng nhị phân không có spec chính
  thức từ Adobe (cộng đồng design tool tự reverse-engineer từ nhiều năm trước, nhưng
  Illustrator/Photoshop/Coolors đều đọc được) — tự viết `buildAseBlob()` từ đầu: header 12
  byte (chữ ký "ASEF" + version + số block), mỗi màu là 1 block biến độ dài (tên dạng UTF-16BE
  kết thúc bằng null, color model "RGB ", 3 số thực big-endian 0-1 cho RGB, color type).
  Verify bằng script Node độc lập: tự dựng file .ase rồi tự viết luôn 1 parser ASE tối giản để
  đọc ngược lại — xác nhận signature/version/block count/tên/model đều đúng, và giá trị RGB
  round-trip khớp 100% với hex gốc (test 3 màu). Build sạch (421 trang), xác nhận label mới
  trong `dist/en/tools/color-picker/index.html`. **Hoàn tất toàn bộ nhóm Trung bình (5/5)**
  của Phase 3.6b: Image Converter, Background Remover, JSON Formatter, QR Generator, Color
  Picker.
- **2026-07-30** — Phase 3.6b — mục "QR Generator: batch tạo nhiều QR cùng lúc" (vs
  qr-code-generator.com): thêm checkbox "Batch mode" (chỉ hiện với content type URL/Text —
  các loại còn lại như WiFi/vCard/Email/SMS có nhiều trường riêng, không hợp để nhập hàng
  loạt theo dòng) thay input đơn bằng textarea nhiều dòng, mỗi dòng = 1 mã QR độc lập. Nút
  "Generate & Download All (.zip)" dùng `qr-code-styling` dựng từng instance riêng (tái dùng
  `buildQrOptions()` đã có, mở rộng nhận thêm `data` override thay vì luôn lấy `renderValue`
  của form đơn) + `getRawData('png')`, gộp vào JSZip (dynamic import, cùng convention toàn
  site). Tên file tự sinh từ nội dung dòng (bỏ `http(s)://`, thay ký tự đặc biệt bằng `-`),
  dòng trùng tên tự thêm hậu tố số thứ tự tránh ghi đè trong zip. Dòng nào vượt sức chứa QR ở
  mức sửa lỗi hiện tại thì bỏ qua (không làm hỏng cả batch). Live preview đơn tự ẩn khi bật
  batch mode (effect cập nhật QR đơn có early-return khi `effectiveBatchMode`). Verify bằng
  script Node độc lập: dòng trống/trùng lặp/có ký tự đặc biệt đều xử lý đúng (lọc dòng rỗng,
  hậu tố dedup khi trùng tên). Build sạch (421 trang), xác nhận label mới trong
  `dist/en/tools/qr-code-generator/index.html`.
- **2026-07-30** — Phase 3.6b — mục "JSON Formatter: badge Validate + so sánh 2 JSON" (vs
  JSONFormatter.org/JSONLint): **Badge trạng thái** — `jsoneditor` đã validate liên tục lúc
  gõ (qua `onValidationError`) nhưng trước đây CHỈ hiện banner lỗi khi có lỗi, không có tín
  hiệu tích cực khi JSON hợp lệ — thêm `validationStatus` set trong cùng callback
  (`errors.length === 0` → 'valid'), hiển thị badge "✓ Valid JSON"/"✗ Invalid JSON" luôn hiện
  diện thay vì chỉ xuất hiện khi lỗi. Không thêm nút "Validate" thủ công riêng vì validate đã
  chạy liên tục — badge giải quyết đúng vấn đề audit nêu ("ẩn trong hành vi editor") mà không
  hạ cấp UX xuống mức phải bấm nút. **So sánh 2 JSON** — thêm `diffJson()` tự viết (không
  cần dependency mới): duyệt song song 2 cây JSON, báo từng key/index bị thêm/xóa/đổi giá
  trị (so sánh theo chỉ số, không phát hiện reorder kiểu diff text — đúng cách mọi tool "so
  sánh 2 JSON" thật sự hiển thị). UI: nút "Compare JSON" mở rộng 1 panel dán JSON thứ 2 +
  nút Compare, hiển thị danh sách khác biệt màu-mã-hoá (xanh=added, đỏ=removed, vàng=changed)
  hoặc thông báo "identical". Verify `diffJson()` bằng script Node độc lập với object lồng
  nhau có đủ cả 3 loại thay đổi — khớp đúng kỳ vọng. Build sạch (421 trang), xác nhận label
  mới trong `dist/en/tools/json-formatter/index.html`. **Chưa làm**: expose JSON Schema
  validation (mục audit khác trong cùng nhóm) — cần thêm UI nhập schema + gọi
  `editor.setSchema()`, để lại cho phiên sau vì phạm vi khác hẳn (không phải chỉ hiển thị
  trạng thái, mà cần toàn bộ luồng nhập/validate schema mới).
- **2026-07-30** — Phase 3.6b — mục "Xóa nền ảnh: thanh tiến trình tổng + Download All .zip"
  (vs remove.bg): **Tiến trình tổng** — `overallPercent` gộp "số ảnh đã xong" +
  "% của ảnh đang xử lý / 100", chia cho tổng số ảnh, hiển thị "Processing image X of Y —
  Z% overall" khi batch >1 ảnh — trước đó chỉ thấy % của riêng ảnh hiện tại, không biết còn
  bao lâu cho cả batch. **Download All** — tái dùng đúng pattern JSZip đã có ở Image
  Compressor/Converter, ưu tiên `item.displayUrl` (bản đã áp dụng nền + edge softness người
  dùng chọn) qua `fetch(blobUrl).then(r => r.blob())` thay vì `resultBlob` gốc, nhất quán với
  hành vi nút Download từng ảnh đã có. KHÔNG song song hoá việc xử lý AI (khác Image
  Compressor/Converter) — mô hình AI nặng, chạy đồng thời nhiều ảnh dễ tranh chấp bộ nhớ/GPU,
  audit cũng không yêu cầu mục này cho tool riêng biệt. Verify công thức overallPercent bằng
  script Node độc lập (3 case: đang giữa batch, chưa bắt đầu, vừa xong ảnh cuối). Build sạch
  (421 trang), xác nhận label mới trong `dist/en/tools/remove-background/index.html`.
- **2026-07-30** — Phase 3.6b (bắt đầu nhóm 🟠 Trung bình) — mục "Image Converter: xử lý
  song song + ICO đa kích thước" (vs Convertio/CloudConvert/iLoveIMG): **Song song hoá** —
  tách `convertOne()`, `handleConvert()` đổi sang cùng mô hình worker-pool `CONCURRENCY = 3`
  đã dùng ở Image Compressor (M1) — tool này trước đó CHƯA được sửa vì M1 chỉ giới hạn phạm
  vi ở Image Compressor. **ICO đa kích thước** — `encodeIcoMultiSize()` thay `encodeIco()` cũ
  (chỉ xuất 1 size 256px): vẽ bitmap gốc ra 5 canvas kích thước chuẩn
  (16/32/48/128/256px), mỗi canvas encode PNG riêng, rồi tự dựng ICO container (header 6
  byte + bảng thư mục 16 byte/entry + nối các PNG) theo đúng spec — giống favicon/icon
  Windows thật thay vì chỉ 1 độ phân giải. `convertImage()` giờ branch sớm cho ICO (bỏ qua
  hẳn tùy chọn resize của người dùng vì không áp dụng — ICO tự định nghĩa bộ size riêng).
  Verify cấu trúc binary ICO bằng script Node độc lập: dựng file giả với offset/kích thước
  đã biết, tự parse lại header + 5 directory entry, xác nhận mọi offset/bytesInRes khớp
  đúng 100% (kể cả quy ước byte 0 = 256 của định dạng ICO). Build sạch (421 trang). Sửa
  `formatsNote` + `article.p4` (en+vi) không còn nhắc "256×256 duy nhất" mà mô tả đúng 5
  size mới.
- **2026-07-30** — Phase 3.6b — mục "Color Picker: lưu palette yêu thích" (vs Coolors/Adobe
  Color) — **hoàn tất nhóm 🟢 Thấp (9/9 mục quick-win)**: thêm nút "Save palette" cạnh
  "Generate", lưu 5 màu hiện tại (dạng hex) vào `localStorage`
  (`color-picker-saved-palettes`, tối đa 20 bộ, mới nhất lên đầu). Hiển thị danh sách bảng
  màu đã lưu — mỗi bảng là 1 dải màu bấm được để load lại (`setPalette` + `rgbToHsl` từ hex
  đã lưu) kèm nút xóa riêng. Đọc/ghi `localStorage` đều bọc try/catch (cùng pattern history
  của Regex Tester) để không vỡ nếu private-mode/quota đầy. Build sạch (421 trang), xác nhận
  label mới trong `dist/en/tools/color-picker/index.html`. Thêm 4 key i18n cho en+vi +
  `messages` object.
- **2026-07-30** — Phase 3.6b — mục "Chuyển đổi Case: Title Case có danh sách từ ngoại lệ"
  (vs ConvertCase.net): thêm `titleCase()` áp dụng đúng quy ước AP/Chicago-style mà
  ConvertCase.net dùng — 18 từ ngắn (a/an/and/as/at/but/by/for/in/nor/of/on/or/so/the/to/
  up/yet) giữ nguyên chữ thường, TRỪ khi là từ đầu hoặc từ cuối câu (luôn viết hoa bất kể
  danh sách). Verify bằng script Node độc lập với 5 tựa sách kinh điển ("The Lord of the
  Rings", "A Tale of Two Cities", "Of Mice and Men", "To Kill a Mockingbird", "War and
  Peace") — khớp đúng 100% cách viết hoa chuẩn thật của các tựa này. Build sạch (421 trang).
  Không cần đổi i18n (hàm nội bộ).
- **2026-07-30** — Phase 3.6b — mục "CSV↔JSON Converter: hỗ trợ TSV như 1 option riêng" (vs
  CloudConvert/Convertio): delimiter Tab đã tồn tại từ trước (chỉ là 1 trong 4 lựa chọn
  delimiter) nhưng không được trình bày như định dạng TSV riêng biệt — đổi nhãn thành
  "Tab (TSV)" để dễ tìm thấy hơn; upload file `.tsv` tự động chuyển `delimiterOption` sang
  `'tab'` (tiết kiệm 1 bước thủ công mà cả CloudConvert/Convertio đều bắt người dùng tự
  chọn); tải xuống JSON→TSV giờ dùng đúng phần mở rộng `.tsv` + MIME
  `text/tab-separated-values` thay vì luôn `.csv`. Thêm `.tsv` vào `accept` của input file.
  Build sạch (421 trang), xác nhận nhãn mới trong
  `dist/en/tools/csv-json-converter/index.html`.
- **2026-07-30** — Phase 3.6b — mục "Gộp PDF: cảnh báo giới hạn dung lượng" (vs iLovePDF/
  Smallpdf): thêm banner cảnh báo (màu amber, không chặn thao tác) khi tổng dung lượng các
  file đã chọn vượt `LARGE_TOTAL_SIZE_WARNING_BYTES = 200MB` — khác đối thủ (giới hạn do
  upload server), rủi ro thật ở đây là bộ nhớ tab trình duyệt vì toàn bộ việc gộp diễn ra tại
  chỗ (load + copy + re-save mọi PDF nguồn trong RAM). Build sạch (421 trang).
- **2026-07-30** — Phase 3.6b — mục "Image Compressor: nút Retry riêng" (vs TinyPNG/Squoosh):
  thêm nút "Retry" cạnh nút Download khi `item.status === 'error'`, gọi thẳng
  `compressOne(item)` (hàm đã tách sẵn từ khi làm song song hoá batch ở M1) — không cần
  logic mới, chỉ expose lại hàm đã có cho 1 item lỗi thay vì bắt người dùng xóa + upload lại
  từ đầu. Build sạch (421 trang).
- **2026-07-30** — Phase 3.6b — mục "Markdown Editor: keyboard shortcut Ctrl+B/Ctrl+I" (vs
  StackEdit/Dillinger): thêm `handleEditorKeyDown` trên textarea, bắt Ctrl+B/Ctrl+I (và
  Cmd trên Mac qua `metaKey`) gọi thẳng cùng `applyEdit(wrapInline(...))` mà nút toolbar
  Bold/Italic đã dùng — không tạo logic riêng, chỉ thêm lối tắt bàn phím tới hành vi có sẵn.
  `preventDefault()` để tránh Firefox bật/tắt bookmarks toolbar khi bấm Ctrl+B. Cập nhật
  tooltip 2 nút toolbar thành "... (Ctrl+B)"/"... (Ctrl+I)" ngay trong JSX (không cần thêm
  key i18n mới, chỉ nối chuỗi với string có sẵn). Build sạch (421 trang).
- **2026-07-30** — Phase 3.6b — mục "Regex Tester: lưu lịch sử pattern + URL chia sẻ state"
  (vs regex101/RegExr): **Lịch sử** — mỗi lần worker trả kết quả match thành công (không
  lỗi), lưu `{pattern, flags}` vào `localStorage` (key `regex-tester-history`, tối đa 10
  entry, mới nhất lên đầu, dedup nếu trùng pattern+flags) — hiển thị dạng chip bấm để load
  lại, kèm nút "Clear history". **URL share** — cùng pattern `?token=` đã dùng ở JWT Decoder:
  đọc `?pattern=&flags=&test=&replacement=` một lần lúc mount, nút "Copy share link" build
  URL từ state hiện tại qua `URLSearchParams`. Cả 2 tính năng đọc/ghi `localStorage`/`window`
  đều bọc try/catch hoặc guard `typeof window !== 'undefined'` để không vỡ SSR build (đúng
  pattern đã áp dụng ở JWT Decoder). Verify bằng script Node độc lập: `flagsFromString()`
  parse đúng, logic dedup/move-to-front không tạo trùng lặp. Build sạch (421 trang), xác
  nhận label mới trong `dist/en/tools/regex-tester/index.html`. Thêm 3 key i18n
  (`historyHeading`/`historyClear`/`copyShareLink`) cho en+vi + `messages` object.
- **2026-07-30** — Phase 3.6b — mục "Base64: batch nhiều file + chọn encoding khác UTF-8"
  (vs base64decode.org): **Batch encode** — đổi state file-encode từ 1 object đơn sang mảng
  `encodedFiles`, `handleFileEncode` lặp qua mọi file trong `FileList` (đã hỗ trợ `multiple`
  ở input + kéo-thả nhiều file vào cùng lúc), mỗi file đọc độc lập qua `FileReader` riêng,
  hiển thị dạng danh sách card (tên, preview ảnh nếu có, base64, data URI, nút xóa từng
  item + Clear all). **Chọn encoding khi decode** — `TextEncoder` (hướng encode) chỉ hỗ trợ
  UTF-8 theo chuẩn Web Platform (không có API browser nào mã hóa sang encoding cũ phía
  client), nên chỉ thêm lựa chọn encoding cho hướng **decode** qua `TextDecoder` (hỗ trợ
  nhiều hơn hẳn): utf-8/utf-16le/utf-16be/iso-8859-1/windows-1252/shift_jis/euc-kr/gbk/big5/
  koi8-r — verify cả 10 label hợp lệ bằng script Node gọi thẳng `new TextDecoder(label)`.
  Build sạch (421 trang), xác nhận label mới trong
  `dist/en/tools/base64-encoder-decoder/index.html`. Thêm 3 key i18n
  (`decodeEncodingLabel`/`remove`/`clearAll`) cho en+vi + `messages` object.
- **2026-07-30** — Phase 3.6b — mục "Đếm từ & ký tự: upload file" (vs WordCounter.net):
  thêm nút "Upload .txt file" (input file ẩn + label, `FileReader.readAsText`, set thẳng
  `text` state) — cùng pattern đã dùng ở Text Case Converter. Build sạch (421 trang).
- **2026-07-30** — Phase 3.6b — mục "Chuyển đổi Case văn bản: đếm từ/ký tự + upload/download
  file" (vs ConvertCase.net): thêm dòng thống kê `{{chars}} characters · {{words}} words`
  dưới output (tính từ `output.length`/`output.trim().split(/\s+/)`), nút "Upload .txt file"
  (input file ẩn + label, đọc qua `FileReader.readAsText`, set thẳng vào `text` state để
  chạy qua case conversion đang chọn) và nút "Download .txt" (Blob + object URL, cùng pattern
  đã dùng ở các tool khác). Build sạch (421 trang), xác nhận label mới trong
  `dist/en/tools/text-case-converter/index.html`. Thêm 3 key i18n (`outputStats`,
  `uploadFile`, `downloadFile`) cho en+vi + `messages` object.
- **2026-07-30** — Phase 3.6b — mục "Color Picker: hex nhận dạng rút gọn 3 ký tự" (vs
  Coolors/Adobe Color): `hexToRgb()` trong `ColorPicker.tsx` trước đây chỉ khớp regex 6 ký
  tự (`#RRGGBB`); thêm nhánh khớp 3 ký tự (`#RGB`) và tự nhân đôi từng ký tự thành 6 ký tự
  trước khi parse — đúng quy ước CSS gốc đã hỗ trợ shorthand hex này. Verify bằng script Node
  độc lập: `#abc` và `#AABBCC` cho ra cùng 1 RGB, input rác vẫn bị từ chối đúng như trước.
  Build sạch (421 trang). Không cần đổi i18n (hàm nội bộ, không có text UI mới).
- **2026-07-30** — Phase 3.6b (bắt đầu) — thêm ~42 mục feature-parity bắt buộc từ mục 2
  (so sánh benchmark từng công cụ) của `AUDIT.md` vào `ROADMAP.md`, phần chưa từng được đưa
  vào roadmap ở các đợt trước (loại các gap audit tự đánh giá chấp nhận được/Low, và các gap
  đã sửa ở Phase 3.5/3.6a). Bắt đầu làm mục đầu tiên — "JWT Decoder: URL deep-link chia sẻ
  token debug + cảnh báo `alg: none`" (vs jwt.io): thêm `useEffect` đọc `?token=` từ URL lúc
  mount (chỉ đọc 1 lần, không đồng bộ 2 chiều — gõ token mới không sửa URL), nút "Copy share
  link" tái dùng `CopyButton` sẵn có; thêm `isAlgNone` + badge cảnh báo màu đỏ cạnh badge
  algorithm khi `alg` là `"none"` (JWT hợp lệ theo spec nhưng không có chữ ký — ai cũng giả
  mạo được, khác với case "thuật toán chưa hỗ trợ verify"). Bug tự phát hiện lúc code: tính
  `shareLink` truy cập `window.location` trực tiếp ở phần render (không phải trong
  `useEffect`) sẽ crash SSR build vì Astro pre-render component 1 lần trong Node (không có
  `window`) — sửa bằng guard `typeof window !== 'undefined'`, cùng loại bug đã ghi trong mục
  "Ghi chú kỹ thuật" phía trên (hydration mismatch/browser-only global). Thêm key i18n
  `copyShareLink`/`algNoneWarning` cho en+vi + `messages` object. Build sạch (421 trang),
  xác nhận cả 2 string mới có trong props serialize của `dist/en/tools/jwt-decoder/index.html`.
- **2026-07-30** — Phase 3.6 (hoàn tất 7/7) — mục 7/7 "QR Generator: dot-style/gradient" +
  M7 (N/A, chỉ cập nhật ROADMAP): viết lại hoàn toàn cơ chế render của `QrCodeGenerator.tsx`,
  chuyển từ `qrcode.react` (render qua JSX props, chỉ hỗ trợ màu đặc) sang thư viện mới
  `qr-code-styling` (dependency mới, đã hỏi và được người dùng chọn) — hỗ trợ sẵn 6 kiểu chấm
  (square/dots/rounded/classy/classy-rounded/extra-rounded) và gradient tuyến tính/tỏa tròn,
  100% client-side (canvas/SVG). Thay đổi kiến trúc: từ component React khai báo
  (`<QRCodeCanvas>`) sang instance mệnh lệnh (`new QRCodeStyling()` + `.append()`/`.update()`
  trong `useEffect`) vì thư viện không phải React component. `qr-code-styling` chạm
  `document` trong constructor nên phải `await import(...)` động bên trong `useEffect`
  (client-only), KHÔNG import tĩnh đầu file — cùng lý do/pattern đã áp dụng cho `jsoneditor`
  ở Phase 3, ghi trong mục "Ghi chú kỹ thuật" phía trên. Tính năng "data too long": thư viện
  ném lỗi dạng string thô `"code length overflow. (...)"` đồng bộ trong `.update()` (khác
  `qrcode.react` ném `RangeError` trong React render, trước đây phải bắt bằng
  `QrErrorBoundary`) — nay bắt trực tiếp bằng try/catch quanh `.update()`, xoá hẳn class
  `QrErrorBoundary` vì không còn cần thiết. Giữ nguyên container DOM luôn mounted (chỉ ẩn
  bằng class `hidden` khi lỗi) thay vì gỡ khỏi cây JSX, tránh bug thật đã tự phát hiện lúc
  code: gỡ hẳn container khi lỗi rồi mount lại node DOM mới sẽ làm instance cũ (đã
  `.append()` vào node cũ) không bao giờ hiển thị lại được dù input hợp lệ trở lại. Export
  PNG/SVG đơn giản hoá đáng kể: dùng `.download({name, extension})` có sẵn của thư viện thay
  vì tự dựng Blob/canvas ẩn như trước — bỏ hẳn 2 ref canvas/svg ẩn dùng riêng cho export.
  Verify: build sạch (421 trang) + xác nhận qua `dist/_astro/` rằng `qr-code-styling` được
  code-split thành chunk riêng ~46KB (chỉ tải khi vào trang QR, không phình bundle chính) và
  không còn tham chiếu `qrcode.react`/`QRCodeCanvas` nào sót lại; xác nhận trực tiếp bằng
  script Node gọi thẳng `qrcode-generator` (dependency lõi của `qr-code-styling`) rằng chuỗi
  lỗi thật khớp đúng `"code length overflow..."` mà code bắt. Không có Puppeteer/browser
  trong môi trường phiên này để test tương tác thật (kéo dot-style, xem gradient render, tải
  PNG/SVG thật) — đã verify được logic/build/bundle nhưng CHƯA verify bằng mắt UI thật, cần
  người dùng tự kiểm tra khi mở trang QR Generator. Gỡ `qrcode.react` khỏi `package.json`
  (không còn nơi nào dùng). Sửa đoạn văn `article.p2`/`p3` (en+vi) nhắc tên thư viện cũ
  "qrcode.react" — cập nhật lại mô tả chung chung + thêm nhắc dot-style/gradient mới. Thêm
  12 key i18n mới (`dotStyleLabel` + 6 kiểu, `gradientToggleLabel`/`gradientTypeLabel` + 2
  kiểu, `gradientStartColorLabel`/`gradientEndColorLabel`) cho cả en+vi + `messages` object
  trong `QrCodeGeneratorPage.astro`. **Phase 3.6 hoàn tất toàn bộ 7/7 mục** (M1, M2, M4, M5,
  M6, M8, M9 đã xong; M7 đánh dấu N/A).
- **2026-07-30** — Phase 3.6 — mục 6/7 "Resize trước khi xuất (Image Compressor + Image
  Converter)": **Image Compressor** — thêm checkbox `resizeEnabled` + slider `maxDimension`
  (320-4096px, mặc định 1920px), truyền thẳng vào `maxWidthOrHeight` của
  `imageCompression()` (thư viện đã hỗ trợ sẵn, không cần code resize tay). **Image
  Converter** — tool này dùng Canvas API thuần (không dùng `browser-image-compression`), nên
  `convertImage()` được thêm tham số `maxDimension` tính lại `width`/`height` giữ tỷ lệ khung
  hình trước khi tạo canvas; áp dụng TRƯỚC bước resize riêng cho ICO (256px) để 2 giới hạn
  không xung đột — ICO luôn thu nhỏ thêm nếu cần, không bao giờ phóng to lại. Cả 2 file dùng
  chung UI pattern (checkbox + range slider) và cùng dải giá trị 320-4096px. Nhân tiện sửa
  đoạn văn giới thiệu (`article.p3`) của Image Compressor — trước đó viết "mỗi ảnh xử lý lần
  lượt", nay sai từ khi làm mục 5/7 (song song hoá) nên đã cập nhật lại cho đúng, cả en+vi.
  Thêm key i18n `resizeToggleLabel`/`maxDimensionLabel` cho cả 2 namespace, cả en+vi, cộng
  dòng `messages` tương ứng trong 2 file `*Page.astro`. Build sạch (421 trang), xác nhận
  label mới xuất hiện trong `dist/en/tools/{compress-image,convert-image-format}/index.html`,
  verify công thức scale giữ tỷ lệ khung hình bằng script Node độc lập (không có browser
  test trong môi trường phiên này).
- **2026-07-30** — Phase 3.6 — mục 5/7 "Image Compressor: song song hoá batch": tách logic
  nén 1 ảnh ra `compressOne()`, `handleCompress()` đổi từ `for...of` tuần tự sang mô hình
  "worker-pool" — `CONCURRENCY = 3` lane chạy song song, mỗi lane tự lấy ảnh tiếp theo trong
  hàng đợi (biến `cursor` dùng chung) ngay khi xong ảnh trước, thay vì chờ hết cả batch mới
  xử lý batch kế. Giới hạn 3 vì mỗi lần gọi `imageCompression()` tự spawn 1 Web Worker riêng
  (`useWebWorker: true` có sẵn) — chạy hết cỡ cùng lúc với ảnh lớn dễ tốn RAM/giật UI. Không
  cần thêm dependency. Build sạch (421 trang). Không có Puppeteer/browser tool trong môi
  trường phiên này để test tương tác thật — đã verify logic hàng đợi bằng 1 script Node độc
  lập mô phỏng đúng pattern (delay ngẫu nhiên, đếm concurrency tối đa, kiểm tra mọi item được
  xử lý đúng 1 lần) với n=1,2,7,10 ảnh, xác nhận `maxActive` không vượt 3 và không có
  race/item bị bỏ sót hay xử lý trùng.
- **2026-07-30** — Phase 3.6 — mục 4/7 "focus-visible pass cho input/select/textarea":
  buttons đã có ring focus-visible sẵn qua `cva` trong `button.tsx`, nhưng input/select/
  textarea "tay" ở tất cả tool component chỉ dựa vào outline mặc định trình duyệt. Thay vì
  sửa className ở từng file `.tsx` (hàng chục file, dễ sót), thêm 1 rule global trong
  `src/styles/global.css` (`@layer base`): `input:focus-visible, select:focus-visible,
  textarea:focus-visible { @apply border-ring outline-none ring-3 ring-ring/50; }` — dùng
  đúng token `--ring` mà Button đang dùng nên ring nhất quán giữa nút và input trên toàn
  site, áp dụng tự động cho MỌI input/select/textarea kể cả tool mới sau này, không cần
  đụng từng component. Build sạch (421 trang), xác nhận rule đã compile đúng vào CSS bundle
  (`dist/_astro/Layout.*.css`, có `border-color/box-shadow/outline-style:none` đầy đủ).
- **2026-07-30** — Phase 3.6 — mục 3/7 "Trang chủ: bỏ ô '0 KB uploaded'": xoá khối `<div>`
  placeholder tĩnh (không có tracking thật đứng sau, đúng triết lý zero-server — quyết định
  chọn "bỏ hẳn" thay vì "thêm số liệu thật qua localStorage" đã hỏi và được người dùng xác
  nhận) khỏi `src/pages/[locale]/index.astro`, chỉ giữ 2 ô thật (số tool/số category). Xoá
  luôn key `home.stats.uploaded` không còn dùng ở **cả 20 file** `common.json` (không chỉ
  en/vi — key này có từ Phase 0/2, trước quy ước "chỉ en+vi cho tool mới" ban hành
  2026-07-27) bằng 1 script Node nhỏ (JSON.parse/stringify) để đảm bảo xoá đúng key, không
  làm hỏng cấu trúc/encoding Unicode của các ngôn ngữ khác. Build sạch (421 trang), xác nhận
  `dist/en/index.html` không còn chuỗi "0 KB".
- **2026-07-30** — Phase 3.6 — mục 2/7 "JWT Decoder: hiển thị aud/iss/sub": `JwtDecoder.tsx`
  thêm helper `formatStringOrArrayClaim()` (claim `aud` theo spec JWT có thể là string hoặc
  mảng string, các claim còn lại luôn là string đơn), tính `audText`/`issText`/`subText` song
  song với `expText`/`iatText`/`nbfText` sẵn có, render thêm vào cùng `<dl>` claims panel.
  Thêm 3 key i18n `audienceLabel`/`issuerLabel`/`subjectLabel` vào `en`+`vi` của
  `tool-jwt-decoder.json` và vào object `messages` trong `JwtDecoderPage.astro` (bắt buộc
  theo quy ước đã ghi ở trên, nếu không sẽ render rỗng). Build sạch (421 trang), xác nhận qua
  `dist/en/tools/jwt-decoder/index.html` có đủ 3 label mới.
- **2026-07-30** — Phase 3.6 (bắt đầu) — mục 1/7 "Base64: mở rộng bảng MIME→extension":
  `EXTENSION_BY_MIME` trong `Base64Tool.tsx` mở rộng từ 9 lên ~35 entries, thêm ảnh
  (bmp/ico/avif/heic/tiff), audio/video phổ biến, font (woff/woff2/ttf/otf), Office
  (doc/docx/xls/xlsx/ppt/pptx), text (csv/html/css/js/xml/md), archive (rar/7z/gz/tar).
  Build sạch (421 trang). Đã thêm section mới `Phase 3.6` vào `ROADMAP.md` cho 7 mục Medium
  còn lại trong `AUDIT.md` (M1, M2, M4–M9; M3/M10 đã xong từ trước, M7 đánh dấu N/A vì mỗi
  trang tool chỉ có 1 React island là chính component, không có nội dung dưới fold để đổi
  `client:visible`).
- **2026-07-29** — Nâng cấp Text Diff Checker theo yêu cầu trực tiếp người dùng (không phải
  task ROADMAP): sửa bug thật "highlight cả từ khi chỉ khác vài ký tự" (vd. `hahah` vs
  `hahahahah` trước đây tô vàng nguyên cả từ). Nguyên nhân: ở Word mode, `diffWords` coi
  mỗi từ là 1 token, khi 2 token khác nhau thì toàn bộ token bị đánh dấu removed/added,
  không có bước tinh chỉnh xuống mức ký tự. Đã thêm `refineModifiedWordPairs()` trong
  `src/lib/text-diff.ts`: sau `diffWords`, mọi cặp (removed token liền kề added token) —
  tức 1 từ bị THAY THẾ chứ không phải thêm/xóa thuần túy — được chạy lại qua `diffChars` để
  chỉ tô đúng phần ký tự khác biệt, đúng kiến trúc phân lớp Line → Word → Character mà
  DiffChecker/GitHub dùng (dùng `diff` (jsdiff) sẵn có, engine này đã cài Myers diff nội bộ
  — không cần đổi thư viện). Test Puppeteer thật với đúng 3 ví dụ người dùng đưa ra:
  `hahah`→`hahahahah` chỉ tô "ahah"; `color`→`colour` chỉ tô "u" (còn tối ưu hơn ví dụ người
  dùng đưa, vì Myers diff tìm ra "colo" và "r" đều chung nên chỉ 1 ký tự khác biệt thật sự);
  `Hello`→`Hallo` tô đúng "e"/"a". Giới hạn `CHAR_REFINE_MAX_LEN=2000` ký tự cho mỗi token
  trước khi tinh chỉnh, tránh treo tab với những đoạn văn bản thay thế cực dài (an toàn về
  hiệu năng, không phải giới hạn tính năng).

  Tiện thể phát hiện & sửa 1 bug thật khác trong lúc test hồi quy (không nằm trong yêu cầu
  gốc nhưng lộ ra khi kiểm tra navigation): `diffLines` của jsdiff đôi khi chọn một cách gộp
  dòng hợp lệ nhưng không tối ưu — 2 dòng **giống hệt nhau** bị xếp chung vào 1 cặp
  removed+added (do LCS có nhiều lời giải tối thiểu ngang nhau) — khiến `buildLineDiff` gắn
  nhãn "modified" (tô cam) cho một dòng thực ra không đổi gì. Đã thêm kiểm tra so sánh chuỗi
  trước khi gắn nhãn 'modified': nếu 2 dòng trong cặp giống hệt nhau thì xếp lại thành
  'unchanged'. Sửa này còn khắc phục luôn 1 hệ quả liên đới: các hunk bị gộp sai (2 khác
  biệt tách biệt bị tính chung thành 1 hunk) khiến bộ đếm Previous/Next Change sai số.

  Thêm 3 tùy chọn ignore còn thiếu so với yêu cầu: **Ignore empty lines** (lọc dòng
  trống/chỉ-khoảng-trắng khỏi cả 2 phía trước khi so sánh), **Normalize line endings**
  (CRLF/CR → LF trước khi so sánh — lưu ý: chỉ có tác dụng thật với file tải lên qua
  `FileReader`, vì `<textarea>` tự chuẩn hóa CRLF→LF theo đặc tả HTML value-sanitization
  ngay khi gõ/dán, nên gõ tay không bao giờ tạo ra CRLF thật để so sánh — đã xác minh giới
  hạn này khi viết test, không phải suy đoán), **Unicode normalization** (`String.normalize
  ('NFC')` cho cả 2 phía). Cả 3 nằm trong hàm mới `preprocessDiffInput()` (file
  `text-diff.ts`), áp dụng cho `debouncedOriginal`/`debouncedChanged` trước khi diff, không
  đụng vào nội dung gốc hiển thị trong textarea.

  Chuyển việc tính diff sang **Web Worker riêng** (`textDiffWorker.ts`, cùng pattern với
  `regexMatchWorker.ts`/`audioEncodeWorker.ts` đã có) — `buildLineDiff` là thuật toán
  Myers O(N·D), có thể mất thời gian đáng kể với văn bản dán vào rất lớn, chạy trong worker
  để không đứng UI. Dùng `requestId` tăng dần để bỏ qua response trễ (không cần cơ chế
  hard-timeout-kill như Regex Tester vì thuật toán jsdiff có giới hạn, không phải input tùy
  ý của người dùng như regex pattern).

  **Chưa làm**: virtualization cho hỗ trợ file 100k+ dòng (yêu cầu mục 8 trong spec người
  dùng) — đây là thay đổi kiến trúc lớn, đụng tới cả cơ chế cuộn-tới-hunk (`jumpToHunk` hiện
  dùng `document.getElementById` + `scrollIntoView`, không tương thích trực tiếp với
  windowed rendering, cần đổi sang tính `scrollTop` toán học) và 3 khu vực render riêng biệt
  (2 cột so sánh chính + phần Merge Tool), rủi ro cao hơn hẳn phần còn lại nếu làm vội trong
  cùng 1 lượt — để lại hỏi người dùng riêng trước khi làm, thay vì tự ý làm ẩu.

  Build sạch (421 trang) + bộ test Puppeteer hồi quy đầy đủ xác nhận KHÔNG có tính năng cũ
  nào bị hỏng: upload file, swap, clear, fullscreen, Character/Word/Line mode, thống kê
  added/removed/modified, copy, download (merge tool), Previous/Next Change navigation.
- **2026-07-29** — Phase 3.5e (hoàn tất) — **kết thúc toàn bộ Phase 3.5 Audit Remediation**:
  chạy Lighthouse thật (bản 13.4.1, có sẵn qua npx cache của máy) trên `npm run preview`
  build production, chế độ mobile + throttle mạng/CPU mặc định (không phải desktop dễ đạt
  điểm cao hơn) — đúng yêu cầu "đo thật, không chỉ ước tính" đã ghi ở giới hạn của
  `AUDIT.md`. Đo 6 trang đại diện: trang chủ, Regex Tester (đã sửa ReDoS + accessibility ở
  3.5a/b), Image Compressor, JSON Formatter (dùng `jsoneditor`, DOM phức tạp), SVG Optimizer
  (DOM nhiều nhất sau khi thêm 34 checkbox ở H4), và 1 trang tiếng Việt (`/vi/tools/
  cat-video-ngan/`) để xác nhận điểm không lệch giữa các ngôn ngữ. Kết quả: **Performance
  96-100, Accessibility 100/100, Best Practices 100/100, SEO 100/100 ở mọi trang đã đo** —
  vượt xa ngưỡng ≥90 của `CLAUDE.md`. Điểm Accessibility 100/100 xác nhận trực tiếp hiệu quả
  của các fix Critical ở Phase 3.5a/b (skip-link, focus-trap, `role=alert/status`, alt text)
  — không chỉ là fix về mặt lý thuyết mà đo được bằng công cụ thật (Lighthouse dùng chính
  engine `axe-core` cho hạng mục Accessibility, nên coi như đã đạt luôn phần "axe DevTools"
  ghi trong mục 3.5b trước đó, không cần chạy axe độc lập thêm). Phần Performance chưa tuyệt
  đối 100 ở vài trang chỉ do First/Largest Contentful Paint (1.4–2.7s dưới điều kiện giả lập
  mạng chậm) — vẫn nằm trong ngưỡng "tốt", không phải vấn đề cần sửa. Đã tick nốt mục
  Lighthouse còn treo ở Phase 3.5b (điểm Accessibility) và mục tương ứng ở Phase 3.5e trong
  `ROADMAP.md`. **Toàn bộ Phase 3.5 (3.5a→3.5f, trừ 3.5f PWA — chưa bắt đầu, thuộc Phase 4)
  nay đã hoàn tất**: 7/7 Critical + 10/10 High, mỗi mục đều build sạch + test thật + commit
  riêng.
- **2026-07-29** — Phase 3.5e: thêm `FAQPage` JSON-LD cho **cả 20 trang tool** (không phải
  ví dụ mẫu vài trang) — hạng mục lớn nhất Phase 3.5e. Tạo component dùng chung
  `src/components/layout/FaqSection.astro`: nhận `heading` + mảng `{question, answer}[]`,
  render vừa UI accordion thật (`<details>/<summary>`, không cần JS riêng vì đây là phần tử
  HTML gốc hỗ trợ mở/đóng sẵn) vừa tự phát `<script type="application/ld+json">` chứa schema
  `FAQPage` — 1 component lo cả 2 việc, tránh lặp code ở 20 file `*Page.astro`. Viết mới 3
  cặp câu hỏi/trả lời ngắn gọn, đúng thực tế từng tool (không phải sinh hàng loạt theo
  template chung — mỗi câu tham chiếu tính năng thật đã xác minh qua audit trước đó, ví dụ
  JWT Decoder nhắc đúng khả năng verify HMAC/RSA, SVG Optimizer nhắc đúng con số "34 plugin"
  vừa thêm ở H4) cho **cả 20 tool × 2 ngôn ngữ (en/vi)** = 120 câu hỏi/trả lời, lưu trong
  object `faq` mới ở từng file JSON locale (cùng cấp với `article` đã có), gọi qua
  `t('faq.q1')`/`t('faq.a1')`... ngay trong frontmatter mỗi `*Page.astro` (không đi qua
  React `messages` prop nên không gặp lại kiểu bug thiếu key như ở H1). Đặt `<FaqSection>`
  giữa section "article" và section "related tools" ở cả 20 trang. Build sạch (421 trang) +
  xác minh: `grep FAQPage` khớp đúng 20/20 trang ở cả `dist/en/` và `dist/vi/`; parse JSON
  của script `ld+json` bằng Node xác nhận hợp lệ (không lỗi cú pháp, `mainEntity` đúng 3
  phần tử); nội dung tiếng Việt hiển thị đúng (không fallback âm thầm sang tiếng Anh); test
  Puppeteer thật trên 5 tool đại diện — xác nhận đủ 3 FAQ mỗi trang, đúng nội dung câu hỏi,
  và bấm vào `<summary>` thực sự mở được `<details>` (accordion hoạt động thật, không chỉ có
  HTML tĩnh). Đã tick mục tương ứng trong `ROADMAP.md` Phase 3.5e.
- **2026-07-29** — Phase 3.5e bắt đầu: xác minh và bổ sung Open Graph + Twitter Card +
  canonical link trong `Layout.astro` (dùng chung toàn bộ 20+ trang). Audit ban đầu ghi "chưa
  xác minh được" — đọc trực tiếp `Layout.astro` xác nhận **hoàn toàn chưa có** cả OG, Twitter
  Card, lẫn `<link rel="canonical">` (canonical trước đó chỉ tồn tại bên trong JSON-LD
  `url`, không có link tag thật — ảnh hưởng SEO thật vì Google ưu tiên link tag hơn). Đã thêm
  `og:type/site_name/title/description/url/locale` + `twitter:card` (`summary`, không phải
  `summary_large_image` vì chưa có ảnh)/`title`/`description` + `<link rel="canonical">`,
  tính `canonicalUrl` một lần trong `Layout.astro` từ `Astro.url` + `Astro.site` (không cần
  mỗi `*Page.astro` tự tính lại). Thêm bảng map `og:locale` cho cả 20 ngôn ngữ (vd. `vi` →
  `vi_VN`, `zh-tw` → `zh_TW`) vì chuẩn Open Graph cần dạng `ngôn_ngữ_QUỐC-GIA`, khác mã 2 ký
  tự routing thuần của site. **Cố tình chưa thêm `og:image`/`twitter:image`**: repo chưa có
  ảnh OG chuẩn (1200×630) nào trong `public/`, chỉ có favicon (không phù hợp làm og:image) —
  ghi nhận đây là việc cần làm riêng (thiết kế 1 ảnh banner thương hiệu), không tự chế ảnh
  giả để "cho đủ tag". Build sạch (421 trang) + xác minh trực tiếp trong `dist/` HTML build
  ra: tag `og:locale` đúng theo từng ngôn ngữ (`en_US` cho `/en/`, `vi_VN` cho `/vi/`),
  `canonical` đúng URL tuyệt đối từng trang. Đã tick mục tương ứng trong `ROADMAP.md` Phase
  3.5e.
- **2026-07-29** — Phase 3.5d (hoàn tất, kết thúc luôn Phase 3.5d): Video Trim — 2 phần theo
  audit. (1) **Timeline kéo-2-tay-cầm**: thay 2 thanh `<input type=range>` tách rời bằng 1
  component `TrimTimeline` tự viết — track trực quan, 2 tay cầm kéo được đè lên vùng chọn tô
  màu, dùng Pointer Events + `setPointerCapture` (không phải listener gắn ở `document`) nên
  kéo mượt kể cả khi con trỏ ra khỏi track, hoạt động cả chuột lẫn cảm ứng qua cùng 1 API;
  có `role="slider"` + `aria-valuenow/min/max` + hỗ trợ bàn phím (mũi tên trái/phải chỉnh
  0.5s, Shift+mũi tên chỉnh 5s, Home/End nhảy về đầu/cuối) — đạt chuẩn custom widget WCAG,
  không phải chỉ đẹp mắt. (2) **"Offload FFmpeg sang Web Worker"**: audit gốc ghi nhận đây là
  gap ("Video Trim xử lý FFmpeg hoàn toàn trên main thread... rủi ro jank UI"), nhưng khi đọc
  trực tiếp source thật của `@ffmpeg/ffmpeg` (`node_modules/@ffmpeg/ffmpeg/dist/esm/classes.js`)
  phát hiện **class `FFmpeg` đã tự tạo `new Worker(...)` nội bộ và mọi lệnh (`exec`,
  `writeFile`, `readFile`...) đều đi qua `worker.postMessage()`** — nghĩa là phần tính toán
  nặng (chạy WASM) vốn đã chạy trong Worker riêng của chính thư viện, không phải trên main
  thread như audit tĩnh (chỉ đọc code, không đọc `node_modules`) đã suy đoán. Đã xác minh
  **thực nghiệm** bằng Puppeteer: đếm số lần `requestAnimationFrame` tick trên main thread
  trong suốt lúc trim video thật (dùng ffmpeg.wasm CDN thật, không mock) — tick vẫn tăng đều
  đặn (233 lần trong ~vài giây xử lý), chứng minh main thread không hề bị block. Kết luận:
  không cần viết thêm 1 lớp Worker nữa bọc quanh thứ đã chạy trong Worker sẵn (sẽ là
  over-engineering vô nghĩa theo đúng tinh thần CLAUDE.md) — mục này coi là đã đạt, chỉ khác
  cách đạt được so với audit ban đầu hình dung. Build sạch (421 trang) + test Puppeteer thật
  toàn trình: tạo video mẫu thật bằng canvas + MediaRecorder ngay trong Puppeteer, upload,
  kéo tay cầm start bằng pointer event thật (không phải gọi hàm JS trực tiếp) xác nhận giá
  trị đổi đúng, trim thật qua CDN ffmpeg.wasm thật, xác nhận có video kết quả + main thread
  không đứng. Lưu ý kỹ thuật khi test: phải set viewport đủ lớn (`1280×1600`) trước khi lấy
  `boundingBox()` để mô phỏng kéo chuột — mặc định 800×600 khiến control nằm ngoài viewport,
  `page.mouse` gửi tọa độ không trúng gì, kéo "im lặng" không báo lỗi (bug test, không phải
  bug code — dễ nhầm). Đã tick mục tương ứng trong `ROADMAP.md`, **hoàn tất toàn bộ Phase
  3.5d**.
- **2026-07-29** — Phase 3.5d: SVG Optimizer — gap tính năng lớn nhất site theo audit (58/100,
  chỉ 3 checkbox so với ~30+ toggle riêng lẻ của SVGOMG) nay đã đóng. Đọc trực tiếp source
  `node_modules/svgo/plugins/preset-default.js` (bản cài thật, svgo 4.0.2) thay vì suy đoán
  từ trí nhớ để lấy đúng danh sách 34 plugin thành viên thật của `preset-default` — quan
  trọng vì SVGO **ném lỗi runtime nếu `overrides` chứa tên plugin không thuộc preset**, nên
  đoán sai tên sẽ crash tool. Mỗi plugin giờ có checkbox riêng (mặc định bật, khớp hành vi
  gốc của SVGO), tắt một plugin sẽ set `overrides: { [tên]: false }` khi gọi `optimize()`
  — không đụng tới các plugin còn lại. Phát hiện: `removeViewBox` **không còn nằm trong
  `preset-default` ở SVGO v4** (khác các bản v2/v3 cũ) nên phải thêm như 1 plugin độc lập
  riêng (giống cách `removeDimensions` đã có sẵn), mặc định **tắt** (giữ viewBox) — chủ đích
  khác với hành vi gốc SVGO, vì xóa viewBox phá khả năng co giãn responsive trong đa số
  trường hợp thực tế, đúng quy ước SVGOMG. Toàn bộ 34 checkbox nằm trong `<details>` gập lại
  ("nâng cao") để không phá vỡ trải nghiệm 3-tùy-chọn đơn giản mặc định cho người dùng thường.
  Build sạch (421 trang) + test Puppeteer thật: xác nhận đủ 34 checkbox render; tối ưu SVG
  mẫu có comment với cấu hình mặc định → comment bị xóa đúng; bỏ tick "Remove comments" →
  comment được giữ lại đúng (override hoạt động thật, không phải chỉ đổi UI); xác nhận
  **không có lỗi runtime nào từ svgo** (tức mọi tên override đều hợp lệ); bật "Remove
  viewBox" → viewBox bị xóa đúng khỏi output. Đã tick mục tương ứng trong `ROADMAP.md`
  Phase 3.5d.
- **2026-07-29** — Phase 3.5d: Word Counter — tool duy nhất trên site trước đây không có
  bất kỳ nút copy/export nào, nay thêm đủ 3 tính năng đối thủ (WordCounter.net) có mà tool
  này thiếu: (1) nút Copy (đồng bộ pattern "Copied!" toàn site) và Download `.txt`; (2) chọn
  preset giới hạn ký tự (X/Twitter 280, Meta description 160, Instagram caption 2200,
  YouTube title 100, SMS 160) — hiện số ký tự còn lại, đổi màu cảnh báo (amber khi còn
  ≤10% giới hạn) và destructive khi vượt quá, dùng `role="status"` để báo động; (3) điểm đọc
  hiểu Flesch Reading Ease — tự viết syllable counter xấp xỉ cho tiếng Anh (heuristic đếm
  nhóm nguyên âm, có điều chỉnh hậu tố phổ biến kiểu "-ed"/"-es"/silent-e, không dùng thư
  viện ngoài vì bài toán đơn giản), phân loại theo đúng 7 mức chuẩn Flesch (Very Easy → Very
  Confusing). Ghi chú kỹ thuật: điểm Flesch vốn được hiệu chỉnh cho tiếng Anh — nhãn UI đã
  dịch cho từng ngôn ngữ nhưng bản thân công thức chỉ tính đúng ý nghĩa với văn bản tiếng
  Anh (giống cách WordCounter.net vận hành), không xây riêng công thức cho từng ngôn ngữ vì
  ngoài phạm vi yêu cầu audit. Đã thêm đủ key i18n mới vào **cả JSON locale lẫn
  `WordCounterPage.astro`** cùng lúc (áp dụng bài học từ bug H1). Build sạch (421 trang) +
  test Puppeteer thật: gõ văn bản mẫu → điểm Flesch tính đúng ("97, Very easy to read");
  bấm Copy → hiện "Copied!" (dùng clipboard stub theo ghi chú kỹ thuật đã có); bấm Download
  → file `.txt` tải về đúng nội dung textarea (so khớp byte-for-byte); chọn preset Twitter →
  hiện đúng số ký tự còn lại; gõ vượt 280 ký tự → chuyển đúng sang trạng thái "vượt quá" màu
  destructive. Đã tick mục tương ứng trong `ROADMAP.md` Phase 3.5d.
- **2026-07-29** — Phase 3.5d bắt đầu: Markdown Editor — autosave `localStorage`, tránh mất
  bài khi refresh nhầm (rủi ro UX thật với một text editor không có tính năng này). Restore
  chạy trong `useEffect` riêng sau mount (localStorage không tồn tại lúc SSR build-time của
  Astro, cùng nguyên tắc hydration-safe đã áp dụng ở Color Picker); lưu debounce 500ms theo
  nội dung, và **xóa key khi nội dung rỗng** thay vì lưu chuỗi rỗng — để bấm "Clear" không
  để lại draft cũ hồi sinh ở lần load sau. Cả 2 effect dùng try/catch nuốt lỗi im lặng (không
  chặn tool nếu localStorage bị chặn — private browsing, quota đầy...). Build sạch (421
  trang) + test Puppeteer thật (không phải chỉ giả lập DOM): gõ nội dung → đợi qua debounce →
  **reload trang thật** → xác nhận nội dung khôi phục đúng; bấm Clear → đợi → reload → xác
  nhận KHÔNG hồi sinh; bấm Load Sample → reload → xác nhận sample cũng được autosave đúng.
  Đã tick mục tương ứng trong `ROADMAP.md` Phase 3.5d.
- **2026-07-29** — Phase 3.5c (hoàn tất): CSV ↔ JSON Converter — thêm bảng xem trước
  (số dòng/cột phát hiện được + preview 20 dòng đầu), đồng bộ với JSON → Excel Converter đã
  có sẵn. Preview phản ánh cấu trúc bảng phẳng thực sự parse được từ CSV (không đổi theo
  toggle "nested keys", vì nested chỉ ảnh hưởng hình dạng JSON cuối cùng, không ảnh hưởng
  bảng CSV gốc) — hoạt động cho cả 2 chiều: CSV→JSON dùng `result.meta.fields`/`result.data`
  từ PapaParse, JSON→CSV tái dùng trực tiếp `fields`/`data` đã tính sẵn trong `jsonToCsv` (
  không tính lại). Ẩn hoàn toàn khi có lỗi parse. Đã rút kinh nghiệm từ bug H1 vừa gặp — thêm
  key i18n mới (`previewHeading`/`previewInfo`/`moreRows`) vào **cả file JSON locale lẫn**
  `CsvJsonConverterPage.astro` cùng lúc, tránh lặp lại lỗi render rỗng. Build sạch (421
  trang) + test Puppeteer thật: load sample CSV → xác nhận preview hiện đúng "2 rows × 4
  columns" và đúng dữ liệu thật (Ada Lovelace/London); swap sang chiều JSON→CSV → preview
  vẫn đúng; CSV lỗi cú pháp (quote chưa đóng) → báo lỗi `role="alert"` đúng và **ẩn bảng
  preview** thay vì hiện dữ liệu rác. Đã tick mục tương ứng, hoàn tất toàn bộ Phase 3.5c.
- **2026-07-29** — Phase 3.5c: Image Format Converter — thêm "Download All (.zip)" đồng bộ
  với Image Compressor/PDF Splitter đã có sẵn (dùng `jszip` qua `await import()` động, không
  static import, theo đúng pattern lazy-load mới hơn của PdfSplitter thay vì static import
  cũ của Image Compressor). Nút chỉ hiện khi có >1 ảnh đã convert xong (`doneCount > 1`),
  dùng lại tên file đã đổi đuôi đúng định dạng đích (`replaceExtension`) làm tên file trong
  zip. **Bug thật phát hiện qua test Puppeteer end-to-end** (không phải chỉ build sạch): nút
  "Download All" render ra nhưng **không có chữ gì cả** — vì `ImageConvertPage.astro` build
  object `messages` bằng cách liệt kê từng key gọi `t('ui.xxx')` thủ công (không spread cả
  namespace `ui`), nên thêm key `downloadAll` vào file JSON i18n thôi là chưa đủ, phải thêm
  dòng `downloadAll: t('ui.downloadAll')` vào `messages` trong chính `*Page.astro` nữa — nếu
  chỉ dừng ở "build sạch" (build không báo lỗi vì key thiếu chỉ khiến JSX render chuỗi rỗng,
  TypeScript không bắt được vì `Messages` interface trong `.tsx` chỉ khai kiểu, không xác
  nhận `.astro` đã truyền đủ field) sẽ không phát hiện ra — bài học áp dụng cho mọi lần thêm
  key i18n mới cho tool đã có sẵn: phải sửa cả object `messages` trong `*Page.astro`, không
  chỉ file JSON, và bắt buộc test tương tác thật (không chỉ tin build sạch) mới bắt được lỗi
  kiểu này. Test Puppeteer thật: upload 2 ảnh PNG thật, convert, bấm Download All, xác nhận
  file `.zip` thật xuất hiện trong thư mục tải về với magic bytes `PK` hợp lệ. Build sạch
  (421 trang). Đã tick mục tương ứng trong `ROADMAP.md` Phase 3.5c.
- **2026-07-29** — Phase 3.5c: Color Picker — 2 nút "Copy as CSS"/"Copy as JSON" trước đây
  không có phản hồi "Copied!" như mọi nút copy khác trên site (bất nhất UX đã ghi trong
  audit). Thêm 2 state `cssCopied`/`jsonCopied` riêng, hiện `messages.copied` 1200ms sau khi
  bấm rồi tự trở lại nhãn gốc — cùng pattern với `Swatch` component đã có sẵn trong cùng
  file. Build sạch (421 trang) + test Puppeteer: phát hiện môi trường headless Chrome ở đây
  luôn từ chối `navigator.clipboard.writeText` thật (permission "denied" dù đã
  `overridePermissions`, xác minh bằng probe riêng — giới hạn sandbox, không phải bug code),
  nên test phải stub `navigator.clipboard` qua `page.evaluateOnNewDocument` để cô lập kiểm
  tra đúng phần logic state của tool (hiện đúng "Copied!" rồi tự revert sau timeout) — ghi
  chú kỹ thuật này áp dụng cho mọi test Puppeteer liên quan tới clipboard ở các phiên sau.
  Đã tick mục tương ứng trong `ROADMAP.md` Phase 3.5c.
- **2026-07-29** — Phase 3.5b (hoàn tất 4/5 mục, trừ đo Lighthouse/axe thật): rà soát
  `role=`/`sr-only` có hệ thống. Dùng 1 Explore agent đọc toàn bộ 20 file tool +
  layout component để tìm nút chỉ có icon (không text/aria-label/title) — kết quả: **không
  tìm thấy lỗ hổng nào** ở nhóm này, toàn bộ nút icon-only (rotate/xóa/khóa/copy trong
  PdfMerger, PdfSplitter, ColorPicker, TextDiffChecker, MarkdownEditor...) đã có
  `aria-label`/`title` từ trước — nhận định "aria-* rải rác 16/47 file" trong audit ban đầu
  hóa ra phần lớn do đếm theo số file (1 file có 1 hay 20 `aria-label` đều tính là 1), không
  phản ánh đúng độ phủ thực tế trên các control quan trọng. Việc thật sự cần sửa: (1)
  `Base64Tool.tsx` — ảnh xem trước sau khi giải mã có `alt=""` (ẩn hoàn toàn khỏi screen
  reader dù là nội dung chính người dùng vừa tạo ra) → đổi thành `alt={tên file || nhãn xem
  trước}`, luôn có giá trị khác rỗng; (2) bổ sung `role="status"` cho 7 vị trí text trạng
  thái/tiến trình xử lý bị bỏ sót ở lượt trước (Audio Converter: nhãn "đang giải mã"/"đang mã
  hóa N%"; Video Trim: nhãn "đang tải engine"/"đang xử lý N%"; Background Remover: nhãn %
  từng ảnh khi xóa nền; PDF Merger + PDF Splitter: nhãn "đang tải thumbnail") — cùng chuẩn
  `role="status"` đã dùng ở lượt Phase 3.5b trước cho Regex Tester/Audio Converter, chỉ là mở
  rộng đầy đủ hơn sang các tool còn thiếu. Build sạch (421 trang) + test Puppeteer xác nhận
  ảnh xem trước giải mã có alt text đúng ("Preview" khi chưa đặt tên file) thay vì rỗng. Còn
  treo 1 mục con trong Phase 3.5b: "đo lại bằng Lighthouse + axe DevTools, xác nhận
  Accessibility ≥ 90" — CHƯA làm (cần chạy công cụ đo thật, không phải việc đọc/sửa code,
  để lại cho phiên sau hoặc khi có yêu cầu đo trực tiếp).
- **2026-07-29** — Phase 3.5b: thêm `role="alert"`/`role="status"` (tương đương
  `aria-live="assertive"`/`"polite"` ngầm định theo ARIA spec) cho toàn bộ thông báo lỗi/
  trạng thái xuất hiện động ở **16/20 tool** (4 tool còn lại — Word Counter, Text Case
  Converter, Text Diff Checker, Markdown Editor — không có trạng thái lỗi nào trong code,
  xác nhận bằng grep, không phải bỏ sót). Rà soát toàn bộ vị trí `text-destructive` bằng
  grep trước khi sửa để không bỏ sót (24 vị trí qua 16 file). Quy tắc áp dụng: `role="alert"`
  cho lỗi thật cần người dùng biết ngay (parse error, decode error, verify thất bại, lỗi
  export...); `role="status"` cho thông báo không chặn (file bị bỏ qua vì sai định dạng,
  "đang tính…", cảnh báo downmix audio, kết quả verify JWT hợp lệ). Cố tình giữ nguyên 2 vị
  trí tĩnh không thêm role (badge "Expired" của JWT Decoder, badge "Fail" contrast của Color
  Picker) vì đây là chỉ báo trạng thái thường trực hiển thị cùng lúc với dữ liệu, không phải
  thông báo động cần công bố riêng — đúng tinh thần ARIA (`alert`/`status` dành cho nội dung
  *xuất hiện/thay đổi* để báo tin mới). Build sạch (421 trang) + test Puppeteer thật xác
  nhận `role="alert"` xuất hiện đúng lúc chạy (không chỉ trong code) ở JWT Decoder (token
  sai), Base64 Tool (base64 sai), và `role="status"` ở Image Compressor (upload file không
  phải ảnh bị bỏ qua). Đã tick mục tương ứng trong `ROADMAP.md` Phase 3.5b.
- **2026-07-29** — Phase 3.5b (accessibility) — 2 mục đầu tiên: skip-to-content link +
  focus-trap sidebar mobile, cả hai đều sửa trong `Layout.astro` (layout dùng chung, áp
  dụng cho toàn bộ 20+ trang tool). (1) Thêm `<a href="#main-content">` ẩn bằng `sr-only`,
  hiện khi focus (`focus:not-sr-only` + style nổi bật), là phần tử đầu tiên trong `<body>`;
  `<main>` được gán `id="main-content" tabindex="-1"` để có thể nhận focus khi nhảy tới.
  Thêm key i18n dùng chung `nav.skipToContent` cho **cả 20 locale** trong `common.json`
  (không chỉ en/vi — vì đây là chuỗi điều hướng toàn site, đúng quy ước đã ghi ở log
  2026-07-28 khi thêm category `media`, không áp dụng ngoại lệ "chỉ en/vi" của tool mới).
  (2) Sidebar mobile off-canvas trước đây không có focus-trap và không trả focus khi đóng —
  đã thêm `getFocusable()` quét phần tử có thể focus trong `#sidebar`, khi mở tự focus vào
  phần tử đầu tiên, khi đóng (qua Escape/backdrop/click link/toggle) trả focus về nút
  `#sidebar-toggle` nếu sidebar đang thực sự mở (tránh cướp focus ngoài ý muốn ở desktop khi
  sidebar toggle không hề chạy), và bẫy phím Tab/Shift+Tab bên trong sidebar khi đang mở (ở
  desktop sidebar toggle bị ẩn `md:hidden` nên bẫy không kích hoạt, không ảnh hưởng hành vi
  desktop). Build sạch (421 trang) + test Puppeteer thật: xác nhận skip-link là Tab-stop đầu
  tiên và nhảy đúng tới `#main-content`; xác nhận mở sidebar mobile tự đưa focus vào bên
  trong, Shift+Tab từ phần tử đầu quay vòng về phần tử cuối (bẫy hoạt động), Escape đóng
  sidebar và trả focus đúng về nút hamburger. Đã tick 2 mục tương ứng trong `ROADMAP.md`
  Phase 3.5b.
- **2026-07-29** — Phase 3.5: xử lý rủi ro kỹ thuật thật ở Regex Tester (Phase 3 #3) —
  trước đây tính match bằng `useMemo` đồng bộ ngay trên main thread, không debounce, không
  timeout/guard, nên một pattern catastrophic-backtracking (vd. `(a+)+\1` với chuỗi dài) có
  thể treo cứng tab. Đã tách việc match/replace sang Web Worker riêng
  (`regexMatchWorker.ts`, cùng pattern với `audioEncodeWorker.ts`), debounce input 300ms,
  và đặt hard timeout 1500ms ở main thread: nếu worker không phản hồi kịp, `worker.terminate()`
  được gọi để giết luồng đang treo, hiện thông báo lỗi kèm gợi ý đơn giản hóa pattern (key
  i18n mới `timeoutError`), có label "Đang tính…" (`computingLabel`) trong lúc chờ. Dùng
  `requestId` tăng dần để bỏ qua response trễ khi người dùng gõ nhanh (tránh race condition).
  Test bằng script Puppeteer riêng ở scratchpad: (1) pattern bình thường vẫn khớp đúng, named
  group + replace preview vẫn hoạt động đúng, lỗi pattern sai vẫn hiện đúng; (2) xác minh trực
  tiếp cơ chế Worker + hard-timeout + terminate() bằng 1 trang HTML độc lập có worker chạy vòng
  lặp vô hạn thật sự — xác nhận main thread (đo bằng `requestAnimationFrame` tick) không bao
  giờ bị đứng dù worker đang treo, và bị terminate đúng ~1501ms như cấu hình 1500ms. Ghi chú:
  thử nhiều pattern ReDoS kinh điển (`^(a+)+$`, pattern có backreference dài) trực tiếp trên
  Chromium của Puppeteer nhưng đều không treo — V8 trong Chromium hiện đại có vẻ đã tối ưu/giảm
  thiểu một phần các trường hợp catastrophic backtracking phổ biến (khác biệt với Node.js độc
  lập, nơi cùng pattern vẫn đo được thời gian tăng theo cấp số nhân khi calibrate); guard vẫn
  giữ lại vì đây là phòng vệ đúng đắn, không phụ thuộc vào hành vi tối ưu hoá cụ thể của 1 phiên
  bản trình duyệt. Build sạch (421 trang). Đã tick mục tương ứng trong `ROADMAP.md` Phase 3.5a
  — hoàn tất toàn bộ 3.5a.
- **2026-07-29** — Phase 3.5: fix bug thật thứ 2 ở Audio Converter (Phase 3 #10) —
  `audioEncodeWorker.ts` dùng `Math.min(channels.length, 2)` ở cả `encodeMp3` và
  `encodeWav` để giới hạn về stereo, nhưng không có cảnh báo nào cho người dùng khi file
  gốc có nhiều hơn 2 kênh (5.1/7.1 surround) — các kênh dư bị bỏ qua âm thầm. Đã thêm kiểm
  tra `audioBuffer.numberOfChannels` ngay sau khi decode ở `AudioConverter.tsx`, hiển thị
  banner cảnh báo (màu amber, không phải destructive vì đây là cảnh báo chứ không phải lỗi
  chặn) nêu rõ số kênh gốc và việc chỉ giữ 2 kênh đầu. Thêm key i18n `channelDownmixWarning`
  cho en + vi. Build sạch (421 trang). Đã tick mục tương ứng trong `ROADMAP.md` Phase 3.5a.
- **2026-07-29** — Bắt đầu Phase 3.5 (Audit Remediation, xem `AUDIT.md`), task đầu tiên:
  fix bug thật ở JSON → Excel Converter (Phase 3 #7) — `handleDownload` khai báo state
  `downloadError` và render nó trong UI nhưng try/catch không có `catch` clause nào set
  giá trị, nên khi `exceljs` build workbook lỗi, người dùng chỉ thấy nút hết trạng thái
  "Generating..." mà không có bất kỳ thông báo lỗi nào (thất bại trong im lặng). Đã thêm
  `catch` set `downloadError` từ message lỗi thật, thêm key i18n `downloadError` cho
  en + vi. Build sạch (`npm run build`, 421 trang). Đã tick mục tương ứng trong
  `ROADMAP.md` Phase 3.5a.
- **2026-07-28** — Chuyển đổi Audio MP3 ↔ WAV (Phase 3 #10) hoàn tất — **Phase 3 HOÀN TẤT
  10/10 tool**. Giải mã MP3/WAV bằng Web Audio API có sẵn của trình duyệt (không cần thư
  viện), mã hóa MP3 bằng `@breezystack/lamejs`, mã hóa WAV tự viết RIFF header + PCM 16-bit;
  phần mã hóa chạy trong Web Worker riêng để không đứng UI. Tự động gợi ý định dạng đích
  (upload .mp3 → gợi ý WAV, upload .wav → gợi ý MP3), chọn bitrate khi xuất MP3
  (128/192/256/320 kbps), nghe thử gốc/kết quả, so sánh dung lượng. Vì cùng category `media`
  với Trim video ngắn (task trước), 2 tool này nay hiện related-tools của nhau, lấp khoảng
  trống đã ghi nhận ở log trước. Build sạch + test Puppeteer tương tác thật (tạo file WAV mẫu
  bằng OfflineAudioContext ngay trong Puppeteer, chuyển WAV→MP3 thật, dùng chính MP3 vừa tạo
  ra để test chiều MP3→WAV — round-trip đầy đủ qua engine thật, không mock, kiểm tra
  related-tools, ẩn/hiện bitrate theo định dạng, dark mode) + commit riêng, chỉ làm i18n
  en/vi theo quy ước hiện hành.
- **2026-07-28** — Trim video ngắn (Phase 3 #9) hoàn tất: cắt một đoạn video ngay trên trình
  duyệt bằng FFmpeg biên dịch WebAssembly (`@ffmpeg/ffmpeg` + `@ffmpeg/util`), chọn điểm bắt
  đầu/kết thúc bằng slider hoặc nút "lấy thời điểm hiện tại" từ video đang phát, 2 chế độ cắt
  (Nhanh — stream copy theo keyframe, tức thì; Chính xác — mã hóa lại, đúng từng khung hình
  nhưng chậm hơn), xem trước/tải kết quả, so sánh dung lượng và thời lượng gốc/đã cắt. Tạo
  category mới `media` trong `categories.ts` (dịch nhãn "Media" cho cả 20 ngôn ngữ trong
  `common.json`, vì đây là chuỗi điều hướng dùng chung toàn site chứ không phải file dịch
  riêng của 1 tool — không áp dụng quy ước "chỉ en/vi" cho phần này). Engine FFmpeg (~30.7MB)
  KHÔNG tự host trong repo (vượt giới hạn 25MiB/file của Cloudflare Pages cổ điển) — tải qua
  jsDelivr CDN lúc runtime, theo đúng lựa chọn người dùng đã chốt. Trong lúc build, phát hiện
  và sửa 2 bug thật khi tích hợp CDN (xem ghi chú kỹ thuật ở trên): (1) phải trỏ vào bản
  `dist/esm/` của `@ffmpeg/core` thay vì `dist/umd/` vì worker kiểu module không có
  `importScripts`; (2) không dùng tham số `progress` của `toBlobURL` vì gzip CDN làm lệch
  `Content-Length` gây crash "body stream already read". Build sạch + test Puppeteer tương
  tác thật (tạo video mẫu bằng canvas + MediaRecorder ngay trong Puppeteer, upload, cắt thật
  bằng ffmpeg.wasm qua CDN thật ở cả 2 chế độ, kiểm tra thời lượng kết quả, dark mode) + commit
  riêng, chỉ làm i18n en/vi cho namespace riêng của tool theo quy ước hiện hành. Ghi chú: trang
  tool này hiện có 0 "related tools" hiển thị vì category `media` mới chỉ có 1 tool — sẽ tự
  hết khi thêm Audio MP3 ↔ WAV ở task kế tiếp.
- **2026-07-28** — Markdown Viewer/Editor (Phase 3 #8) hoàn tất: soạn thảo Markdown với xem
  trước GFM trực tiếp (bảng, gạch ngang, task list), 3 chế độ xem (chia đôi/chỉ soạn
  thảo/chỉ xem trước) có cuộn đồng bộ ở chế độ chia đôi, thanh công cụ định dạng (đậm/nghiêng/
  tiêu đề/liên kết/hình/danh sách/trích dẫn/code/bảng/đường kẻ), kéo-thả file, đếm từ/ký tự,
  copy Markdown hoặc HTML, tải file `.md`/`.html`. Thêm dependency `marked` (parser GFM) +
  `dompurify` (lọc sạch HTML render ra trước khi hiển thị — bắt buộc vì tool này render HTML
  do người dùng nhập vào cùng trang, nếu không lọc sẽ là lỗ hổng XSS thật; đã test trực tiếp
  bằng payload `<script>`/`onerror` qua Puppeteer, xác nhận bị vô hiệu hóa hoàn toàn). Xếp
  vào category `text` (giống Text Diff/Word Counter/Text Case Converter) thay vì `dev`, vì
  đây là công cụ xử lý nội dung văn bản chứ không phải định dạng dữ liệu cho developer — dùng
  `applicationCategory: UtilitiesApplication` cho JSON-LD, khớp quy ước 3 tool `text` kia
  (không phải `DeveloperApplication` như các tool `dev`). Build sạch + test Puppeteer tương
  tác (render GFM, XSS payload, toolbar bold, toggle chế độ xem, copy, tải file, dark mode) +
  commit riêng, chỉ làm i18n en/vi theo quy ước hiện hành.
- **2026-07-28** — JSON → Excel Converter (Phase 3 #7) hoàn tất: chuyển JSON thành file
  `.xlsx` thật (không phải CSV đổi tên) — dòng tiêu đề in đậm, cột auto-size, giữ đúng kiểu
  số/boolean trong ô. Tự nhận diện nhiều sheet khi JSON gốc là object mà mọi giá trị cấp cao
  đều là mảng (mỗi khóa → 1 sheet); toggle gộp trường lồng nhau (dot notation); bảng xem
  trước số dòng/cột trước khi tải; tùy chỉnh tên sheet/tên file; kéo-thả file; báo lỗi JSON
  sai hoặc JSON không có gì để lập bảng. Thêm dependency `exceljs` thay vì `xlsx` (xem ghi
  chú kỹ thuật ở trên về lý do — `xlsx` trên npm có 2 lỗ hổng chưa vá, đã hỏi và được người
  dùng chọn `exceljs`). Build sạch + test Puppeteer tương tác (flatten on/off, multi-sheet,
  JSON lỗi, root primitive, tải file .xlsx thật kiểm tra kích thước, dark mode) + commit
  riêng, chỉ làm i18n en/vi theo quy ước hiện hành.
- **2026-07-28** — CSV ↔ JSON Converter (Phase 3 #6) hoàn tất: chuyển đổi hai chiều
  CSV↔JSON, chọn dấu phân cách (phẩy/chấm phẩy/tab/tùy chỉnh), toggle dòng tiêu đề/khóa
  lồng nhau (dot notation)/pretty-print, kéo-thả file, copy/download, báo lỗi inline kèm
  số dòng khi CSV sai định dạng. Thêm dependency `papaparse` (bộ phân tích CSV chuẩn RFC
  4180, thay vì tự viết parser hai chiều — code CSV cũ trong JsonFormatter chỉ một chiều
  JSON→CSV nên không tái dùng được cho chiều ngược lại). Build sạch + test Puppeteer tương
  tác (quote/comma/newline lồng nhau, CSV lỗi, JSON lồng nhau, đổi delimiter, toggle header,
  copy, download, kéo-thả, dark mode) + commit riêng, chỉ làm i18n en/vi theo quy ước hiện
  hành.
- **2026-07-27** — SVG Optimizer (Phase 3 #4) và Color Picker & Palette Generator
  (Phase 3 #5) hoàn tất, mỗi tool đã build sạch + test Puppeteer tương tác + commit riêng.
  Color Picker phát hiện & sửa bug hydration mismatch (xem ghi chú kỹ thuật ở trên). Từ tool
  này trở đi chỉ làm i18n `en`/`vi` theo yêu cầu người dùng.
- **2026-07-26** — Phase 3 #1–3 (JWT Decoder, Base64 Encode/Decode, Regex Tester) hoàn tất.
  Regex Tester từng bị gián đoạn giữa chừng ở 1 phiên trước, đã hoàn tất dứt điểm ở phiên
  sau đó (kèm sửa 1 bug logic thật: highlight sai vị trí với match độ dài 0, ví dụ pattern
  `\b` hoặc `x*`).
- **2026-07-26** — Mở rộng i18n từ 8 lên 20 ngôn ngữ, viết lại meta title/description SEO,
  soát JSON-LD, viết nội dung SEO 300–500 từ/tool/ngôn ngữ, dựng internal linking map, audit
  Core Web Vitals toàn site (Phase 2, 6/8 mục — 2 mục submit sitemap còn treo vì thiếu domain
  thật). Phát hiện & sửa 1 bug hạ tầng thật: thiếu `lowerCaseLng: true` khiến toàn bộ trang
  `zh-tw` render nhầm sang nội dung `zh`.
- **2026-07-25** — QA audit toàn site theo yêu cầu trực tiếp người dùng (không phải task
  ROADMAP): kiểm tra layout dùng chung + cả 10 tool + responsive/dark mode. Tìm và sửa 9
  bug/gap thật (1 Critical, còn lại High/Medium), mỗi phần build + test Puppeteer + commit
  riêng.
- **2026-07-25** — Redesign giao diện toàn site theo yêu cầu trực tiếp người dùng (không
  phải task ROADMAP): font Space Grotesk + JetBrains Mono tự host, bảng màu emerald đạt
  WCAG AA, privacy bar, sidebar badge hue-rotate, trang chủ có tìm kiếm lọc tool bằng JS
  thuần.
- **2026-07-24 → 2026-07-25** — Phase 1 (10 công cụ cốt lõi) và Phase 1.5 (nâng cấp feature
  parity so với đối thủ đầu ngành mỗi tool) hoàn tất. Tool #8 (JSON Formatter) chọn
  `jsoneditor` bản minimalist thay vì Monaco (nhẹ hơn, đủ dùng). Còn treo: nén PDF cho
  Gộp/Tách PDF (chưa làm, không phải lỗi chặn).
- **Trước đó** — Phase 0: khởi tạo Astro + Tailwind + Shadcn/UI, đổi từ `astro-i18next`
  sang i18n routing native + i18next thuần, dựng layout chung, sitemap/robots.txt, CI/CD
  Cloudflare Pages.

> Muốn xem chi tiết đầy đủ (từng bug, từng bước test, từng quyết định nhỏ) của bất kỳ mốc
> nào ở trên: `git log --oneline -- PROGRESS.md` rồi `git show <commit>:PROGRESS.md` để lấy
> lại bản đầy đủ tại thời điểm đó.
