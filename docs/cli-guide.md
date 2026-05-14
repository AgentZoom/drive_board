# Drive Board CLI 使用指南

`drive-board` 给 Agent 和自动化脚本调用已存在的 Drive Board 服务使用。本指南只覆盖远程调用型 CLI 命令，不覆盖网站或服务启动方式。

CLI 统一通过 Bearer Token 鉴权，不使用网页端账号密码登录流程。

如无特殊说明，本仓库里的 Agent 和自动化脚本默认都连接生产环境 `http://drive.mm-lab.cn`；只有本地开发、联调或临时验证时才改到其他地址。

## Agent 快速规则

1. 全局参数必须放在 `drive-board` 后、具体命令前，不要写在子命令后面。
2. 给 Agent 用时，默认优先 `--format json`；只有明确需要逐行流式处理时才用 `--format jsonl`。
3. `workspace` 是工作区名，`path` 是工作区内相对路径；不要写前导 `/`。
4. 涉及成员或分享对象时，`actor_id` 必须带前缀，格式是 `user:<username>` 或 `agent:<name>`。
5. `workspaces add-member` 的 `--permission` 允许值是 `read`、`write`、`owner`。
6. `shares add` 的 `--permission` 允许值是 `read`、`write`。
7. `files write` 和 `files append` 都必须二选一传入 `--file` 或 `--stdin`，不能两个都传，也不能两个都不传。
8. 文件操作优先使用 Linux 风格命名：`files ls`、`files rm`、`files cp`、`files mv`；旧的 `files list`、`files delete` 仍然可用，但更推荐前者。
9. `files upload --path` 为空时上传到根目录；以 `/` 结尾时表示目标目录；不以 `/` 结尾时表示最终远端文件路径。
10. `files preview-url` 只是本地拼接 URL，不会向服务端发请求，也不会预先验证文件是否存在或当前 token 是否有权限。

## 命令结构

```bash
drive-board [全局参数] <命令组或命令> [子命令] [位置参数] [命令选项]
```

正确示例：

```bash
drive-board --server http://drive.mm-lab.cn --token main-agent-token --format json whoami
drive-board --token main-agent-token --format json files ls main-agent
drive-board --token main-agent-token workspaces add-member research-team --actor agent:cli-agent --permission write
```

环境变量也可以提供全局配置：

```bash
export DRIVE_BOARD_SERVER="http://drive.mm-lab.cn"
export DRIVE_BOARD_TOKEN="main-agent-token"
export DRIVE_BOARD_FORMAT="json"
```

## 全局参数

| 参数             | 环境变量             | 默认值                   | 是否必需     | 说明                                                                                                                                                                  |
| ---------------- | -------------------- | ------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--version`      | 无                   | `false`                  | 否           | 打印 CLI 版本号并立即退出，不会发任何请求。                                                                                                                           |
| `--server`       | `DRIVE_BOARD_SERVER` | `http://drive.mm-lab.cn` | 否           | Drive Board 服务根地址。不显式传入时，默认就是生产环境 `http://drive.mm-lab.cn`。CLI 会自动去掉末尾 `/`，并用于把 `public-links` 返回的相对下载路径补成最终绝对链接。 |
| `--token`        | `DRIVE_BOARD_TOKEN`  | 无                       | 大多数命令是 | Bearer Token。未提供时，请求不会带 `Authorization` 头，通常会触发 401/403。                                                                                           |
| `--format`, `-f` | `DRIVE_BOARD_FORMAT` | `table`                  | 否           | 输出格式。允许值：`table`、`json`、`jsonl`。                                                                                                                          |

## 输出格式与错误行为

### `table`

- 面向人类阅读。
- 如果输出是数组，会渲染成表格。
- 如果输出是对象，会渲染成两列 `Field / Value`。
- 嵌套对象或数组会被转成 JSON 字符串后显示。
- 表格渲染时会隐藏 `password_hash` 和 `token_hash` 这类内部字段。

### `json`

- 面向程序消费。
- 输出完整 JSON，带缩进。
- 建议 Agent 默认使用这个格式。

### `jsonl`

- 如果输出顶层是数组，则每一项输出为一行 JSON。
- 如果输出顶层不是数组，则仍然只输出一行 JSON。
- 适合需要逐行流式读取的场景。

### 错误处理

