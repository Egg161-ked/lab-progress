// 云函数：删除项目（仅 admin）
// 注意：会级联删除该项目下的所有任务，避免产生孤儿任务
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

async function getCaller(openid) {
  const r = await db.collection('users').where({ _openid: openid }).get()
  return r.data[0] || null
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

  if (!openid) return { success: false, message: '获取用户身份失败' }

  const projectId = event && event.projectId
  if (!projectId) return { success: false, message: '缺少 projectId' }

  try {
    const caller = await getCaller(openid)
    if (!caller) return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    const __gate = notApproved(caller)
    if (__gate) return __gate

    if ((caller.role || 'member') !== 'admin') {
      return { success: false, message: '只有管理员可以删除项目' }
    }

    // 项目是否存在
    try {
      await db.collection('projects').doc(projectId).get()
    } catch (e) {
      return { success: false, message: '项目不存在或已被删除' }
    }

    // 级联删除任务
    const delTasks = await db.collection('tasks').where({ projectId }).remove()

    // 删除项目
    await db.collection('projects').doc(projectId).remove()

    return {
      success: true,
      message: `项目已删除（同时清理 ${delTasks.stats ? delTasks.stats.removed : 0} 条任务）`,
      removedTasks: delTasks.stats ? delTasks.stats.removed : 0
    }
  } catch (err) {
    console.error('[deleteProject] 失败:', err)
    return { success: false, message: '删除失败：' + (err.errMsg || err.message || err) }
  }
}
