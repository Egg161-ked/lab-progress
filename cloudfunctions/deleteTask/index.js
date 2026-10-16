// 云函数：删除任务
// 权限：admin 任意任务；leader 仅自己负责项目下的任务
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

async function getCaller(openid) {
  const r = await db.collection('users').where({ _openid: openid }).get()
  return r.data[0] || null
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
