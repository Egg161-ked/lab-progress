// 云函数：进度汇总统计
//   totals  —— 项目数 / 任务数 / 各状态数量 / 逾期数 / 平均进度
//   projects—— 每个项目的任务数与完成情况
//   members —— 每个成员的任务量、完成数、逾期数
// 数据量不大，直接取回后在云函数里聚合，避免依赖聚合索引
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function isOverdue(task, today) {
  if (!task.deadline) return false
  if (task.status === '已完成') return false
  return task.deadline < today
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '获取用户身份失败' }
  }

  try {
    const meRes = await db.collection('users').where({ _openid: openid }).get()
    if (meRes.data.length === 0) {
      return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    }

    const [pjRes, taskRes, userRes] = await Promise.all([
      db.collection('projects').limit(100).get(),
      db.collection('tasks').limit(500).get(),
      db.collection('users').limit(100).get()
    ])

    const projects = pjRes.data
    const tasks = taskRes.data
    // 归档成员（毕业的人）不进"按成员"统计，否则完成率永远被他们拉低
    const users = userRes.data.filter((u) => !u.archived)
    const today = todayStr()

    // ---------- 总计 ----------
    const done = tasks.filter((t) => t.status === '已完成').length
    const doing = tasks.filter((t) => t.status === '进行中').length
    const todo = tasks.filter((t) => t.status === '未开始').length
    const paused = tasks.filter((t) => t.status === '已暂停').length
    const overdue = tasks.filter((t) => isOverdue(t, today)).length
    const avgProgress = tasks.length
      ? Math.round(tasks.reduce((s, t) => s + (Number(t.progress) || 0), 0) / tasks.length)
      : 0

    // ---------- 按项目 ----------
    const byProject = projects.map((p) => {
      const list = tasks.filter((t) => t.projectId === p._id)
      const d = list.filter((t) => t.status === '已完成').length
      const avg = list.length
        ? Math.round(list.reduce((s, t) => s + (Number(t.progress) || 0), 0) / list.length)
        : 0
      return {
        _id: p._id,
        name: p.name || '未命名项目',
        status: p.status || '',
        progress: Number(p.progress) || 0,
        taskCount: list.length,
        doneCount: d,
        overdueCount: list.filter((t) => isOverdue(t, today)).length,
        avgProgress: avg
      }
    })

    // ---------- 按成员 ----------
    const byMember = users.map((u) => {
      const list = tasks.filter((t) => t.assignUser === u._openid)
      const d = list.filter((t) => t.status === '已完成').length
      return {
        _id: u._id,
        nickName: u.nickName || '微信用户',
        role: u.role || 'member',
        direction: u.direction || '',
        total: list.length,
        done: d,
        doing: list.filter((t) => t.status === '进行中').length,
        overdue: list.filter((t) => isOverdue(t, today)).length
      }
    }).sort((a, b) => b.total - a.total)

    return {
      success: true,
      today,
      totals: {
        projects: projects.length,
        tasks: tasks.length,
        done,
        doing,
        todo,
        paused,
        overdue,
        doneRate: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
        avgProgress
      },
      projects: byProject,
      members: byMember
    }
  } catch (err) {
    console.error('[getTaskStats] 失败:', err)
    return { success: false, message: '统计失败：' + (err.errMsg || err.message || err) }
  }
}
