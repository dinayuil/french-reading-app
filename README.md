# 法语阅读练习（应用）

React + TypeScript + Vite 的纯静态阅读练习 App。应用代码与文章内容分离：内容在独立的公开仓库 `french-reading-content-public`，应用在运行时拉取。

- 应用仓库：<https://github.com/dinayuil/french-reading-app>
- 内容仓库：<https://github.com/dinayuil/french-reading-content-public>

## 内容如何加载

生产构建默认从 GitHub raw 拉取：

```text
https://raw.githubusercontent.com/dinayuil/french-reading-content-public/main/
  manifest.json → days/<YYYY-MM-DD>.json → articles/<id>.json
```

`manifest.json` 只有日期清单；`days/<YYYY-MM-DD>.json` 是该日文章的元数据索引，文章正文仍在打开阅读页时下载。不再维护月份索引。

`content-public` 只是数据仓库，不部署、不启用 Pages；只有本仓库有 Pages。
地址由构建时的 `VITE_CONTENT_BASE_URL` 决定，见 `.env.production`。本地开发不需要这个变量：`vite.config.ts` 里的小中间件把 `/data/*` 映射到同级的 `../content-public/`。

## 首页日期筛选与加载

首页默认显示近 3 天（含用户本地日期的今天，不含未来），可切换近 7 天、近 30 天；默认最新在前，也可最早在前。A2/B1/B2/全部等级筛选作用于所选日期范围，某一天没有匹配等级时会继续检查后面的日期。

加载按天进行：先取 manifest 的日期清单，再按当前排序逐日请求 `days/<date>.json`。首屏先显示一行卡片（手机上为一张），只有列表末尾接近视口时才补下一行或请求下一天；大屏会在列表未填满时自动补充，但列表末尾已离开视口时不会预渲染看不到的卡片。当前等级在所有已加载日期都没有匹配时，会自动继续检查后续日期，直到出现第一张卡片或日期范围用完，不需要手动点击。请求失败时保留已显示的卡片并停住，只重试失败的那一天；列表底部同时提供「Afficher plus d'articles」按钮，供不支持滚动观察的环境使用。

日期范围和排序依据日索引的 `date`（本站发布日），不是原文的 `source.publishedAt`。切换筛选、范围或排序会重置列表并忽略旧请求的返回。

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
