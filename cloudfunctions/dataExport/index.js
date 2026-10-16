// 云函数：数据导出 / 备份（仅管理员）
//
// 用途：
//   1. 定期备份（导出成 JSON 存本地或网盘）
//   2. 将来换小程序主体/云环境时做数据迁移（openid 会变，所以导出里带上
//      昵称 → openid 的映射表，迁移时按昵称把旧 openid 映射到新 openid）
//   3. 附件清单（云存储 fileID 带环境 ID，跨环境不能直接引用，
//      需要按清单从旧环境下载再传到新环境）
//
// actions：
//   exportAll  导出 users / projects / tasks + 昵称映射 + 附件清单 + 统计
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

async function getCaller(openid) {
  const r = await db.collection('users').where({ _openid: openid }).get()
  return r.data[0] || null
}

/** 分批取全量（云函数单次 get 上限 100 条） */
async function fetchAll(name, limit = 100) {
  const out = []
  let skip = 0
  for (let i = 0; i < 50; i++) {
    const r = await db.collection(name).skip(skip).limit(limit).get()
    out.push(...r.data)
    if (r.data.length < limit) break
    skip += limit
  }
  return out
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return { success: false, message: '获取用户身份失败' }

  try {
    const caller = await getCaller(openid)
    if (!caller) return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    if ((caller.role || 'member') !== 'admin') {
      return { success: false, message: '只有管理员可以导出数据' }
    }

    const action = (event && event.action) || 'exportAll'
    if (action !== 'exportAll') return { success: false, message: '未知 action: ' + action }

    const [users, projects, tasks] = await Promise.all([
      fetchAll('users'),
      fetchAll('projects'),
      fetchAll('tasks')
    ])

    // 昵称 → openid 映射（迁移时按昵称重新绑定新 openid）
    const nameMap = users.map((u) => ({
      nickName: u.nickName || '',
      openid: u._openid || '',
      role: u.role || 'member',
      archived: !!u.archived,
      direction: u.direction || ''
    }))

    // 附件清单（跨环境迁移要重新上传）
    const attachments = []
    tasks.forEach((t) => {
      (t.attachments || []).forEach((a) => {
        attachments.push({
          taskId: t._id,
          taskTitle: t.title || '',
          fileID: a.fileID || '',
          name: a.name || '',
          size: a.size || 0,
          uploaderName: a.uploaderName || '',
          uploader: a.uploader || '',
          time: a.time || ''
        })
      })
    })

    // 简易统计，便于核对导出是否完整
    const summary = {
      users: users.length,
      usersArchived: users.filter((u) => u.archived).length,
      projects: projects.length,
      tasks: tasks.length,
      attachments: attachments.length,
      comments: tasks.reduce((s, t) => s + ((t.comments || []).length), 0)
    }

    return {
      success: true,
      exportedAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('Z', '+08:00'),
      exportedBy: caller.nickName || openid,
      env: wxContext.ENV || '',
      summary,
      nameMap,
      attachments,
      data: { users, projects, tasks }
    }
  } catch (err) {
    console.error('[dataExport] 失败:', err)
    return { success: false, message: '导出失败：' + (err.errMsg || err.message || err) }
  }
}
