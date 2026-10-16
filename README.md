# 实验室项目进度管理系统

> 基于 **微信小程序 + 云开发（CloudBase）** 的实验室／课题组项目进度管理系统。
> 支持项目组、任务指派、成果附件、评论、看板、进度统计，带四级权限体系。
> 可直接当作模板，改造成你自己的团队协作工具。

![首页](docs/screenshots/02-首页.png)

---

## 功能

| 模块 | 能力 |
|---|---|
| **登录与身份** | 微信静默登录自动建号、`chooseAvatar` 头像、昵称填写、**第一个登录的用户自动成为管理员** |
| **四级权限** | 超级管理员 / 导师 / 组长 / 普通成员，前端控制按钮显隐 + **云函数侧独立二次校验** |
| **项目** | 新建 / 编辑 / 删除（级联删任务）、状态与进度、项目组（多成员 + 其中一人任负责人） |
| **任务** | 布置 / 指派（**只能指派给项目组成员**）/ 截止日期 / 状态 / 进度 / 逾期标红 |
| **成果** | 任务成果附件（图片与文件）、缩略图、点击预览或打开、删除；附件读权限通过云函数换临时链接解决 |
| **评论** | 任务下评论，作者或管理者可删 |
| **看板** | 四列状态看板（未开始/进行中/已完成/已暂停），卡片上直接推进状态，横向滑列 |
| **我的任务** | 我负责的项目 + 指派给我的任务，筛选 / 逾期提醒 |
| **进度统计** | 总览指标、状态分布、按项目、按成员 |
| **成员管理** | 列表 / 搜索 / 角色筛选 / 改角色 / 改资料 |
| **UI 设计层** | 统一设计层（iOS 风格）：状态色卡、卡片、徽章、进度条、按钮、骨架屏、吸顶毛玻璃标题栏 |

---

## 截图

| 登录 | 首页 | 项目详情 |
|---|---|---|
| ![登录](docs/screenshots/01-登录.png) | ![首页](docs/screenshots/02-首页.png) | ![项目](docs/screenshots/03-项目详情.png) |

| 任务详情 | 看板视图 | 我的任务 |
|---|---|---|
| ![任务](docs/screenshots/04-任务详情.png) | ![看板](docs/screenshots/05-看板视图.png) | ![我的任务](docs/screenshots/06-我的任务.png) |

| 进度统计 | 成员管理 | 项目编辑 |
|---|---|---|
| ![统计](docs/screenshots/07-进度统计.png) | ![成员](docs/screenshots/08-成员管理.png) | ![项目编辑](docs/screenshots/09-项目编辑.png) |

---

## 技术栈

- **前端**：uni-app + Vue3（用 HBuilderX 编译）
- **后端**：微信云开发 —— 云函数（Node.js）+ 云数据库 + 云存储
- **数据库**：3 个集合 `users` / `projects` / `tasks`，权限设为**自定义安全规则**（客户端不可直连，一切走云函数）
- **不含**任何 UI 组件库与第三方依赖，云函数只依赖 `wx-server-sdk`

---

## 目录结构

```
.
├── lab-progress/                     uni-app 前端源码
│   ├── pages/                        页面（详见下表）
│   ├── utils/
│   │   ├── config.js                 ★ 唯一需要你改的配置（云环境 ID / AppID）
│   │   ├── api.js                    云函数统一调用层（loading / 错误 / 成功提示）
│   │   └── perm.js                   登录态与权限缓存
│   ├── App.vue                       ★ 全局样式 = 设计层（色板 / 卡片 / 徽章 / 骨架屏…）
│   ├── main.js                       云开发初始化
│   ├── pages.json                    页面注册
│   └── manifest.json                 小程序配置（AppID 写这里）
├── cloudfunctions/                   云函数（每个函数一个目录）
├── docs/
│   ├── screenshots/                  README 截图
│   ├── 上架前检查清单.md
│   ├── 数据库安全规则.md
│   └── 真机多角色验收清单.md
├── 交接文档.md                        ★ 开发笔记：架构 / 权限 / 踩坑 / 规范（强烈建议先读）
└── LICENSE
```

