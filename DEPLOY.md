# Trace Planner · 部署到 GitHub（维护者手册）

面向 **仓库维护者**：把静态页面发布成公网可访问的网站，**不需要购买服务器**。  
用户使用说明请看根目录的 [`README.md`](README.md)。

---

## 你需要准备什么？

- 一个 GitHub 账号  
- 本仓库已包含：`Trace_planner.html`（主程序）、`index.html`（根路径跳转）、`.github/workflows/pages.yml`（自动发布）、`.nojekyll`（避免 Jekyll 处理）

---

## 一、把代码放到 GitHub 上

### 情况 A：还没有远程仓库

1. 在 GitHub 网页点 **New repository**，建一个空仓库（例如 `trace_planner`）。  
2. 在你电脑上的项目目录执行（把地址换成你的）：

```bash
git init
git add Trace_planner.html index.html README.md LICENSE DEPLOY.md .gitignore .nojekyll .github
git commit -m "Initial site"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

### 情况 B：已有仓库，本地有未推送的提交

若 `git push` 提示被拒绝，先同步远程再推：

```bash
git pull --rebase origin main
git push origin main
```

---

## 二、开启 GitHub Pages（用 GitHub Actions 发布）

1. 打开仓库页 → **Settings**（设置）。  
2. 左侧点 **Pages**。  
3. 在 **Build and deployment** 里：  
   - **Source** 选择 **GitHub Actions**（不要选「Deploy from a branch」的旧方式，除非你刻意不用 workflow）。  
4. 回到 **Code** 标签 → **Actions**，确认 **Deploy GitHub Pages** 工作流存在。  
5. 对 `main` 做一次推送，或打开该 workflow 点 **Run workflow**，等待运行成功（绿色勾）。

成功后，**Settings → Pages** 里会出现 **Visit site** 或类似链接。  
一般地址为：

`https://<用户名>.github.io/<仓库名>/`

首页 `index.html` 会自动跳转到 `Trace_planner.html`。

---

## 三、发布失败时怎么查？

| 现象 | 建议 |
|------|------|
| Actions 里红色失败 | 点开最新一次运行，看报错日志（常见是权限未开） |
| Pages 设置里 Source 不是 Actions | 改回 **GitHub Actions** 并重新跑 workflow |
| 打开站点 404 | 等 1～3 分钟；确认默认分支是 `main` 且 workflow 已成功 |
| 样式/地图空白 | 检查是否被浏览器扩展拦截；换网络（部分 CDN 在国内较慢） |

首次使用 Pages + Actions 时，若提示权限，按 GitHub 引导在 **Settings → Actions → General** 里允许 **Read and write**，并确保 **Pages** 的写入权限已开启（界面会提示）。

---

## 四、更新网站内容

修改 `Trace_planner.html` 等文件后：

```bash
git add .
git commit -m "Update site"
git push origin main
```

Actions 会自动重新部署；通常 1 分钟内生效。

---

## 五、要不要开源 HTML？

- **公开仓库 + MIT**：任何人可看源码，符合常见开源习惯。  
- **私有仓库**：代码不对外公开；GitHub **免费账号** 对私有仓库的 Pages 策略可能变化，请以 [GitHub 官方文档](https://docs.github.com/pages) 为准。  
- **仅发布构建产物**：也可以另建一个 **仅含静态文件** 的公开仓库专门做 Pages，主代码仓库保持私有（进阶做法，此处不展开）。

**结论：** 最简单、免费、文档最多的是 **公开仓库 + GitHub Pages**。

---

## 六、自定义域名（可选）

1. 在你的 DNS 服务商添加 **CNAME**，指向 `<用户名>.github.io`（具体记录值以 GitHub Pages 设置页说明为准）。  
2. 仓库 **Settings → Pages → Custom domain** 填入你的域名。  
3. 等待 DNS 生效（可能数分钟到数小时）。

---

## 七、与本手册配套的仓库文件

| 文件 | 作用 |
|------|------|
| `Trace_planner.html` | 主应用 |
| `index.html` | 根路径跳转，方便分享短链接 |
| `.nojekyll` | 禁用 Jekyll，避免奇怪解析 |
| `.github/workflows/pages.yml` | 推送 `main` 时自动部署 Pages |
| `README.md` | 给 **最终用户** 看的介绍与手册 |

维护者改完代码记得 **push**；用户侧 **无需下载 HTML**，只要收藏 Pages 网址即可。
