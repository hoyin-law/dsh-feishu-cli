# vendor — 飞书 CLI 资产说明

本目录**不再随包携带 50MB 的 `lark-cli` 二进制**。插件会在首次使用时按当前平台自动下载官方发布包，校验 SHA-256 后安装到：

```text
$DSH_HOME/feishu-cli/bin/lark-cli(.exe)
```

- 版本：`lark-cli 1.0.98`
- 来源：npm [`@larksuite/cli`](https://www.npmjs.com/package/@larksuite/cli) 的 GitHub Release 资产
- 下载源：npmmirror 二进制镜像优先，GitHub Releases 兜底
- 校验：`checksums.txt` 中的 SHA-256（随包分发）
- 许可：MIT（见 `LICENSE-lark-cli.txt`），版权归 Lark Technologies Pte. Ltd.

支持的平台与架构：

| 平台 | 架构 | 资产 |
| --- | --- | --- |
| Windows | x64 / arm64 | `lark-cli-1.0.98-windows-*.zip` |
| macOS | x64 / arm64 | `lark-cli-1.0.98-darwin-*.tar.gz` |
| Linux | x64 / arm64 / riscv64 | `lark-cli-1.0.98-linux-*.tar.gz` |

如果机器上已经安装了 `lark-cli`，可以用环境变量指定，避免重复下载：

```powershell
$env:LARK_CLI_BIN = "C:\path\to\lark-cli.exe"
```

查找顺序：`LARK_CLI_BIN` → `LARK_CLI_PATH` → `$DSH_HOME/feishu-cli/bin/` → 插件内置 `vendor/` → `PATH`。

> 维护者本地开发可把二进制放在 `vendor/lark-cli.exe`（已被 `.gitignore` 忽略），插件会优先使用它。
