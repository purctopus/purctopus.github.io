# 绿帽社

原站：<https://greenhat.wikidot.com/>  
GitHub Pages：<https://purctopus.github.io/>

本仓库将 Wikidot 可公开访问的页面转换为静态网页，保留页面正文、原主题、导航、署名和许可说明。页面中的图片与 CSS 依赖尽量下载到 `assets/`，正文链接转换为本地目录地址；分类名称中的冒号转换为目录分隔符。

## 使用

仓库根目录可直接部署到 GitHub Pages。Pages 来源选择 `main` 分支和根目录 `/ (root)`。`.nojekyll` 禁用 Jekyll 转换。

本地预览：`node scripts/serve.mjs`，打开 <http://127.0.0.1:4173/>。

重新迁移：安装 Node.js 后运行 `npm ci`、`npm run migrate`、`npm run check`。下载缓存位于 `.migration-cache/`，不会提交到 Git。需要刷新原站内容时，应先移除对应缓存或使用一个新的缓存目录。重新迁移会覆盖生成的 HTML；长期编辑前请先备份改动。

## 范围与限制

- `migration-report.json` 列出已迁移页面、下载失败及保留在原站的链接。
- 搜索、折叠块和分页签在静态页面上运行。
- 只迁移档案；移除账户登录、加入、论坛、在线编辑、评分及管理入口。
- 页面历史版本、账号数据、未公开页面、未被引用的附件以及已删除分类不在本次公开页面迁移范围内。
- 原文中的外部链接和第三方嵌入仍需要联网。未下载成功的资源保留原始地址。
- 正文的原许可与作者署名沿用原站标注；原始内容不因迁移而改变授权。