页面清单：`index`(登录) · `home`(首页) · `project`(项目详情) · `projectEdit`(项目编辑) · `task`(任务详情) · `taskEdit`(任务编辑) · `board`(看板) · `myTasks`(我的任务) · `stats`(进度统计) · `member`/`memberDetail`(成员) 

---

## 快速开始

### 0. 前置

- 一个**微信小程序 AppID**（[申请](https://mp.weixin.qq.com/)）
- [HBuilderX](https://www.dcloud.io/hbuilderx.html)（用于编译 uni-app）
- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（用于云开发与上传）

### 1. 开通云开发

微信开发者工具 → 云开发 → 新建环境，记下**环境 ID**（形如 `cloud1-xxxxxxxx`）。

### 2. 新建数据库集合

云开发控制台 → 数据库 → 新建 3 个集合：`users`、`projects`、`tasks`。

然后**逐个把权限改成自定义安全规则**（默认权限会让客户端能直接读写数据库，不安全）：

```json
{ "read": false, "write": false }
```

### 3. 配置

改 `lab-progress/utils/config.js`：

```js
export const CLOUD_ENV = '你的云环境ID'
export const APPID = '你的小程序AppID'
```

改 `lab-progress/manifest.json` → `mp-weixin.appid` = 你的 AppID。

### 4. 部署云函数

微信开发者工具打开**仓库根目录**（根目录的 `project.config.json` 里配了 `cloudfunctionRoot`），
然后在云开发控制台 → 云函数，逐个右键上传部署；或用 CLI：

```bash
# 把 <函数名> 换成 cloudfunctions/ 下的目录名
微信开发者工具/cli.bat cloud functions deploy -e <你的环境ID> -n <函数名> -r --project <仓库根目录绝对路径>
```

需要部署：`login` `checkPermission` `getProjects` `createProject` `updateProject` `deleteProject`
`getTasks` `getTask` `createTask` `updateTask` `deleteTask` `getMyTasks` `getTaskStats`
`getMembers` `updateMember` `taskExtra`

### 5. 跑起来

HBuilderX 打开 `lab-progress` → 运行到微信小程序模拟器（或按下面的命令行）。

**第一个扫码登录的用户会自动成为管理员**，之后可以在「成员管理」里给别人分配角色。

---

## 云函数一览

| 云函数 | 作用 | 权限 |
|---|---|---|
| `login` | 静默登录 / 建号（首个用户自动为 admin） | 任何用户 |
| `checkPermission` | 返回角色与权限矩阵 | 任何用户 |
| `getProjects` | 项目列表 / 单项目（含项目组成员姓名、任务数、逾期数） | 已登录 |
| `createProject` / `updateProject` / `deleteProject` | 项目增改删（改项目含调整项目组、换负责人） | admin / mentor / **该项目负责人**；删除仅 admin |
| `getTasks` / `getTask` | 任务列表 / 详情（含项目负责人与成员，供前端判权） | 已登录 |
| `createTask` / `updateTask` / `deleteTask` | 任务增改删；指派对象必须是项目组成员 | admin / mentor / **该项目负责人**；成员可改自己任务的进度与状态 |
| `getMyTasks` | 我的任务 + 我负责的项目 | 已登录 |
| `getTaskStats` | 进度统计（总览 / 按项目 / 按成员） | 已登录 |
| `getMembers` / `updateMember` | 成员列表与详情 / 改角色与资料 | admin 全部；mentor 仅"组长↔成员" |
| `taskExtra` | 成果附件（增删/取临时链接/兜底读内容）+ 评论（增删） | 见下 |

`taskExtra` 的 6 个动作：`addAttachment` `deleteAttachment` `addComment` `deleteComment` `getFileURLs` `getFileBase64`
> 附件上传：任务负责人本人 / admin / mentor / 该项目负责人；评论：任何已登录用户。
> 附件与评论**内嵌在任务文档的数组字段**里（云函数无法自动建集合，所以没开新集合）。

---

## 权限模型

| 角色 | 项目 | 任务 | 成员 | 成果 |
|---|---|---|---|---|
| **admin** 超管 | 建/改/删任意项目、调整任意项目组 | 任意任务增改删与指派 | 改任意人角色（含授予超管） | 任意任务可交 |
| **mentor** 导师 | 建/改项目、调整项目组 | 增改删任务 | 任命"组长↔成员"，不能授予超管 | 任意任务可交 |
| **leader / 项目负责人** | 只能改**自己负责**的项目 | 只能管**自己负责项目**下的任务 | 无 | 只有自己项目里的任务可交 |
| **member** 成员 | 只读 | 只读；可改**自己任务**的进度与状态 | 无 | 只有自己的任务可交 |

三条设计原则：

1. **前端只控制按钮显隐，服务端（云函数）一律独立再校验一次**；前端判断必须用"任务所属项目的负责人"这种**项目级**条件，不能用全局角色位。
2. **数据库三个集合都是 `{read:false, write:false}`**，客户端无法直连数据库。
3. **项目负责人是项目级身份**，与全局角色解耦 —— 谁被设为某项目的负责人，就对那个项目有管理权。

---

## 数据库结构

```
users     { _openid, nickName, avatarUrl, role, groupId, direction, intro, createTime }
projects  { name, description, status, progress, leaderId, memberIds[], creatorId, createTime, updateTime }
tasks     { title, description, projectId, assignUser, deadline, status, progress, creatorId,
            attachments[{ fileID, name, size, uploader, uploaderName, time }],
            comments[{ text, author, authorName, avatarUrl, time }], createTime, updateTime }
```

> `projects.leaderId` 必须在 `projects.memberIds` 里（服务端强制）；
> `tasks.assignUser` 必须来自项目组。

---

## 开发与发布

```bash
# 开发编译（未压缩，用于模拟器验证）—— 常驻进程，别用超时打断
HBuilderX/cli.exe launch mp-weixin --project <lab-progress 绝对路径>

# 发行编译（生成到 unpackage/dist/build/mp-weixin）
HBuilderX/cli.exe publish mp-weixin --project <lab-progress 绝对路径>

# ⚠️ HBuilderX 命令行编译会把产物里的 appid 写成 touristappid，上传前必须修正：
#   把 unpackage/dist/build/mp-weixin/project.config.json 的 appid 改回你的 AppID

# 上传体验版
微信开发者工具/cli.bat upload --project <dist/build/mp-weixin 绝对路径> -v 1.0.0 -d "版本说明"
```

上传后还需要人工：公众平台 → 版本管理 → **选为体验版** → 体验成员扫码。
> 体验版**不会自动跟随最新上传**，每次都要重新"选为体验版"，成员要**删掉小程序重新扫码**。

---

## 开发约定（改 UI 前必读）

1. **不要在模板里写复杂表达式**：先在 JS 里算好 `xxxList / xxxCount` 这类"哑数据"再 `v-for`；
   模板里不要写 `(x || []).length`、方法调用、索引比较 —— 会与编译产物槽位错配（附件缩略图和项目组都踩过）。
2. **`picker` 的 `:range` 必须是字符串数组**，传对象数组会渲染成 `[object Object]`。
3. **通用样式一律复用 `App.vue` 里的设计层 class**（`.card` `.badge-*` `.pg-*` `.btn` `.chips` `.sk-*` `.nav-blur`…），
   新页面不要再各写一套；可点的卡片加 `hover-class="pressed"`；加载态优先用骨架屏。
4. 详细规范、踩坑记录、验证脚本用法见 **[交接文档.md](交接文档.md)**（尤其是第 9、10、14 章）。

---

## 已知限制

- **图片/文件读取**：云存储默认"仅创建者可读写"，本模板通过云函数换临时链接解决（不需要改存储权限）；
  超大文件（>700KB）的兜底读内容能力不可用，但正常下载链路不受影响。
- **订阅消息通知**：曾实现过一版（任务指派微信推送），因为**订阅消息是一次性的**（授权一次只能推一条、且必须用户本人授权），
  性价比低已移除；技术要点保留在交接文档里，需要时可复用。
- **看板不支持拖拽**，用卡片上的按钮推进状态。
- 未做**深色模式**适配。

---

## License

[MIT](LICENSE) © 实验室项目进度管理系统 contributors
