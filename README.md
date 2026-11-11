# 法语阅读练习（应用）

React + TypeScript + Vite 的纯静态阅读练习 App。应用代码与文章内容分离：内容在独立的公开仓库 `french-reading-content-public`，应用在运行时拉取。

- 应用仓库：<https://github.com/dinayuil/french-reading-app>
- 内容仓库：<https://github.com/dinayuil/french-reading-content-public>

## 内容如何加载

生产构建默认从 GitHub raw 拉取：

```text
https://raw.githubusercontent.com/dinayuil/french-reading-content-public/main/
  manifest.json → months/<YYYY-MM>.json → articles/<id>.json
```

`content-public` 只是数据仓库，不部署、不启用 Pages；只有本仓库有 Pages。
地址由构建时的 `VITE_CONTENT_BASE_URL` 决定，见 `.env.production`。本地开发不需要这个变量：`vite.config.ts` 里的小中间件把 `/data/*` 映射到同级的 `../content-public/`。

```text
french-reading-practice/
├─ app/              ← 本仓库
├─ content-public/   ← 开发时读取的公开内容
├─ content-private/  ← 流水线与原文（私有）
└─ 根目录/           ← manager 文档与状态
```

单独克隆本仓库时，开发需要一个同级 `content-public/`，或设置 `VITE_CONTENT_BASE_URL` 指向线上内容。

## 命令

```powershell
npm ci
npm run dev       # 读取 ../content-public
npm test
npm run build     # 生产构建，内容地址来自 .env.production
npm run preview
```

## 选中文本翻译

阅读页（以及交卷后的练习页）选中一段法语文字后会出现翻译浮条，查询走第三方服务 **MyMemory**：

```text
GET https://api.mymemory.translated.net/get?q=<选中文本>&langpair=fr|zh-CN
```

- 实现在 `src/lib/dictionary.ts` 的 `lookupFrToZh()`：无 API key，8 秒 `AbortController` 超时；网络错误、非 2xx、空结果都静默返回 `null`，界面显示「翻译查询失败」，不阻塞阅读。
- 固定 **法语 → 简体中文**，与界面语言无关（中文是独立翻译层）。
- **隐私**：选中的文字会离开浏览器发送给 MyMemory；本地存储（`frp:` 前缀）只保存设置、答题记录和标记生词。帮助页「数据」段向读者披露了这一点。
- 已知限制：无 key 的公共端点有速率限制、译文质量不稳定；浮条位置只在桌面 Chromium 验证，移动端长按选词待真机验证。更换服务时改 `dictionary.ts`，并同步本节与帮助页文案。

## 许可边界

- 文章文本按 CC BY-SA 4.0 发布，逐篇署名与来源在文章 JSON 的 `source` / `adaptation` / `license` 中。
- 应用代码 © 作者，保留所有权利；本仓库公开可见，但不构成开源许可。
- 本仓库不包含原文，也不包含内部设计文档。
