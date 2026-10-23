// 云函数：删除任务
// 权限：admin 任意任务；leader 仅自己负责项目下的任务
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

  const taskId = event && event.taskId
  if (!taskId) return { success: false, message: '缺少 taskId' }

  try {
    const caller = await getCaller(openid)
    if (!caller) return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    const __gate = notApproved(caller)
    if (__gate) return __gate

    const role = caller.role || 'member'
    const isAdmin = role === 'admin'
    const isMentor = role === 'mentor'

    let task
    try {
      const tr = await db.collection('tasks').doc(taskId).get()
      task = tr.data
    } catch (e) {
      return { success: false, message: '任务不存在或已被删除' }
    }

    // admin / 导师 可删任意任务；项目负责人（项目级身份，与全局角色无关）
    // 只能删自己负责项目下的任务
    if (!isAdmin && !isMentor) {
      let project = null
      if (task.projectId) {
        try {
          const pr = await db.collection('projects').doc(task.projectId).get()
          project = pr.data
        } catch (e) {
          project = null
        }
      }
      const isLeaderOfProject = !!project && !!project.leaderId && project.leaderId === openid
      if (!isLeaderOfProject) {
        return { success: false, message: '只有管理员、导师或该项目负责人可以删除任务' }
      }
    }

    await db.collection('tasks').doc(taskId).remove()

    return { success: true, message: '任务已删除' }
  } catch (err) {
    console.error('[deleteTask] 失败:', err)
    return { success: false, message: '删除失败：' + (err.errMsg || err.message || err) }
  }
}
