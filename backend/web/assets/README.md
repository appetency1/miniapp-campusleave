# assets —— 设计稿素材（已接入）

文件名是代码里写死的，替换同名文件即可生效，**不用改代码**。
改完 Ctrl+F5 强刷，不需要重启后端。

## 已就位

| 文件 | 用在哪 | 原始尺寸 | 说明 |
|---|---|---|---|
| `icon-*.png` × 9 | 侧栏菜单、快捷统计、顶栏铃铛 | 128×128 | 从 3×3 总图切出，已去边居中 |
| `welcome-bear.png` | 右栏「辛苦了，老师！」卡 | 550×348 | 图里自带对话气泡 |
| `side-art.png` | 侧栏底部 | 615×261 | 房子 + 树 + 云 |
| `asset-stationery.png` | 空态插画 | 458×358 | 待办为空 / 最近处理为空时显示 |

图标对应关系：

| 文件 | 用在哪 |
|---|---|
| `icon-gauge.png` | 工作台 |
| `icon-clipboard.png` | 待审批、快捷统计「待审批」 |
| `icon-checklist.png` | 异常核验、快捷统计「待核验」 |
| `icon-folder.png` | 申请记录 |
| `icon-person.png` | 学生管理 |
| `icon-calendar-clock.png` | 快捷统计「在假」 |
| `icon-book.png` | 快捷统计「待处理续假」 |
| `icon-bell.png` | 顶栏通知铃铛 |
| `icon-gauge-alt.png` | 暂未使用（备用） |

## 还缺

| 文件 | 用在哪 | 建议尺寸 |
|---|---|---|
| `avatar.png` | 顶栏右上角教师头像 | 200×200，圆形内容 |
| `avatar-1.png` ~ `avatar-8.png` | 待办列表学生头像 | 120×120 以上，按学生 id 取模选图，少放几张也能跑 |

**没图时的表现**：顶栏和待办行都回退成「姓名首字 + 浅绿圆底」，不会报错也不会撑坏布局。

## 重新切图

如果换了新的图标总图（3×3 网格），改 `scripts/prep_assets.py` 顶部的 `SRC` 路径后执行：

```
C:\Users\Administrator\.workbuddy\binaries\python\envs\default\Scripts\python.exe scripts/prep_assets.py
```

脚本会重新切分、去边、统一缩放，覆盖本目录下的 `icon-*.png`。

## 注意

- 素材原图是**米白底**不是透明底，代码里用 `mix-blend-mode: multiply` + `saturate/contrast`
  让它融进浅绿卡片。如果以后换成真正的透明底 PNG，这两行滤镜要去掉，否则颜色会偏深
- 文件名区分大小写，全部小写
