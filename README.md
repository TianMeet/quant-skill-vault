# Quant Skill Vault

量化技能库 — 管理和导出 Claude Code Skills 合规技能包。

## 技术栈

- Next.js 16 (App Router) + TypeScript
- TailwindCSS + shadcn/ui
- Prisma 5 + MySQL
- Zod 校验
- archiver (ZIP 导出)
- js-yaml (YAML frontmatter)
- Vitest (单元/API 测试) + Playwright (E2E)

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动 MySQL

```bash
pnpm db:up
# 等待 MySQL 就绪 (~10s)
```

### 3. 数据库迁移 & Seed

```bash
pnpm db:push
pnpm db:seed
```

如果你使用本地 MySQL（非 Docker），请使用：

```bash
pnpm db:generate:local
pnpm db:push:local
pnpm db:seed
```

### 4. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000

## 测试

### 运行全部测试（单元 + API）

```bash
pnpm test
```

### 分类运行

```bash
pnpm test:unit    # 纯函数层：slugify, lint, markdown
pnpm test:api     # API Route Handler 测试
pnpm test:e2e     # Playwright E2E（需要先启动 dev server + MySQL）
```

### E2E 测试

```bash
# 确保 MySQL 已启动且数据库已迁移
pnpm db:up && pnpm db:push

# 安装 Playwright 浏览器
npx playwright install chromium

# 运行 E2E
pnpm test:e2e
```

## 导出验证

### 通过 API 验证导出 ZIP

```bash
# 假设 skill id = 1
curl -o skill.zip http://localhost:3000/api/skills/1/export.zip
unzip -l skill.zip
# 应包含: <slug>/SKILL.md

unzip -p skill.zip "*/SKILL.md" | head -20
# 应包含 YAML frontmatter: name, description (以 "This skill should be used when" 开头)
```

### 通过 API 验证 Markdown 导出

```bash
curl http://localhost:3000/api/skills/1/export.md
```

### 通过 API 验证 JSON 导出

```bash
curl http://localhost:3000/api/skills/1/export.json | jq .
```

### Lint 不通过时的行为

导出接口会返回 400 + errors 数组：

```bash
# 创建一个不合规的 skill 后尝试导出
curl -v http://localhost:3000/api/skills/<id>/export.zip
# 返回 400 + { error: "Lint failed", errors: [...] }
```

## AI Tab（Claude CLI 集成）

编辑页新增 AI Tab，可调用本机 Claude CLI 生成/修改 Skill 内容和 supporting files。

### 前置条件

1. 安装 Claude Code CLI 并验证：
```bash
claude -v
```

2. 在 `.env` 中配置（可选，均有默认值）：
```
CLAUDE_BIN=claude          # Claude 可执行文件路径
CLAUDE_MODEL=sonnet        # 模型选择
CLAUDE_MAX_TURNS=3         # 最大轮次
CLAUDE_MAX_BUDGET_USD=1    # 单次预算上限
CLAUDE_TIMEOUT_MS=60000    # 超时时间
```

### 使用方式

1. 进入 Skill 编辑页，切换到 AI Tab
2. 可选填写 instruction（自然语言指令）
3. 点击按钮：
   - **Improve** — 优化 Skill 内容
   - **Fix Lint** — 自动修复 lint 错误
   - **Generate Supporting Files** — 生成参考文件
4. 预览变更（字段 patch + 文件列表 + lint 状态）
5. 点击 Apply 写入数据库

### 安全策略

- Claude 以 headless print 模式运行，禁用所有内置工具（`--tools ""`）
- 使用 `spawn(command, args, {shell:false})` 防止命令注入
- Path Gate：fileOps 仅允许 `references/`、`examples/`、`scripts/`、`assets/`、`templates/` 目录
- 禁止修改 SKILL.md（由系统自动生成）
- Prompt 长度限制 8KB，单文件 200KB

## 对话式创建（新建页）

新建页默认采用“对话主导 + 表单微调”的流程：右侧对话框边聊边生成，左侧表单实时回填。

### Chat Provider 配置

`/api/chat` 支持两种 provider：

- `CHAT_PROVIDER=mock`：本地 mock 流式事件，不依赖外网/Key（推荐本地开发与测试）
- `CHAT_PROVIDER=anthropic`：走 Anthropic Messages API（需要 `ANTHROPIC_API_KEY`）

无 Key 或不在同网段时，使用：

```bash
CHAT_PROVIDER=mock
```

## 本地 Skill Creator 工作流（参考 Anthropic 官方）

参考实现：<https://github.com/anthropics/skills/tree/main/skills/skill-creator>

本项目新增了本地脚手架/校验/打包流程，便于在仓库外或导入前先本地整理 Skill：

### 1) 初始化 Skill 目录

```bash
pnpm skill:init -- my-new-skill ./local-skills
```

会生成：
- `local-skills/my-new-skill/SKILL.md`
- `references/`, `examples/`, `scripts/`, `assets/`, `templates/`

### 2) 快速校验

```bash
pnpm skill:validate -- ./local-skills/my-new-skill
```

校验内容包括：
- frontmatter 必填字段（`name`, `description`）
- `name` 格式（`^[a-z0-9-]{1,64}$`）
- `description` 长度（<= 1024）
- 相对链接文件存在性与路径安全性

### 3) 打包为 `.skill`

```bash
pnpm skill:package -- ./local-skills/my-new-skill
```

输出示例：`./local-skills/my-new-skill.skill`

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── skills/          # CRUD + 导出
│   │   ├── tags/            # 标签管理
│   │   └── lint/            # 客户端 lint 校验
│   └── skills/              # 页面路由
│       ├── page.tsx         # 列表页
│       ├── new/page.tsx     # 新建页
│       └── [id]/
│           ├── page.tsx     # 详情页
│           └── edit/page.tsx # 编辑页
├── components/              # UI 组件
├── lib/
│   ├── slugify.ts           # Slug 生成
│   ├── lint.ts              # Lint Gate 校验
│   ├── markdown.ts          # SKILL.md 渲染
│   ├── prisma.ts            # Prisma 客户端
│   ├── types.ts             # 类型定义
│   └── zod-schemas.ts       # Zod 校验 schema
e2e/                         # Playwright E2E 测试
prisma/
├── schema.prisma            # 数据模型
└── seed.ts                  # 种子数据
```

## 环境变量

复制 `.env.example` 为 `.env` 并按需修改：

```bash
cp .env.example .env
```

## Scripts

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm db:up` | 启动 MySQL (Docker) |
| `pnpm db:push` | 推送 schema 到数据库 |
| `pnpm db:generate:local` | 使用 `.env.local` 生成 Prisma Client |
| `pnpm db:push:local` | 使用 `.env.local` 推送 schema 到本地数据库 |
| `pnpm db:migrate:local:create -- <name>` | 生成本地迁移文件（不立即执行） |
| `pnpm db:migrate:local:apply` | 执行本地迁移 |
| `pnpm db:check:migration` | 校验 schema 变更是否包含 migrations 变更 |
| `pnpm db:seed` | 填充示例数据 |
| `pnpm test` | 运行全部测试 |
| `pnpm test:unit` | 运行单元测试 |
| `pnpm test:api` | 运行 API 测试 |
| `pnpm test:e2e` | 运行 E2E 测试 |
| `pnpm skill:init -- <name> [dir]` | 初始化本地 Skill 目录（官方 skill-creator 风格） |
| `pnpm skill:validate -- <skillDir>` | 校验本地 Skill（frontmatter + 链接 + 结构） |
| `pnpm skill:package -- <skillDir> [outputDir]` | 打包为 `.skill` 文件 |
