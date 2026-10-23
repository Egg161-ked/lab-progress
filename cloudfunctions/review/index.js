// 云函数：注册审核（注册审核机制 - 审核人侧）
//
// 权限：管理员(admin) 与 导师(mentor) 可审核；组长/普通成员不可。
// 保护：不能审核自己；导师不能审核/改动管理员与导师；
//       不能把最后一个管理员禁用。
//
// actions：
//   pendingCount  待审核数量（首页/入口红点用）
//   list          待审核列表（含申请信息）；filter=all 时返回全部非 active 用户
//   approve       通过（可选指定角色，导师只能给 leader/member）
//   reject        拒绝（填原因，申请人可修改后重新提交）
//   block         禁用（申请人不能再提交）
//   restore       把 rejected/blocked 拉回 pending（恢复申请资格）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

async function getCaller(openid) {
  const r = await db.collection('users').where({ _openid: openid }).get()
  return r.data[0] || null
}

function nowText() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/** 统一的用户卡片信息 */
function card(u) {
  const a = u.apply || {}
  const st = u.status || 'active'
  return {
    _id: u._id,
    nickName: u.nickName || '微信用户',
    avatarUrl: u.avatarUrl || '',
    role: u.role || 'member',
    status: st,
    statusText:
      st === 'pending' ? '待审核' : st === 'active' ? '已通过' : st === 'rejected' ? '已拒绝' : '已禁用',
    realName: a.realName || '',
    studentId: a.studentId || '',
    reason: a.reason || '',
    applyTime: a.time || '',
    rejectReason: u.rejectReason || '',
    reviewedBy: u.reviewedBy || '',
    reviewedTime: u.reviewedTime || ''
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = (event && event.action) || 'list'

  if (!openid) return { success: false, message: '获取用户身份失败' }

  try {
    // ---------- 调用者必须是管理员或导师 ----------
    const caller = await getCaller(openid)
    if (!caller) return { success: false, message: '账号不存在，请先进入小程序完成登录' }

    const callerRole = caller.role || 'member'
    const callerStatus = caller.status || 'active'
    const isAdmin = callerRole === 'admin'
    const isMentor = callerRole === 'mentor'

    // 未通过审核的账号不能审核别人（管理员/导师本来就应 active，这里防御一下）
    if (callerStatus !== 'active') {
      return { success: false, code: 'PENDING', message: '账号待审核，请等待审核' }
    }
    if (!isAdmin && !isMentor) {
      return { success: false, message: '只有管理员或导师可以审核申请' }
    }

    // ---------- 待审核数量 ----------
    if (action === 'pendingCount') {
      const c = await db.collection('users').where({ status: 'pending' }).count()
      return { success: true, count: c.total }
    }

    // ---------- 列表 ----------
    if (action === 'list') {
      const filter = ((event && event.filter) || 'pending').trim()
      let where
      if (filter === 'pending') where = { status: 'pending' }
      else if (filter === 'all') where = { status: _.in(['pending', 'rejected', 'blocked']) }
      else where = { status: filter }

      const r = await db.collection('users').where(where).limit(100).get()
      const list = r.data.map(card)
      // 待审核按提交时间正序（先来先审），其它按时间倒序
      list.sort((x, y) => String(x.applyTime).localeCompare(String(y.applyTime)))

      const pendingCount = (await db.collection('users').where({ status: 'pending' }).count()).total
      return { success: true, list, pendingCount, filter }
    }

    // ---------- 单个操作 ----------
    const memberId = (event && event.memberId) || ''
    if (!memberId) return { success: false, message: '缺少 memberId' }

    let target
    try {
      const tr = await db.collection('users').doc(memberId).get()
      target = tr.data
    } catch (e) {
      return { success: false, message: '用户不存在' }
    }
    const targetRole = target.role || 'member'
    const targetStatus = target.status || 'active'

    if ((target._openid || '') === openid) {
      return { success: false, message: '不能审核自己的账号' }
    }
    // 导师不能动管理员/导师
    if (!isAdmin && (targetRole === 'admin' || targetRole === 'mentor')) {
      return { success: false, message: '导师不能审核管理员或导师的账号' }
    }

    // ---------- 通过 ----------
    if (action === 'approve') {
      let role = ((event && event.role) || 'member').trim()
      if (!['admin', 'mentor', 'leader', 'member'].includes(role)) {
        return { success: false, message: '角色不合法' }
      }
      if (!isAdmin && (role === 'admin' || role === 'mentor')) {
        return { success: false, message: '导师只能把成员设为组长或普通成员' }
      }

      await db.collection('users').doc(memberId).update({
        data: {
          status: 'active',
          role,
          rejectReason: '',
          blockReason: '',
          reviewedBy: caller.nickName || openid,
          reviewedTime: nowText(),
          updateTime: db.serverDate()
        }
      })
      return {
        success: true,
        message: `已通过「${target.nickName || '该同学'}」的申请，角色设为 ${role}`,
        role
      }
    }

    // ---------- 拒绝 ----------
    if (action === 'reject') {
      const reason = String((event && event.reason) || '').trim()
      if (reason.length > 100) return { success: false, message: '拒绝原因不超过 100 字' }
      await db.collection('users').doc(memberId).update({
        data: {
          status: 'rejected',
          rejectReason: reason || '未说明原因',
          reviewedBy: caller.nickName || openid,
          reviewedTime: nowText(),
          updateTime: db.serverDate()
        }
      })
      return { success: true, message: `已拒绝「${target.nickName || '该同学'}」的申请（他可以修改后重新提交）` }
    }

    // ---------- 禁用 ----------
    if (action === 'block') {
      if (targetRole === 'admin') {
        const adminCount = await db.collection('users').where({ role: 'admin' }).count()
        if (adminCount.total <= 1) return { success: false, message: '这是最后一个管理员，不能禁用' }
      }
      const reason = String((event && event.reason) || '').trim()
      await db.collection('users').doc(memberId).update({
        data: {
          status: 'blocked',
          blockReason: reason || '管理员禁用',
          reviewedBy: caller.nickName || openid,
          reviewedTime: nowText(),
          updateTime: db.serverDate()
        }
      })
      return { success: true, message: `已禁用「${target.nickName || '该同学'}」，他不能再提交申请` }
    }

    // ---------- 恢复申请资格 ----------
    if (action === 'restore') {
      if (targetStatus === 'active') return { success: false, message: '该账号已经是正常状态' }
      await db.collection('users').doc(memberId).update({
        data: { status: 'pending', blockReason: '', reviewTime: nowText(), updateTime: db.serverDate() }
      })
      return { success: true, message: `已把「${target.nickName || '该同学'}」放回待审核` }
    }

    return { success: false, message: '未知 action: ' + action }
  } catch (err) {
    console.error('[review] 失败:', err)
    return { success: false, message: '操作失败：' + (err.errMsg || err.message || err) }
  }
}
