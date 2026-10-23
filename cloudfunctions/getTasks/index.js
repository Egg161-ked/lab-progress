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

/**
 * 账号状态闸门（注册审核机制的核心，服务端强制）
 *   status: pending(待审核) / active(已通过) / rejected(已拒绝) / blocked(已禁用)
 *   没有 status 字段的老账号（上线前就在用的）按 active 处理
 */
function notApproved(caller) {
  const st = (caller && caller.status) || 'active'
  if (st === 'active') return null
  if (st === 'pending') return { success: false, code: 'PENDING', message: '账号待审核，请等待导员或管理员审核' }
  if (st === 'rejected') return { success: false, code: 'REJECTED', message: '申请未通过，可在申请页修改后重新提交' }
  return { success: false, code: 'BLOCKED', message: '账号已被禁用，请联系管理员' }
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
    const meRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
    if (meRes.data.length === 0) {
      return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    }
    const __gate = notApproved(meRes.data[0])
    if (__gate) return __gate

    const res = await db.collection('tasks').where({ projectId }).limit(200).get()
    const tasks = await attachAssignees(res.data)

    return { success: true, tasks, total: tasks.length }
  } catch (err) {
    console.error('[getTasks] 失败:', err)
    return { success: false, message: '获取任务失败：' + (err.errMsg || err.message || err) }
  }
}