- 服务端返回 HTTP `>= 400` 时，CLI 会退出并打印 `Error: <status>: <detail>`。
- 如果网络连接失败，CLI 会直接打印请求异常并退出。
- `files write` 或 `files append` 参数不合法时会本地直接报错，不会发请求。
- `files upload` 本地文件不存在时会本地直接报错，不会发请求。

## 核心术语

| 术语           | 含义                                                                                  |
| -------------- | ------------------------------------------------------------------------------------- |
| `actor_id`     | 身份唯一标识。用户形如 `user:huangshiyu`，Agent 形如 `agent:main-agent`。             |
| `username`     | 仅人类用户有值；Agent 通常是 `null`。                                                 |
| `workspace`    | 工作区名称。每个用户和 Agent 都有自己的 private workspace；共享空间是 `share_group`。 |
| `path`         | 工作区内部相对路径，例如 `reports/a.pdf`。空路径表示工作区根目录。                    |
| `permission`   | 权限字符串。成员权限用 `read`、`write`、`owner`；文件分享权限用 `read`、`write`。     |
| `kind`         | 对象类型。常见值有 `user`、`agent`、`private`、`share_group`、`file`、`folder`。      |
| `preview_type` | 前端预览类型。常见值有 `folder`、`audio`、`html`、`pdf`、`image`、`text`。            |

## 常见返回字段

CLI 基本不重命名服务端返回字段。下面是最常见对象形状。

### Actor 对象

`whoami` 和 `actors list` 常见返回字段：

| 字段           | 含义                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `actor_id`     | 身份唯一 ID。                                                                                                  |
| `kind`         | `user` 或 `agent`。                                                                                            |
| `username`     | 人类用户账号名；Agent 通常为 `null`。                                                                          |
| `display_name` | 展示名称。                                                                                                     |
| `is_admin`     | 是否管理员。                                                                                                   |
| `is_active`    | 是否启用。                                                                                                     |
| `created_at`   | 创建时间，ISO 8601。                                                                                           |
| `token`        | 仅在管理员使用 `actors list --include-inactive` 时，Agent 行可能附带当前 token；普通列表不要假设这个字段存在。 |

### Workspace 对象

`workspaces list` 和 `files list.workspace` 常见返回字段：

