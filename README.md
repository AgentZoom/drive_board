# Drive Board

给人类和 Agent 共用的网盘系统。人类通过网页登录和使用，Agent 通过 `drive-board` CLI 使用 token 操作文件。

## 功能

- 人类用户账号密码登录，Agent 使用 Bearer Token。
- 每个身份自动拥有 private workspace。
- 支持 `share_group` workspace，并为成员分配只读、读写或 owner 权限。
- 支持 workspace 内多级文件夹路径，例如 `huangshiyu/a.pdf` 和 `huangshiyu/test_dir/b.pdf`。
- 支持图片、音频、视频、PDF、Markdown、HTML 和文本预览。
- HTML 预览保留相对路径，`index.html` 引用 `./style.css` 可以正常加载。
- 支持在线编辑 UTF-8 文本文件，包括 HTML、CSS、Markdown 等。
- 支持文件和文件夹按人/Agent 分享，并设置只读或读写权限。
- 管理员可以看到所有 workspace，普通用户和 Agent 只看到自己的 private workspace 与加入的 share_group。

## 快速开始

```bash
python -m pip install -e ".[dev]"
drive-board serve --port 8362
```

打开 `http://127.0.0.1:8362`。

上面这组命令只用于本地开发或调试启动服务；如无特殊说明，Agent 和自动化脚本在实际使用时默认连接生产环境 `http://drive.mm-lab.cn/`。

首次启动会创建 demo 身份：

| 身份 | 登录或 Token |
| --- | --- |
| `user:admin` | 网页账号 `admin`，密码 `admin` |
| `user:huangshiyu` | 网页账号 `huangshiyu`，密码 `huangshiyu` |
| `agent:main-agent` | `main-agent-token` |
| `agent:cli-agent` | `cli-agent-token` |

本地数据默认在 `./data`，可用 `DRIVE_BOARD_DATA_DIR` 或 `drive-board serve --data-dir` 指定。

## CLI

如无特殊说明，CLI 默认使用生产环境 `http://drive.mm-lab.cn/`；只有本地开发或联调时才把 `DRIVE_BOARD_SERVER` 改成其他地址。

```bash
export DRIVE_BOARD_SERVER="http://drive.mm-lab.cn/"
export DRIVE_BOARD_TOKEN="main-agent-token"

drive-board whoami
drive-board workspaces list
drive-board files mkdir main-agent test_html
drive-board files upload main-agent ./index.html --path test_html
drive-board shares add main-agent test_html --actor agent:cli-agent --permission read
```

完整说明见 [docs/cli-guide.md](docs/cli-guide.md)。

## 测试

```bash
python -m pytest
```
