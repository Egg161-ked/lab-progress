# AGENTS.md —— 给 AI 助手与后续维护者的规则

> 这份文件是给**任何要改这个仓库的人（或 AI 助手）**看的硬规则。
> 里面有大量"踩过坑才写下来"的条目，**动手前请完整读一遍**，尤其是第 3、4 章。
> 详细的背景与复盘在 `交接文档.md`。

---

## 1. 项目速览

**微信小程序 + 云开发**的实验室/课题组项目进度管理系统。

| 层 | 技术 | 位置 |
|---|---|---|
| 前端 | uni-app + Vue3（HBuilderX 编译成小程序） | `lab-progress/` |
| 后端 | 微信云开发：云函数（Node.js）+ 云数据库 + 云存储 | `cloudfunctions/` |
| 配置 | 云环境 ID / AppID | `lab-progress/utils/config.js` |
| 样式设计层 | 全局色板、卡片、徽章、按钮、骨架屏… | `lab-progress/App.vue` 的 `<style>` |
| 文档 | 交接文档（架构/权限/踩坑）、README（使用）、CHANGELOG | 根目录 |

数据库 3 个集合：`users` / `projects` / `tasks`。
**集合权限必须是自定义规则 `{read:false, write:false}`** —— 客户端不直连数据库，一切走云函数。

---

## 2. 三条权限铁律（违反即出安全漏洞）

1. **前端只控制显隐，服务端必须独立再校验一次。** 改任何涉及权限的云函数时，先读一遍该函数头部的权限注释。
2. **判断"能不能管这个项目"要用项目级条件**（`project.leaderId === openid`），**不要用全局角色位**。
   历史 bug：用全局 `canEditTask` 判断，导致组长在别人负责的项目里看到一堆点不动的按钮。
3. **不能修改自己的角色**；不能归档自己；不能归档最后一个管理员。

角色：`admin` 超管 / `mentor` 导师 / `leader` 组长（项目负责人）/ `member` 普通成员。
**项目负责人是项目级身份，与全局角色解耦**（谁被设为负责人，就对那个项目有管理权）。

---

## 3. 前端模板写法禁忌（这几条是被编译器坑出来的）

1. **模板只绑一层的简单字段**。先在 JS 里算好 `xxxList / xxxCount` 这类"哑数据"，再 `v-for` 渲染。
   - ❌ 不要在模板里写 `(x || []).length`、方法调用（`v-if="thumbOf(a)"`）、索引比较
   - 症状：编译产物与模板槽位错配，页面出现 `项目组（true 人）`、28 个空行这种诡异结果
2. **`picker` 的 `:range` 必须是字符串数组**。传对象数组会显示 `[object Object]`；
   需要 id 时用**平行数组**（`names[]` + `ids[]`）按下标取值。
3. **异步数据要用数据驱动**：异步拿到的东西（如图片临时链接）先算进数组再渲染，
   不要依赖模板里的方法调用重新求值。
4. **加载态用骨架屏**（`.sk-card` 循环 2~3 个），不要写「加载中…」纯文字。
5. **可点的卡片/行**加 `hover-class="pressed" hover-stay-time="60"`。
6. **WXSS 里注释必须单独占一行**：`line-height: 88rpx; /* 注释 */` 这种行内注释会让**整条声明失效**
   （编译产物里看得到、缓存也清了，运行时就是不生效，极难排查）。
7. **原生 `button` 自带行高会盖掉 class 里的 `line-height`** —— 想让按钮变高请用 `min-height`。
8. **要不要放大可点区域**：目前是紧凑风格（见第 4 章）。如果用户反馈"点不中"，参考 git 提交 `494c5d0` 的做法（全局抬到 88rpx），但那次因为观感偏笨重被回退了。

---

## 4. 设计与交互规范（Apple HIG 数字）

**所有通用样式都在 `App.vue` 的全局 `<style>` 里，新页面直接复用 class，不要再各写一套。**

| 项 | 标准 | 说明 |
|---|---|---|
| 可点区域 | **紧凑密度**：`.btn` ≈ 60rpx、`.chip` ≈ 53rpx、输入框 ≈ 72rpx | Apple HIG 建议 44pt（≈88rpx），**本项目刻意不采用**（观感偏笨重，已试过并回退）。整行可点的卡片、大按钮（`.btn-block`）不受影响 |
| 正文字号 | 30rpx（≈15pt） | Apple 正文 17pt ≈ 34rpx，用于 `.t-title` |
| 辅助文字 | 26rpx 起 | **22rpx（11pt）是下限，尽量别用**（Apple 认为该尺寸过小） |
| 状态色卡 | 未开始灰 / 进行中蓝 `#007AFF` / 已完成绿 `#34C759` / 已暂停橙 `#FF9500` | 徽章用**浅底 + 同色深字**（tinted），不要用高饱和大色块 |
| 卡片 | 白底、圆角 24rpx、**几乎无阴影** | 靠 `#F2F2F7` 底与白卡对比，不靠阴影 |
| 分隔线 | `rgba(60,60,67,0.12)` hairline，最后一行不画 | |

