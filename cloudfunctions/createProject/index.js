// 云函数：新建项目
// 权限：admin / mentor / leader（leader 创建时负责人只能是自己）
//
// 项目组：memberIds = [openid, ...]（包含负责人），leaderId 必须是成员之一。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const VALID_STATUS = ['未开始', '进行中', '已完成', '已暂停']

async function getCaller(openid) {
  const r = await db.collection('users').where({ _openid: openid }).get()
  return r.data[0] || null
}

/** 校验一批 openid 都是已注册用户，返回去重后的数组 */
async function checkMembers(ids) {
  const arr = Array.from(new Set(ids.filter(Boolean)))
  if (arr.length === 0) return { ok: true, ids: [] }
  if (arr.length > 100) return { ok: false, message: '项目组成员不能超过 100 人' }
  const r = await db.collection('users')
    .where({ _openid: _.in(arr) })
    .limit(100)
    .get()
  if (r.data.length !== arr.length) {
    return { ok: false, message: '有成员不存在，请刷新成员列表后重试' }
  }
  return { ok: true, ids: arr }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return { success: false, message: '获取用户身份失败' }

  try {
    const caller = await getCaller(openid)
    if (!caller) return { success: false, message: '用户不存在，请先进入小程序完成登录' }

    const role = caller.role || 'member'
    const isAdmin = role === 'admin'
    const isMentor = role === 'mentor'
    const isLeader = role === 'leader'

    if (!isAdmin && !isMentor && !isLeader) {
      return { success: false, message: '只有管理员、导师或组长可以创建项目' }
    }

    // ---------- 参数校验 ----------
    const name = String((event && event.name) || '').trim()
    if (!name) return { success: false, message: '项目名称不能为空' }
    if (name.length > 30) return { success: false, message: '项目名称不超过 30 字' }

    const description = String((event && event.description) || '').trim()
    if (description.length > 200) return { success: false, message: '项目描述不超过 200 字' }

    const status = VALID_STATUS.includes(event && event.status) ? event.status : '未开始'

    let progress = Number((event && event.progress) || 0)
    if (Number.isNaN(progress)) progress = 0
    progress = Math.max(0, Math.min(100, Math.round(progress)))

    // leaderId：admin/导师可指定他人；leader 只能是自己
    let leaderId = openid
    if ((isAdmin || isMentor) && event && event.leaderId) {
      leaderId = event.leaderId
    }

    // ---------- 项目组成员 ----------
    const rawMembers = Array.isArray(event && event.memberIds) ? event.memberIds : []
    // 创建者与负责人都要在组里，避免"负责人不在成员名单"这种脏数据
    const checked = await checkMembers([...rawMembers, leaderId, openid])
    if (!checked.ok) return { success: false, message: checked.message }

    const memberIds = checked.ids

    const res = await db.collection('projects').add({
      data: {
        name,
        description,
        status,
        progress,
        leaderId,
        memberIds,
        creatorId: openid,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    return { success: true, message: '项目创建成功', projectId: res._id }
  } catch (err) {
    console.error('[createProject] 失败:', err)
    return { success: false, message: '创建失败：' + (err.errMsg || err.message || err) }
  }
}
