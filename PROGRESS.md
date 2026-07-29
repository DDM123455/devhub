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
  Converter đã hiển thị lẫn nhau, không còn khoảng trống. Task tiếp theo: chọn 1 hạng mục ở
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