常用 class：`.page` `.card` `.hero-hi` `.sec-title` `.t-xl/.t-title/.t-sub/.t-weak`
`.badge-*` `.pg-*`（进度条）`.btn/.btn-primary/.btn-danger/.btn-block` `.chips/.chip/.chip-on`
`.field/.label/.input/.picker/.hint` `.empty-state/.empty-art` `.sk-*`（骨架屏）`.nav-blur`（吸顶毛玻璃栏）

> 自查脚本：`node .devtools/hig-audit.js`（量可点区域尺寸与字号，按 44pt 标准判定）。

---

## 5. 开发与发布流程（两个链路必须分清）

```bash
# 开发编译（未压缩，用于模拟器验证）—— 常驻进程，别用超时打断，否则会留下半成品目录
HBuilderX/cli.exe launch mp-weixin --project <lab-progress 绝对路径>

# 发行编译（压缩，用于上传体验版）
HBuilderX/cli.exe publish mp-weixin --project <lab-progress 绝对路径>

# ⚠️ 编译后必须把 appid 打回去（HBuilderX CLI 会写成 touristappid，上传会报 code 10）
#   改 unpackage/dist/{dev,build}/mp-weixin/project.config.json 的 appid

# 部署云函数（--project 指向仓库根目录）
微信开发者工具/cli.bat cloud functions deploy -e <环境ID> -n <函数名> -r --project <仓库根目录>
```

**四条环境铁律**：

1. **验证只看 `dist/dev`，上传只看 `dist/build`** —— 开错目录会出现"改了没生效"的假象。
2. **发行包不能用来做界面验证**：压缩混淆后 WXML/data 键名变成 `a/b/c`，读出来的值是错的。
3. **DevTools 编译缓存会被污染**（出现"新 WXML + 旧 JS"混合包），症状是提示文案是旧版、字段串位。
   解决：退出 DevTools → 清空 `User Data/<hash>/WeappCache/WeappCompileCache` 与 `dirCache` → 重开项目。
4. **冷启动要热身**：刚打开 DevTools 时小程序还没跑完 `wx.cloud.init`，云调用会报
   `Cloud API isn't enabled`；脚本里必须 reLaunch 首页 + 等 6~9 秒 + 重试若干次。

---

## 6. 验证纪律（脚本写在 `.devtools/`，不入库）

1. **自己摆前置条件，并回读确认**。历史教训：测试前提没生效就下结论，误报"组长可以越权"。
2. **必须还原数据**，脚本末尾打印还原校验。
3. **用元素文本 / `outerWxml()` 断言**，不要迷信 `page.data()`（这个版本常返回空）。
4. **轮询等待**，不要用固定 `sleep` 猜加载时间。
5. 模拟器的 `page.scrollTop()` **不会派发 `onPageScroll`** —— 要直接调 `page.onPageScroll({scrollTop:300})`。
6. 常用脚本：`phase-c-check.js`（九页样式/布局/截图）、`archive-test.js`（归档全流程）、
   `final-verify.js`（权限边界）、`export-data.js`（备份）、`hig-audit.js`（触点尺寸）。

---

## 7. 输出格式（给 AI 助手）

评审或改动报告请按这个结构，别长篇大论：

```
按文件组织。每条：文件 + 行号 → 违反的规则 → 修改前后对比（简短）
没有问题的文件跳过。最后给一个按优先级排序的摘要。
```

改动前说明会动哪些文件；改动后说明**验证方式与实测结果**（不要只说"应该没问题"）。

---

## 8. 上线前必做

1. 删除云函数 `devTools`（含提权能力）、`devLog`、`notify`（B4 已回退）—— CLI 删不了，去云开发控制台
2. 确认三集合权限 = `{read:false, write:false}`
3. 把 `lab-progress/utils/config.js`、`manifest.json`、`project.config.json` 里的 AppID/环境 ID 换成自己的
4. 若要用订阅消息：`notify/config.json` 的 `MINIPROGRAM_STATE` 要从 `trial` 改成 `formal`（该功能已移除，保留说明）
5. 公众平台提交 **ICP 备案** → 审核 → 发布正式版（体验版有成员数量上限，长期使用必须上线）
6. 按 `docs/上架前检查清单.md` 与 `docs/真机多角色验收清单.md` 逐项过
