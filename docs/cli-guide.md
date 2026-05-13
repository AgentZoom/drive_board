# Drive Board CLI 使用指南

`drive-board` 给 Agent 和自动化脚本使用。网页端使用账号密码登录，CLI 使用 Bearer Token。

## 命令结构

```bash
drive-board [全局参数] <命令组> <命令> [命令参数]
```

全局参数放在 `drive-board` 后、命令组前：

```bash
drive-board --server http://127.0.0.1:8362 --token main-agent-token whoami
drive-board --token main-agent-token --format json files list main-agent
```

也可以通过环境变量配置：

```bash
export DRIVE_BOARD_SERVER="http://127.0.0.1:8362"
export DRIVE_BOARD_TOKEN="main-agent-token"
export DRIVE_BOARD_FORMAT="json"
```

| 全局参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--server` | `DRIVE_BOARD_SERVER` 或 `http://127.0.0.1:8362` | 服务地址 |
| `--token` | `DRIVE_BOARD_TOKEN` | Agent 或自动化 token |
| `--format`, `-f` | `DRIVE_BOARD_FORMAT` 或 `table` | `table`、`json`、`jsonl` |

## 启动服务

```bash
drive-board serve --host 127.0.0.1 --port 8362
```

本地数据默认写入 `./data`，可用 `--data-dir` 或 `DRIVE_BOARD_DATA_DIR` 调整：

```bash
drive-board serve --port 8362 --data-dir ./local-drive-data
```

首次启动会创建 demo 身份：

| 身份 | 登录或 Token |
| --- | --- |
| `user:admin` | 网页账号 `admin`，密码 `admin` |
| `user:huangshiyu` | 网页账号 `huangshiyu`，密码 `huangshiyu` |
| `agent:main-agent` | `main-agent-token` |
| `agent:cli-agent` | `cli-agent-token` |

## 身份与成员

```bash
drive-board --token main-agent-token whoami --format json
drive-board --token main-agent-token actors list
drive-board --token main-agent-token actors list --type agent --format jsonl
```

## Workspace

每个用户和 Agent 都有自己的 private workspace。用户也可以创建 `share_group` workspace，并给成员分配 `read`、`write` 或 `owner` 权限。

```bash
drive-board --token main-agent-token workspaces list
drive-board --token main-agent-token workspaces create-group --name research-team
drive-board --token main-agent-token workspaces add-member research-team --actor agent:cli-agent --permission write
drive-board --token main-agent-token workspaces members research-team
```

## 文件和文件夹

路径使用 workspace 内的相对路径。比如 workspace 为 `huangshiyu`，文件路径可以是 `a.pdf` 或 `test_dir/b.pdf`。

```bash
drive-board --token main-agent-token files list main-agent
drive-board --token main-agent-token files mkdir main-agent reports
drive-board --token main-agent-token files upload main-agent ./a.pdf --path reports
drive-board --token main-agent-token files download main-agent reports/a.pdf --output ./a.pdf
drive-board --token main-agent-token files cat main-agent notes/readme.md
drive-board --token main-agent-token files write main-agent notes/readme.md --file ./readme.md
cat ./readme.md | drive-board --token main-agent-token files write main-agent notes/readme.md --stdin
drive-board --token main-agent-token files delete main-agent reports/a.pdf
```

## 分享

文件和文件夹可以直接分享给人类用户或 Agent。分享文件夹时，目标对象可以访问该文件夹下的子文件；如果分享的是 `test_html` 文件夹，那么 `/preview/<workspace>/test_html/index.html` 中的 `./style.css` 也能通过同一权限读取。

```bash
drive-board --token main-agent-token shares add main-agent reports --actor agent:cli-agent --permission read
drive-board --token main-agent-token shares list main-agent --path reports
drive-board --token cli-agent-token shares shared --format json
```

## 预览 URL

```bash
drive-board --token main-agent-token files preview-url main-agent test_html/index.html
```

HTML 预览通过 `/preview/{workspace}/{path}` 服务原文件，不重写相对路径。因此 `index.html` 内引用 `./style.css`、`./app.js`、`../image.png` 等资源时，浏览器会继续请求 `/preview/{workspace}/...` 下的对应路径，并复用同一套权限检查。
