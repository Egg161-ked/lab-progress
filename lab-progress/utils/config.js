/**
 * 项目配置（唯一需要你修改的地方）
 *
 * ⚠️ 换成你自己的值：
 *   1. CLOUD_ENV  云开发环境 ID —— 微信开发者工具 → 云开发 → 设置 → 环境 ID
 *      （形如 cloud1-xxxxxxxxxxxxxx）
 *   2. APPID      小程序 AppID —— 微信公众平台 → 开发 → 开发设置 → AppID
 *      这个值同时要写进 lab-progress/manifest.json 的 mp-weixin.appid
 *
 * 说明：AppID 与云环境 ID 本身不是密钥（它们会随小程序包发布到每个用户手机上，
 *      任何人都能看到），所以放进仓库是安全的；但**别人的环境你写不进去**，
 *      云开发的增删改查只认环境所属账号。真正不能外泄的是开发工具密钥
 *      （见 .gitignore 里被忽略的 cloudfunctions/devTools）。
 */
export const CLOUD_ENV = 'cloud1-d4gif9aiv97ba5fb2'

/** 小程序 AppID（仅用于提示与文档，代码里真正生效的是 manifest.json） */
export const APPID = 'wx425148e468555353'

/** 系统名称：首页/登录页显示用 */
export const APP_NAME = '实验室项目进度'
