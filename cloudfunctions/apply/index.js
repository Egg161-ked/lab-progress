// 云函数：注册申请（注册审核机制 - 申请人侧）
//
// 背景：小程序上线后所有人都能搜到，但系统只给实验室内部用。
//       所以新用户进来是 pending（待审核）状态，只能填申请、看不到任何业务数据。
//
// actions：
//   myStatus  查自己的审核状态 + 已填的申请（申请页初始化用）
//   submit    提交 / 修改后重新提交申请
//
// 状态机：pending（待审核）→ active（通过）/ rejected（拒绝，可重填）/ blocked（禁用，不可再申请）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

async function getCaller(openid) {
  const r = await db.collection('users').where({ _openid: openid }).get()
  return r.data[0] || null
}

function nowText() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = (event && event.action) || 'myStatus'

  if (!openid) return { success: false, message: '获取用户身份失败' }

  try {
    const caller = await getCaller(openid)
    if (!caller) {
      return { success: false, message: '账号不存在，请重新进入小程序完成登录' }
    }

    const status = caller.status || 'active'

    // ---------- 查自己的状态 ----------
    if (action === 'myStatus') {
      const a = caller.apply || {}
      return {
        success: true,
        status,
        role: caller.role || 'member',
        nickName: caller.nickName || '微信用户',
        apply: {
          realName: a.realName || '',
          studentId: a.studentId || '',
          reason: a.reason || '',
          time: a.time || ''
        },
        reviewedTime: caller.reviewedTime || '',
        rejectReason: caller.rejectReason || '',
        blockReason: caller.blockReason || ''
      }
    }

    // ---------- 提交申请 ----------
    if (action === 'submit') {
      if (status === 'active') {
        return { success: true, status, message: '你已通过审核，无需再申请' }
      }
      if (status === 'blocked') {
        return { success: false, status, message: '账号已被禁用，无法再次申请，请联系管理员' }
      }

      const realName = String((event && event.realName) || '').trim()
      const studentId = String((event && event.studentId) || '').trim()
      const reason = String((event && event.reason) || '').trim()

      if (!realName) return { success: false, message: '请填写真实姓名（方便导员核对）' }
      if (realName.length > 20) return { success: false, message: '姓名不超过 20 字' }
      if (studentId.length > 30) return { success: false, message: '学号不超过 30 字' }
      if (!reason) return { success: false, message: '请简单说明申请原因' }
      if (reason.length > 200) return { success: false, message: '申请说明不超过 200 字' }

      // 提交频率限制：1 分钟内只能提交一次（防刷）
      // 注意：云函数运行在 UTC，而 time 字段是东八区字符串，直接解析会算成"未来时间"，
      //      所以这里用 epoch 毫秒（ts）判断，字符串只用于展示。
      const a = caller.apply || {}
      const lastTs = Number(a.ts || 0)
      if (lastTs && Date.now() - lastTs < 60 * 1000) {
        return { success: false, message: '刚提交过，请 1 分钟后再试' }
      }

      const apply = { realName, studentId, reason, time: nowText(), ts: Date.now() }

      await db.collection('users').doc(caller._id).update({
        data: {
          status: 'pending',
          apply,
          rejectReason: '',
          reviewedBy: '',
          reviewedTime: '',
          updateTime: db.serverDate()
        }
      })

      return {
        success: true,
        status: 'pending',
        message: '申请已提交，请等待导员或管理员审核',
        apply
      }
    }

    return { success: false, message: '未知 action: ' + action }
  } catch (err) {
    console.error('[apply] 失败:', err)
    return { success: false, message: '操作失败：' + (err.errMsg || err.message || err) }
  }
}
