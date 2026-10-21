# 微信开发者工具 CLI 使用备忘

> 首次踩坑记录：2026-10-21。目标是"不开 GUI 也能编译/截图/预览"。
> 结论：**能用，但必须先开服务端口并重启 IDE**，否则 CLI 会卡在交互提示上。

## 一、定位 CLI

本机装在非默认路径：

```bash
E:\微信web开发者工具\cli.bat
```

若不确定，可从运行中的进程查：

```powershell
Get-Process | Where-Object { $_.ProcessName -match "wechatdevtools|微信开发者工具" } | Select-Object Path
```

## 二、前置条件：服务端口（只开一次）

IDE → 设置 → 安全设置 → **服务端口** 打开。它只监听 `127.0.0.1`，不对外暴露。

> ⚠️ **开启后必须重启 IDE**。运行中的实例不会热启用，端口文件会写上端口但没人监听。

验证是否真的可用：

```bash
# 端口文件（<hash> 是随机的用户数据目录）
cat "$LOCALAPPDATA/微信开发者工具/User Data/<hash>/Default/.ide"
# 输出如 34116，然后探测：
curl -s -m 2 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:34116/
# 000 = 没监听（需重启 IDE）；403/426 = 有服务（可用）
```

也可以用 CLI 直接触发开启（会问 y/N）：

```bash
printf 'y\n' | timeout 90 "/e/微信web开发者工具/cli.bat" --port <端口> open --project "D:/AI Code/CampusLeave"
```

## 三、常用命令

```bash
CLI="/e/微信web开发者工具/cli.bat"
PROJ="D:/AI Code/CampusLeave"

"$CLI" open      --project "$PROJ"                        # 打开并编译
"$CLI" close     --project "$PROJ"                        # 关闭项目
"$CLI" preview   --project "$PROJ"                        # 生成预览二维码
"$CLI" auto      --project "$PROJ" --auto-port 9420       # 开自动化端口
"$CLI" auto-replay --project "$PROJ" --auto-port 9420     # 回放
"$CLI" quit                                               # 退出 IDE
```

`auto` 起来的自动化端口可以配 `miniprogram-automator` 做点击/截图：

```js
const automator = require('miniprogram-automator')
const miniProgram = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
const page = await miniProgram.reLaunch('/pages/student/home/home')
await page.waitFor(1000)
await miniProgram.screenshot({ path: 'home.png' })   // 需较新版本
```

## 四、坑位清单（踩过的）

| 现象 | 原因 | 解决 |
|---|---|---|
| 命令无输出、exit=1 | 服务端口关闭，报错走了 stderr 被吞 | 加 `2>&1` 看真实原因 |
| 卡住不动、exit=124 | 停在 `? Enable IDE Service (y/N)` 等输入 | `printf 'y\n' \| cli.bat ...` 喂输入 |
| `wait IDE port timeout` | 端口刚开启，IDE 未重启 | 重启 IDE 后重试 |
| `cmd //c "cli.bat ..."` 报引号错误 | Git Bash 转义 + 沙箱限制 | Git Bash 直接执行 `.bat` 路径，不要包 `cmd /c` |
| PowerShell 里调用失败 | 该环境禁止 `cmd.exe` / `Start-Job` | 换 Git Bash 执行 |

## 五、什么时候需要它

- 想让我（AI）自动截图核对界面 → 需要 `open` + `auto`
- 只在 IDE 里手动点 → 完全不需要 CLI

> 本项目开发期主要靠 DevTools 手工预览；CLI 的主要价值是自动化视觉回归。
