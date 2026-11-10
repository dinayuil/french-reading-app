# 法语阅读练习（应用）

React + TypeScript + Vite 的纯静态阅读练习 App。应用代码与文章内容分离：内容在独立的公开仓库 `french-reading-content-public`，应用在运行时拉取。

- 应用仓库：<https://github.com/dinayuil/french-reading-app>
- 内容仓库：<https://github.com/dinayuil/french-reading-content-public>
- 流水线与原文：私有仓库 `french-reading-content-private`（不公开）

## 内容如何加载

生产构建默认从 `https://blog.yosorano.cc/french-reading-content-public/` 拉取：

```text
manifest.json → months/<YYYY-MM>.json → articles/<id>.json
```

地址由构建时的 `VITE_CONTENT_BASE_URL` 决定，见 `.env.production`。本地开发不需要这个变量：`vite.config.ts` 里的小中间件把 `/data/*` 映射到同级的 `../content-public/`。

```text
french-reading-practice/
├─ app/              ← 本仓库
├─ content-public/   ← 开发时读取的公开内容
├─ content-private/  ← 流水线与原文（私有）
└─ manager/          ← 项目文档与进度
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

## 许可边界

- 文章文本按 CC BY-SA 4.0 发布，逐篇署名与来源在文章 JSON 的 `source` / `adaptation` / `license` 中。
- 应用代码 © 作者，保留所有权利；本仓库公开可见，但不构成开源许可。
- 本仓库不包含原文，也不包含内部设计文档。
