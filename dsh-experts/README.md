# dsh-experts · 给 DS Bot 团队的专家技能库

把 WorkBuddy 的专家机制移植到 DS Bot 的 Bot 上。不是插件代码，是纯文本知识，通过 capability 灌成 Bot 的 skill。

## 四份手册

| 文件 | 给谁（当前名 / 角色） | skill 名 |
|---|---|---|
| `thesis-writing-handbook.md` | 论文 / 写作 | `thesis-writing` |
| `coder-repair-handbook.md` | 代码 / 开发 | `coder-repair` |
| `research-literature-handbook.md` | 文献 / 核查 | `research-literature` |
| `chief-dispatch-handbook.md` | 首席 / 调度 | `chief-dispatch` |
| `score_6gate.py` + `六关权重.csv` | 给论文自评用 | 不进 skill，直接跑 |

## 灌入

```bash
node apply-experts.mjs            # dry-run，只说改什么
node apply-experts.mjs --apply    # 真写
```

脚本做三件事：建四个 `kind: skill` 的 capability、attach 到对应 Bot、把四个 Bot 的 `workDir` 指到本项目。

**Bot 名字别写死**。你可能随时改名（Coder→代码、Thesis→论文、Chief→首席），脚本按「名字候选 → 角色」两级匹配，两个都不中会报错并列出当前团队全部名字，不会乱挂到别人身上。

它自带活锁检测：读 `state.lock` 里的 pid，pid 活着且心跳在 60 秒内就拒跑。桌面端崩溃留下的残留锁能识别（pid 不在或心跳过期），不会误拦。写前备份 `state.json.bak-<时间戳>`，临时文件加 rename 原子替换，跟插件自身写盘一致（`store.js:388`）。重复执行幂等。

### 为什么能这么灌

`capabilities.js:318` 里自建 skill 是这么注册进 dsh 的：

```js
inject: ['skills'],
apply(c) {
  c.effect(() => c.skills.register({ name, description, source: 'runtime', content }))
}
```

走的是 dsh 原生 skills service。模型在 skill 目录里只看到 `- name: description` 一行，description 截断上限 500 字符（`dsh-tool-skill` 的 `DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH`）。命中之后才用 `skill` 工具读 `content` 全文。

**所以长内容必须放 skill，不能塞 instructions**。`prompt.js:51` 把 instructions 每轮全量注入，6000 字的 instructions 等于每轮烧 4000 token；放成 skill 只在用到那一轮烧一次。

## 评分器

`score_6gate.py` 从专家包 `cs-capstone-expert` 的 `agents/_kernel/` 复制，原版有三个缺陷，已修：

`设计完整度 * 8` 没说清是 0-1 比例还是 0-10 分。按 0-10 填单项就能到 80 被钳成满分 20，白送分；而专家包自带的复算记录第 1 组「无设计文档、无代码」却给了架构 8 分，说明它自己填的是 1。现在超范围直接报错。

分母为 0 会抛 `ZeroDivisionError`（实测 `模块应有:0` 直接崩），缺字段抛 `KeyError`。现在都改成带字段名的报错退出。

输出加了缺口排序。四种输入都测过：正常、分母 0、越界、缺字段。

按项目现状试算（正文未写）是 48 分，缺口全在章节、格式、答辩，现在没有参考意义。

## 已灌入（2026-11-11 20:17）

`revision` 561 → 562，`state.json` 133314 → 198635 字节，四份 skill 全部落盘。

灌入后跑了 `verify.mjs`，22 项全部通过：顶层 23 个键一致、bots/rooms/exchanges/exchangeTurns/requests/questions/closedCards/connectors 数量全未变、12 个 Bot 的 123 处字段未被改动、四份 content 与源文件逐字符一致、原有 `dsh-plugin-management` 保留、其余 8 个 Bot 的 capabilities 未被误改。

当时客户端已经退出，`state.lock` 里 pid 12980 已不存在，属残留锁，插件下次启动会自己接管，不用手动删。

验证命令留着了，以后重新灌可以再跑：

```bash
node verify.mjs "C:/Users/Administrator/.dsh/bot/state.json.bak-<时间戳>"
```

备份共两份：`state.json.bak-20261111T121747`（脚本自动）和 `dsh-experts/state.json.manual-backup-<时间戳>`（手动）。

### 怎么确认真的加载了

启动桌面端，问「论文」这个 Bot：「你手上那份写作手册里，第 4 章要求单独加的那一节叫什么？」

答得出「4.6 设计取舍与论证」就是加载成功。答不出说明 skill 没挂上，去它的设置里看能力列表有没有 `thesis-writing`。

## 待办：论文口径要先统一

灌进去只是让 Bot 有方法论，项目侧的事实冲突还得解决：

`04_开发方案 §3` 整节失真。文档列 16 个唯一 Controller 名，14 个全仓 grep 零命中，实际只有 7 个；Service 文档 8 个实际 12 个；enums 文档 6 个实际只有 `UserRole`。这一整节不能当实现事实引。

接口数三个口径打架：`03_API接口` 表格 46 条，代码实测 54 个方法级映射。分组看，管理端文档 7 条 vs `AdminController` 16 个，学生端文档 19 条 vs 代码 16 个。`outputs/thesis/outline.md` 第 6 行标着「实测」却写 46，实际是抄文档契约——这句最容易被评委抓。

探针条数四处互斥（20/28/18、66、26/37、40），测试章现在不能写任何具体用例数，必须重跑取真实汇总行。

对得上的：Java 66 个文件、12 张表。

详见 `outputs/review/_基线抽查报告.md`。