| 字段             | 含义                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`             | 工作区内部 ID。                                                                                                    |
| `name`           | 工作区名称。                                                                                                       |
| `kind`           | `private` 或 `share_group`。                                                                                       |
| `owner_actor_id` | 工作区所有者。                                                                                                     |
| `created_by`     | 创建者。                                                                                                           |
| `created_at`     | 创建时间，ISO 8601。                                                                                               |
| `permission`     | 当前 token 对该 workspace 的权限。`files list.workspace` 内嵌对象不一定包含这个字段，但 `workspaces list` 会返回。 |

### Workspace 成员对象

`workspaces members` 常见返回字段：

| 字段           | 含义                      |
| -------------- | ------------------------- |
| `workspace_id` | 所属工作区内部 ID。       |
| `actor_id`     | 成员身份 ID。             |
| `permission`   | 在该 workspace 中的权限。 |
| `created_at`   | 成员关系创建时间。        |
| `kind`         | `user` 或 `agent`。       |
| `username`     | 仅用户有值。              |
| `display_name` | 成员展示名称。            |

### 文件条目对象

`files list.items[]` 常见返回字段：

| 字段           | 含义                                  |
| -------------- | ------------------------------------- |
| `name`         | 文件或文件夹名，不含上级路径。        |
| `path`         | 相对 workspace 根目录的完整路径。     |
| `kind`         | `file` 或 `folder`。                  |
| `size`         | 文件字节数；文件夹通常为 `null`。     |
| `modified_at`  | 最近修改时间。                        |
| `preview_type` | 前端预览类型。文件夹通常为 `folder`。 |

### 分享条目对象

`shares list` 和 `shares shared` 常见返回字段：

| 字段             | 含义                                             |
| ---------------- | ------------------------------------------------ |
| `id`             | 分享记录 ID。                                    |
| `workspace_id`   | 所属工作区内部 ID。                              |
| `workspace`      | 所属工作区名称。并非所有接口都一定返回。         |
| `workspace_kind` | 工作区类型。并非所有接口都一定返回。             |
| `path`           | 被分享的相对路径。空字符串表示分享的是工作区根。 |
| `actor_id`       | 被分享给的身份。                                 |
| `permission`     | 分享权限，`read` 或 `write`。                    |
| `created_at`     | 分享创建时间。                                   |
| `kind`           | 路径对象类型，常见为 `file` 或 `folder`。        |
| `preview_type`   | 预览类型。                                       |
| `parent_path`    | 上级目录路径；根目录下对象通常是空字符串。       |

## 命令参考

下面只列出当前 CLI 已实现的命令。不要假设存在未列出的子命令。

### `whoami`

语法：

```bash
drive-board [全局参数] whoami
```

用途：

- 调用 `/api/me`，确认当前 token 对应的身份。
- 校验 `--server` 和 `--token` 是否可用时，优先先跑这个命令。

参数：

- 无位置参数。
- 无命令级选项。

示例：

```bash
drive-board --token main-agent-token --format json whoami
```

### `actors list`

语法：

```bash
drive-board [全局参数] actors list [--type <all|user|agent>] [--include-inactive]
```

用途：

- 列出当前 token 可见的人类用户和 Agent。

参数：

| 参数                 | 是否必需 | 含义                                                       |
| -------------------- | -------- | ---------------------------------------------------------- |
| `--type`             | 否       | 过滤身份类型。允许值：`all`、`user`、`agent`。默认 `all`。 |
| `--include-inactive` | 否       | 一并返回未启用身份。通常要求管理员权限。                   |

说明：

- 普通 token 不要依赖能看到所有身份。
- 只有管理员 + `--include-inactive` 的返回里，Agent 行才可能出现 `token` 字段。

示例：

```bash
drive-board --token main-agent-token --format json actors list
```

### `workspaces list`

语法：

```bash
drive-board [全局参数] workspaces list
```

用途：

- 列出当前 token 可访问的所有 workspace。

参数：

- 无位置参数。
- 无命令级选项。

说明：

- 返回的 `permission` 字段表示当前 token 在该 workspace 下的实际权限。
- 建议 Agent 在操作文件前先用这个命令确认 workspace 名和权限。

示例：

```bash
drive-board --token main-agent-token --format json workspaces list
```

### `workspaces create-group`

语法：

```bash
drive-board [全局参数] workspaces create-group --name <workspace_name>
```

用途：

- 创建一个 `share_group` workspace。

参数：

| 参数           | 是否必需 | 含义                                                       |
| -------------- | -------- | ---------------------------------------------------------- |
| `--name`, `-n` | 是       | 新共享工作区名称。建议使用字母、数字、点、下划线、短横线。 |

说明：

- 这个命令只负责创建共享 workspace，不负责同时添加成员。
- 如需授权其他成员，创建后继续调用 `workspaces add-member`。

示例：

```bash
drive-board --token main-agent-token --format json workspaces create-group --name research-team
```

### `workspaces members`

语法：

```bash
drive-board [全局参数] workspaces members <workspace>
```

用途：

- 列出某个 workspace 的成员。

参数：

| 参数        | 是否必需 | 含义           |
| ----------- | -------- | -------------- |
| `workspace` | 是       | 目标工作区名。 |

说明：

- 返回每个成员的 `actor_id`、`permission`、`kind`、`display_name` 等字段。

示例：

```bash
drive-board --token main-agent-token --format json workspaces members research-team
```

### `workspaces add-member`

语法：

```bash
drive-board [全局参数] workspaces add-member <workspace> --actor <actor_id> [--permission <read|write|owner>]
```

用途：

- 给 workspace 新增成员，或更新已有成员权限。

参数：

| 参数           | 是否必需 | 含义                                                      |
| -------------- | -------- | --------------------------------------------------------- |
| `workspace`    | 是       | 目标工作区名。                                            |
| `--actor`      | 是       | 目标成员 ID，必须写成 `user:xxx` 或 `agent:xxx`。         |
| `--permission` | 否       | 成员权限。默认 `read`。允许值：`read`、`write`、`owner`。 |

说明：

- 这是“新增或覆盖”语义，不是只允许新增。
- 如果成员已存在，权限会被更新成新值。

示例：

```bash
drive-board --token main-agent-token workspaces add-member research-team --actor agent:cli-agent --permission write
```

### `workspaces remove-member`

语法：

```bash
drive-board [全局参数] workspaces remove-member <workspace> <actor_id>
```

用途：

- 从某个 workspace 移除成员。

参数：

| 参数        | 是否必需 | 含义                                      |
| ----------- | -------- | ----------------------------------------- |
| `workspace` | 是       | 目标工作区名。                            |
| `actor_id`  | 是       | 要移除的成员 ID，例如 `agent:cli-agent`。 |

说明：

- 该命令要求当前 token 具备 workspace 成员管理权限。
- 如果成员不存在，服务端会返回 404。

示例：

```bash
drive-board --token main-agent-token workspaces remove-member research-team agent:cli-agent
```

### `files ls` / `files list`

语法：

```bash
drive-board [全局参数] files ls <workspace> [path]
drive-board [全局参数] files list <workspace> [path]
```

用途：

- 列出某个目录下的文件和文件夹。

参数：

| 参数        | 是否必需 | 含义                                 |
| ----------- | -------- | ------------------------------------ |
| `workspace` | 是       | 目标工作区名。                       |
| `path`      | 否       | 目标目录相对路径。省略时表示根目录。 |

说明：

- `files ls` 是推荐写法，更接近 Linux 常见命名。
- `files list` 是兼容别名，行为完全相同。

返回结构：

- 顶层对象包含 `workspace`、`path`、`permission`、`items`。
- `items` 是文件条目数组。

示例：

```bash
drive-board --token main-agent-token --format json files ls main-agent
drive-board --token main-agent-token --format json files ls main-agent reports
```

### `files mkdir`

语法：

```bash
drive-board [全局参数] files mkdir <workspace> <path>
```

用途：

- 在 workspace 内创建文件夹。

参数：

| 参数        | 是否必需 | 含义                                              |
| ----------- | -------- | ------------------------------------------------- |
| `workspace` | 是       | 目标工作区名。                                    |
| `path`      | 是       | 要创建的目录相对路径，例如 `reports` 或 `a/b/c`。 |

示例：

```bash
drive-board --token main-agent-token files mkdir main-agent reports
```

### `files upload`

语法：

```bash
drive-board [全局参数] files upload <workspace> <local_path> [--path <remote_path>] [--force]
```

用途：

- 把本地单个文件上传到 workspace 中某个远端路径。

参数：

| 参数           | 是否必需 | 含义                                                                                                                      |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `workspace`    | 是       | 目标工作区名。                                                                                                            |
| `local_path`   | 是       | 本地文件路径，必须是现有文件。                                                                                            |
| `--path`, `-p` | 否       | 远端目标路径。以 `/` 结尾时表示“目标目录”；不以 `/` 结尾时表示“最终文件路径/文件名”。省略时上传到根目录并保留本地文件名。 |
| `--force`      | 否       | 允许覆盖已存在的同名远端文件。默认不覆盖；如果目标已存在，命令直接报错。                                                  |

说明：

- `--path` 为空时，文件上传到 workspace 根目录，远端文件名默认取自本地文件名。
- `--path reports/` 表示上传到 `reports` 目录中，远端文件名仍然取自本地文件名。
- `--path reports/final.pdf` 表示直接把远端文件保存为 `reports/final.pdf`，即使本地文件名不是 `final.pdf`。
- 默认情况下，目标路径已存在就会返回错误；只有加 `--force` 才会覆盖。

示例：

```bash
drive-board --token main-agent-token files upload main-agent ./a.pdf
drive-board --token main-agent-token files upload main-agent ./a.pdf --path reports/
drive-board --token main-agent-token files upload main-agent ./a.pdf --path reports/final.pdf
drive-board --token main-agent-token files upload main-agent ./a.pdf --path reports/final.pdf --force
```

### `files download`

语法：

```bash
drive-board [全局参数] files download <workspace> <remote_path> [--output <local_path>]
```

用途：

- 下载 workspace 内的单个文件到本地。

参数：

| 参数             | 是否必需 | 含义                                                      |
| ---------------- | -------- | --------------------------------------------------------- |
| `workspace`      | 是       | 目标工作区名。                                            |
| `remote_path`    | 是       | 远端文件相对路径。                                        |
| `--output`, `-o` | 否       | 本地输出文件路径。省略时使用 `remote_path` 的文件名部分。 |

返回结构：

| 字段     | 含义                 |
| -------- | -------------------- |
| `output` | 实际写入的本地路径。 |
| `bytes`  | 下载字节数。         |

示例：

```bash
drive-board --token main-agent-token files download main-agent reports/a.pdf --output ./a.pdf
```

### `files cat`

语法：

```bash
drive-board [全局参数] files cat <workspace> <path>
```

用途：

- 打印 UTF-8 文本文件内容到标准输出。

参数：

| 参数        | 是否必需 | 含义                   |
| ----------- | -------- | ---------------------- |
| `workspace` | 是       | 目标工作区名。         |
| `path`      | 是       | 目标文本文件相对路径。 |

说明：

- 只适用于 UTF-8 文本文件。
- 不适合二进制文件、图片、音频、PDF。

示例：

```bash
drive-board --token main-agent-token files cat main-agent notes/readme.md
```

### `files write`

语法：

```bash
drive-board [全局参数] files write <workspace> <path> (--file <local_file> | --stdin)
```

用途：

- 创建或覆盖一个 UTF-8 文本文件。

参数：

| 参数           | 是否必需 | 含义                            |
| -------------- | -------- | ------------------------------- |
| `workspace`    | 是       | 目标工作区名。                  |
| `path`         | 是       | 目标文本文件相对路径。          |
| `--file`, `-i` | 二选一   | 从本地文件读取 UTF-8 文本内容。 |
| `--stdin`      | 二选一   | 从标准输入读取内容。            |

说明：

- `--file` 和 `--stdin` 必须严格二选一。
- 适合文本写入，不适合二进制上传；二进制请用 `files upload`。

示例：

```bash
drive-board --token main-agent-token files write main-agent notes/readme.md --file ./readme.md
cat ./readme.md | drive-board --token main-agent-token files write main-agent notes/readme.md --stdin
```

### `files append`

语法：

```bash
drive-board [全局参数] files append <workspace> <path> (--file <local_file> | --stdin)
```

用途：

- 向一个 UTF-8 文本文件尾部追加内容。
- 如果目标文件不存在，会先按空内容处理，再把这次追加内容写成新文件。

参数：

| 参数           | 是否必需 | 含义                                    |
| -------------- | -------- | --------------------------------------- |
| `workspace`    | 是       | 目标工作区名。                          |
| `path`         | 是       | 目标文本文件相对路径。                  |
| `--file`, `-i` | 二选一   | 从本地文件读取要追加的 UTF-8 文本内容。 |
| `--stdin`      | 二选一   | 从标准输入读取要追加的内容。            |

说明：

- CLI 会先读取远端已有文本内容，再把新内容拼到末尾后整体写回。
- 适合逐段生成日志、报告、草稿等文本，避免每次都让 Agent 准备完整全文。
- 仅适用于 UTF-8 文本文件；如果目标文件存在但不是 UTF-8 文本，命令会失败。

示例：

```bash
echo "\n## 新增结论" | drive-board --token main-agent-token files append main-agent notes/readme.md --stdin
drive-board --token main-agent-token files append main-agent notes/readme.md --file ./appendix.md
```

### `files cp`

语法：

```bash
drive-board [全局参数] files cp <workspace> <source_path> <destination_path>
```

用途：

- 复制一个文件或文件夹到新的路径。

参数：

| 参数               | 是否必需 | 含义                       |
| ------------------ | -------- | -------------------------- |
| `workspace`        | 是       | 目标工作区名。             |
| `source_path`      | 是       | 源文件或源文件夹相对路径。 |
| `destination_path` | 是       | 目标相对路径，必须不存在。 |

说明：

- 目标路径已存在时，服务端返回 409。
- 复制文件夹时会递归复制其内容。

示例：

```bash
drive-board --token main-agent-token files cp main-agent reports/daily.md archive/daily.md
```

### `files mv`

语法：

```bash
drive-board [全局参数] files mv <workspace> <source_path> <destination_path>
```

用途：

- 移动一个文件或文件夹到新的路径。
- 如果 `destination_path` 只改变文件名，也可以把它当作 Linux 风格的 rename 使用。

参数：

| 参数               | 是否必需 | 含义                       |
| ------------------ | -------- | -------------------------- |
| `workspace`        | 是       | 目标工作区名。             |
| `source_path`      | 是       | 源文件或源文件夹相对路径。 |
| `destination_path` | 是       | 目标相对路径，必须不存在。 |

说明：

- `mv` 会同步更新该路径上已有的分享权限和公开链接映射。
- 目标路径已存在时，服务端返回 409。

示例：

```bash
drive-board --token main-agent-token files mv main-agent reports/daily.md archive/summary.md
```

### `files rename`

语法：

```bash
drive-board [全局参数] files rename <workspace> <path> <new_name>
```

用途：

- 在当前父目录内重命名一个文件或文件夹。

参数：

| 参数        | 是否必需 | 含义                                 |
| ----------- | -------- | ------------------------------------ |
| `workspace` | 是       | 目标工作区名。                       |
| `path`      | 是       | 要重命名的相对路径。                 |
| `new_name`  | 是       | 新名称，只是名称本身，不要带父目录。 |

说明：

- 如果你已经知道完整目标路径，优先用 `files mv` 更接近标准命名。
- 如果你只想改 basename，不想自己拼目标路径，用 `files rename` 更直接。

示例：

```bash
drive-board --token main-agent-token files rename main-agent archive/summary.md final.md
```

### `files rm` / `files delete`

语法：

```bash
drive-board [全局参数] files rm <workspace> <path>
drive-board [全局参数] files delete <workspace> <path>
```

用途：

- 删除一个文件或文件夹。

参数：

| 参数        | 是否必需 | 含义                                   |
| ----------- | -------- | -------------------------------------- |
| `workspace` | 是       | 目标工作区名。                         |
| `path`      | 是       | 要删除的相对路径。可指向文件或文件夹。 |

说明：

- `files rm` 是推荐写法。
- `files delete` 是兼容别名，行为完全相同。

示例：

```bash
drive-board --token main-agent-token files rm main-agent reports/a.pdf
```

### `files preview-url`

语法：

```bash
drive-board [全局参数] files preview-url <workspace> <path>
```

用途：

- 打印某个文件的浏览器预览 URL。

参数：

| 参数        | 是否必需 | 含义               |
| ----------- | -------- | ------------------ |
| `workspace` | 是       | 目标工作区名。     |
| `path`      | 是       | 目标文件相对路径。 |

返回结构：

| 字段  | 含义                                                     |
| ----- | -------------------------------------------------------- |
| `url` | 预览地址，格式为 `{server}/preview/{workspace}/{path}`。 |

说明：

- 该命令会去掉 `path` 里的空段和反斜杠，统一按 URL 路径拼接。
- 它不会验证文件存在性，也不会验证权限；真正访问 URL 时仍由服务端做权限检查。

示例：

```bash
drive-board --token main-agent-token --format json files preview-url main-agent test_html/index.html
```

### `shares add`

语法：

```bash
drive-board [全局参数] shares add <workspace> <path> --actor <actor_id> [--permission <read|write>]
```

用途：

- 把某个文件或文件夹直接分享给指定用户或 Agent。

参数：

| 参数           | 是否必需 | 含义                                             |
| -------------- | -------- | ------------------------------------------------ |
| `workspace`    | 是       | 目标工作区名。                                   |
| `path`         | 是       | 被分享对象的相对路径。                           |
| `--actor`      | 是       | 接收分享的身份 ID。                              |
| `--permission` | 否       | 分享权限。默认 `read`。允许值：`read`、`write`。 |

说明：

- 分享文件夹后，接收方可访问该文件夹下子文件。
- 这是“路径级分享”，不是 workspace 成员关系。

示例：

```bash
drive-board --token main-agent-token shares add main-agent reports --actor agent:cli-agent --permission read
```

### `shares ls` / `shares list`

语法：

```bash
drive-board [全局参数] shares ls <workspace> [--path <relative_path>]
drive-board [全局参数] shares list <workspace> [--path <relative_path>]
```

用途：

- 列出某个 workspace 下已有的分享记录。

参数：

| 参数        | 是否必需 | 含义                                                                  |
| ----------- | -------- | --------------------------------------------------------------------- |
| `workspace` | 是       | 目标工作区名。                                                        |
| `--path`    | 否       | 只看某个特定路径上的分享记录。省略时列出该 workspace 内全部分享记录。 |

说明：

- `shares ls` 是推荐写法；`shares list` 是兼容别名。
- 这个命令用于查看“我分享出去的记录”。
- 如果只想查看某一路径是否已被分享，传 `--path` 能减少返回量。

示例：

```bash
drive-board --token main-agent-token --format json shares ls main-agent --path reports
```

### `shares rm`

语法：

```bash
drive-board [全局参数] shares rm <share_id>
```

用途：

- 取消一条已有分享记录。

参数：

| 参数       | 是否必需 | 含义                                       |
| ---------- | -------- | ------------------------------------------ |
| `share_id` | 是       | 分享记录 ID，通常先通过 `shares ls` 查询。 |

说明：

- 该命令删除的是一条具体分享记录，不会删除源文件。
- 如果 `share_id` 不存在，服务端返回 404。

示例：

```bash
drive-board --token main-agent-token shares rm 12
```

### `shares shared`

语法：

```bash
drive-board [全局参数] shares shared
```

用途：

- 列出当前 token 被直接分享到的文件和文件夹。

参数：

- 无位置参数。
- 无命令级选项。

说明：

- 返回的是“直接分享给当前身份的对象”，不是 workspace 成员关系总览。
- 输出条目通常会带 `workspace`、`path`、`permission`、`kind`、`preview_type` 等字段。

示例：

```bash
drive-board --token cli-agent-token --format json shares shared
```

### `public-links create`

语法：

```bash
drive-board [全局参数] public-links create <workspace> <path>
```

用途：

- 为一个文件创建公开下载链接。

参数：

| 参数        | 是否必需 | 含义                           |
| ----------- | -------- | ------------------------------ |
| `workspace` | 是       | 目标工作区名。                 |
| `path`      | 是       | 目标文件相对路径，必须是文件。 |

说明：

- 公开链接仅支持文件，不支持文件夹。
- 同一个文件最多只会保留一个公开链接；如果再次执行 `public-links create`，CLI 会返回已有链接，而不会生成第二条。
- CLI 会根据当前 `--server` 把服务端返回的相对下载路径补成 `public_link.download_url`，因此它是最终可访问的完整绝对链接，可以直接复制、打开或发给别人。
- `public_link` 对象还会包含 `id`、`path`、`token`、`created_at` 等字段。

示例：

```bash
drive-board --token main-agent-token --format json public-links create main-agent reports/a.pdf
```

### `public-links ls` / `public-links list`

语法：

```bash
drive-board [全局参数] public-links ls <workspace> [--path <relative_path>]
drive-board [全局参数] public-links list <workspace> [--path <relative_path>]
```

用途：

- 列出某个 workspace 下的公开链接，或只看某个特定路径上的公开链接。

参数：

| 参数        | 是否必需 | 含义                                                                    |
| ----------- | -------- | ----------------------------------------------------------------------- |
| `workspace` | 是       | 目标工作区名。                                                          |
| `--path`    | 否       | 只看某个具体路径上的公开链接；省略时列出当前 workspace 下全部公开链接。 |

说明：

- `public-links ls` 是推荐写法；`public-links list` 是兼容别名。
- 不传 `--path` 时，返回 `target_kind=workspace` 和整个 workspace 范围内的 `public_links` 数组。
- CLI 会根据当前 `--server` 把 `public_links[*].download_url` 补成最终可访问的完整绝对链接。

示例：

```bash
drive-board --token main-agent-token --format json public-links ls main-agent
drive-board --token main-agent-token --format json public-links ls main-agent --path reports/a.pdf
```

### `public-links rm`

语法：

```bash
drive-board [全局参数] public-links rm <link_id>
```

用途：

- 撤销一个已有公开链接。

参数：

| 参数      | 是否必需 | 含义                                                 |
| --------- | -------- | ---------------------------------------------------- |
| `link_id` | 是       | 公开链接记录 ID，通常先通过 `public-links ls` 查询。 |

说明：

- 该命令只撤销公开链接，不会删除原文件。
- 如果 `link_id` 不存在，服务端返回 404。

示例：

```bash
drive-board --token main-agent-token public-links rm 3
```

## 当前 CLI 不支持的操作

下面这些能力当前不要尝试用 `drive-board` CLI 直接做，因为命令面里没有实现对应子命令：

- 创建、更新、删除 actor。
- 删除 workspace。
- 通过 CLI 直接编辑二进制文件内容。

如果未来 CLI 命令面扩展，应以 `drive-board --help` 和对应子命令 `--help` 为准，不要假设 API 已有的能力就一定已经暴露到 CLI。
