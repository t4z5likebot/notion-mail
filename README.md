# Notion 套餐到期提醒系统（Notion + Resend + GitHub Actions）

本项目实现了一个完整的 **自动化套餐到期提醒系统**，功能包括：

- 从 Notion 数据库读取用户套餐信息  
- 自动判断距离到期天数  
- 到期前 7 天发送提醒邮件  
- 自动更新 Notion 状态字段  
- 支持 Resend 真实邮件发送  
- 支持 GitHub Actions 定时执行（每天中午 12:00 上海时间）  
- 代码无服务器依赖，可跑在本地 / Linux / GitHub Actions  

---

## 📌 目录结构

```
/renewal-check.mjs     —— 主脚本：读取 Notion → 判断 → 发邮件 → 更新状态
/.github/workflows/renewal.yml   —— GitHub Actions 自动化工作流
README.md              —— 使用说明
```

---

# 🚀 功能说明

系统将自动从 Notion 数据库读取以下字段：

| 字段名 | 类型 | 必需 | 说明 |
|--------|------|------|------|
| 咸鱼用户名称 | title | 是 | 用户名 |
| 邮箱地址 | email | 是 | 用于发送提醒邮件 |
| 状态 | select | 是 | 使用中 / 已提醒 / 已到期 |
| 开始时间 | date | 否 | 展示用 |
| 结束时间 | date | 是 | 到期判断依据 |

### 系统行为规则：

### 1️⃣ 状态 = **使用中** 且距离到期 **正好 7 天**
- 发送提醒邮件  
- 状态自动改为 **已提醒**

### 2️⃣ 状态 = **已提醒**
- 不再重复提醒  
- 除非管理员将状态手动改回“使用中”

### 3️⃣ 差 < 7 天但未到期
- 不发送邮件（按规则只提醒一次）  
- 控制台输出提示，供人工检查

### 4️⃣ 已过期（结束时间 < 今天）
- 自动更新状态为 **已到期**

所有“今天”的计算均基于 **Asia/Shanghai（中国时区）**。

---

# 📚 环境变量

脚本依赖以下三个环境变量，请正确配置：

| 环境变量名 | 描述 |
|------------|------|
| `NOTION_API_KEY` | Notion 内部集成密钥 |
| `NOTION_DATABASE_ID` | 你的数据库 ID（32 字符）|
| `RESEND_API_KEY` | Resend 的 API Key，用于真实邮件发送 |

在 Linux 中可以这样设置：

```bash
export NOTION_API_KEY="secret_xxx"
export NOTION_DATABASE_ID="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export RESEND_API_KEY="re_xxx"
```

---

# 🧪 本地运行方式

确保 Node.js ≥ 20：

```bash
node renewal-check.mjs
```

运行后会自动：

- 读取 Notion  
- 判断到期逻辑  
- 发邮件（如果满足条件）  
- 更新 Notion 状态  

---

# ☁️ GitHub Actions 自动化

本项目附带 `renewal.yml` 工作流，可自动在每天 **上海时间中午 12:00** 运行。

GitHub Actions 使用的是 **UTC 时间**，因此 cron 表达式如下：

```yaml
cron: "0 4 * * *"   # 04:00 UTC = 12:00 Asia/Shanghai
```

将 `NOTION_API_KEY`、`NOTION_DATABASE_ID`、`RESEND_API_KEY` 添加为仓库 Secrets：

```
Settings → Secrets → Actions → New repository secret
```

然后 workflow 会自动读取这些变量执行脚本。

---

# ✨ 工作流文件示例（renewal.yml）

```yaml
name: Notion Renewal Reminder

on:
  schedule:
    - cron: "0 4 * * *"  # 上海时间中午 12 点
  workflow_dispatch: {}

jobs:
  run-reminder:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run reminder script
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
        run: node renewal-check.mjs
```

---

# 🔧 管理员日常操作

管理员在 Notion 中只需要：

### 当用户购买续期时：

1. 修改 **结束时间** 为新的时间  
2. 修改 **状态 → 使用中**

系统会自动在「新的到期日 - 7 天」发送下一次提醒。

---

# 📩 邮件模板

模板位于脚本中的：

```js
html: `
  <p>您好，${displayName}：</p>
  <p>您的套餐将于 <b>${endDate}</b> 到期。</p>
  <p>如需续期，请尽快联系客服或进入购买页面。</p>
  <p>感谢您的使用！</p>
`,
```

需要修改文案可以直接编辑这里。

---

# ❤️ 支持客户定制逻辑

如果你需要扩展：

- 到期前多次提醒（如 7 天、3 天、当天）
- 支持多产品或多套餐周期
- 添加管理员提醒
- 支持多语言模板
- 推送到 Telegram / 企业微信 / Slack
- 使用队列避免重复执行

我都可以继续帮你升级系统。

---

# 🎉 完成！

你现在已经拥有一个：

- 稳定  
- 自动化  
- 可扩展  
- 兼容时区  
- 真实邮件发送  
- 完全无服务器依赖  

的现代化到期提醒系统。

如需进一步改进，随时喊我！
