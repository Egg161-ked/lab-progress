// 云函数：查询某项目下的任务列表
// 返回时自动补上负责人姓名（否则前端只能显示 openid，用户看不懂）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

/** 把 tasks 里的 assignUser(openid) 批量换成昵称 */
async function attachAssignees(tasks) {
  const openids = [...new Set(tasks.map((t) => t.assignUser).filter(Boolean))]
  const map = {}

  if (openids.length > 0) {
    const us = await db.collection('users').where({ _openid: _.in(openids) }).limit(100).get()
    us.data.forEach((u) => {
      map[u._openid] = { nickName: u.nickName || '微信用户', avatarUrl: u.avatarUrl || '' }
    })
  }

  return tasks.map((t) => {
    const u = map[t.assignUser]
    return {
      ...t,
      assignUserName: u ? u.nickName : (t.assignUser ? '未知成员' : '未指派'),
      assigneeAvatar: u ? u.avatarUrl : ''
    }
  })
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '获取用户身份失败' }
  }

  const projectId = event && event.projectId
  if (!projectId) {
    return { success: false, message: '缺少 projectId' }
  }

  try {
    const me = await db.collection('users').where({ _openid: openid }).count()
    if (me.total === 0) {
      return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    }

    const res = await db.collection('tasks').where({ projectId }).limit(200).get()
    const tasks = await attachAssignees(res.data)

    return { success: true, tasks, total: tasks.length }
  } catch (err) {
    console.error('[getTasks] 失败:', err)
    return { success: false, message: '获取任务失败：' + (err.errMsg || err.message || err) }
  }
}
