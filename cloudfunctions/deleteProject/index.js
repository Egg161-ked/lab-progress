// 云函数：删除项目（仅 admin）
// 注意：会级联删除该项目下的所有任务，避免产生孤儿任务
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

  const projectId = event && event.projectId
  if (!projectId) return { success: false, message: '缺少 projectId' }

  try {
    const caller = await getCaller(openid)
    if (!caller) return { success: false, message: '用户不存在，请先进入小程序完成登录' }

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
