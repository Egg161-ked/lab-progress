// 云函数：任务附件（成果提交）与评论
//
// why 不用新集合：云函数无法自动创建集合（会报 collection not exists），
// 因此附件与评论直接存进任务文档的数组字段：
//   tasks.attachments: [{ fileID, name, size, uploader, uploaderName, time }]
//   tasks.comments:    [{ text, author, authorName, time }]
//
// 权限：
//   附件上传 —— 任务负责人本人 / admin / mentor / 该项目的 leader
//   附件删除 —— 上传者本人 / admin / mentor / 该项目的 leader
//   发表评论 —— 任何已登录用户（任务对已登录用户可见）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

async function getCaller(openid) {
  const r = await db.collection('users').where({ _openid: openid }).get()
  return r.data[0] || null
}

function nowText() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return { success: false, message: '获取用户身份失败' }

  const action = (event && event.action) || ''
  const taskId = (event && event.taskId) || ''
  if (!taskId) return { success: false, message: '缺少 taskId' }

  try {
    // ---------- 调用者 ----------
    const caller = await getCaller(openid)
    if (!caller) {
      return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    }
    const role = caller.role || 'member'

    // ---------- 任务与项目 ----------
    let task
    try {
      const tr = await db.collection('tasks').doc(taskId).get()
      task = tr.data
    } catch (e) {
      return { success: false, message: '任务不存在或已被删除' }
    }

    let project = null
    if (task.projectId) {
      try {
        const pr = await db.collection('projects').doc(task.projectId).get()
        project = pr.data
      } catch (e) {
        project = null
      }
    }

    const isAdmin = role === 'admin'
    const isMentor = role === 'mentor'
    // 项目负责人是【项目级身份】，与全局角色无关（交接文档：解耦决策）
    const isLeaderOfProject = !!project && !!project.leaderId && project.leaderId === openid
    const isAssignee = !!task.assignUser && task.assignUser === openid
    const canManage = isAdmin || isMentor || isLeaderOfProject

    // ==================== 提交成果（上传附件） ====================
    if (action === 'addAttachment') {
      if (!canManage && !isAssignee) {
        return { success: false, message: '只有任务负责人或管理者可以提交成果' }
      }

      const fileID = String((event && event.fileID) || '')
      if (!fileID) return { success: false, message: '缺少文件' }

      const item = {
        fileID,
        name: String((event && event.name) || '未命名文件').slice(0, 80),
        size: Number((event && event.size) || 0),
        uploader: openid,
        uploaderName: caller.nickName || '微信用户',
        time: nowText()
      }

      const list = Array.isArray(task.attachments) ? task.attachments.slice() : []
      list.push(item)

      await db.collection('tasks').doc(taskId).update({
        data: { attachments: list, updateTime: db.serverDate() }
      })

      return { success: true, message: '成果已提交', attachment: item }
    }

    // ==================== 删除附件 ====================
    if (action === 'deleteAttachment') {
      const fileID = String((event && event.fileID) || '')
      if (!fileID) return { success: false, message: '缺少文件标识' }

      const list = Array.isArray(task.attachments) ? task.attachments.slice() : []
      const target = list.find((x) => x.fileID === fileID)
      if (!target) return { success: false, message: '附件不存在' }

      const isOwner = target.uploader === openid
      if (!isOwner && !canManage) {
        return { success: false, message: '只能删除自己上传的成果' }
      }

      const next = list.filter((x) => x.fileID !== fileID)
      await db.collection('tasks').doc(taskId).update({
        data: { attachments: next, updateTime: db.serverDate() }
      })

      // 顺带删除云存储文件（失败不影响主流程）
      try {
        await cloud.deleteFile({ fileList: [fileID] })
      } catch (e) {
        console.warn('[taskExtra] 删除云存储文件失败:', e)
      }

      return { success: true, message: '附件已删除' }
    }

    // ==================== 取附件临时访问链接 ====================
    // why 必须走云函数：云存储默认「仅创建者可读写」，客户端直接
    //     wx.cloud.getTempFileURL / downloadFile 去读别人上传的文件会返回
    //     STORAGE_EXCEED_AUTHORITY（外部表现就是"别人传的图片/文件打不开"）。
    //     云函数以管理员身份运行，不受该权限限制。
    if (action === 'getFileURLs') {
      const fileIDs = Array.isArray(event.fileIDs) ? event.fileIDs.filter(Boolean) : []
      if (fileIDs.length === 0) return { success: false, message: '缺少文件标识' }
      if (fileIDs.length > 20) return { success: false, message: '一次最多取 20 个文件' }

      const r = await cloud.getTempFileURL({ fileList: fileIDs })
      const list = (r.fileList || []).map((f) => ({
        fileID: f.fileID,
        tempFileURL: f.tempFileURL || '',
        status: f.status
      }))

      return { success: true, list }
    }

    // ==================== 读文件内容（最后的兜底） ====================
    // why 需要它：别人上传的【文件】（docx 等）客户端直连会被存储权限拒；
    //     换成临时链接下载在正式版又可能被「downloadFile 合法域名」挡住。
    //     这里让云函数把内容读出来转 base64，客户端落盘后照样能打开。
    //     代价是走云函数返回体（有大小限制），所以只兜小文件。
    if (action === 'getFileBase64') {
      const fileID = String((event && event.fileID) || '')
      if (!fileID) return { success: false, message: '缺少文件标识' }

      const r = await cloud.downloadFile({ fileID })
      const buf = r && r.fileContent
      if (!buf || !buf.length) return { success: false, message: '文件不存在或为空' }

      const MAX = 700 * 1024
      if (buf.length > MAX) {
        return {
          success: false,
          message: `文件较大（${Math.round(buf.length / 1024)}KB），请在电脑上打开`
        }
      }

      return { success: true, base64: buf.toString('base64'), size: buf.length }
    }

    // ==================== 发表评论 ====================
    if (action === 'addComment') {
      const text = String((event && event.text) || '').trim()
      if (!text) return { success: false, message: '评论内容不能为空' }
      if (text.length > 300) return { success: false, message: '评论不超过 300 字' }

      const item = {
        text,
        author: openid,
        authorName: caller.nickName || '微信用户',
        avatarUrl: caller.avatarUrl || '',
        time: nowText()
      }

      const list = Array.isArray(task.comments) ? task.comments.slice() : []
      list.push(item)

      await db.collection('tasks').doc(taskId).update({
        data: { comments: list, updateTime: db.serverDate() }
      })

      return { success: true, message: '评论已发布', comment: item }
    }

    // ==================== 删除评论 ====================
    if (action === 'deleteComment') {
      const index = Number((event && event.index))
      const list = Array.isArray(task.comments) ? task.comments.slice() : []
      if (Number.isNaN(index) || index < 0 || index >= list.length) {
        return { success: false, message: '评论不存在' }
      }
      const target = list[index]
      const isOwner = target.author === openid
      if (!isOwner && !canManage) {
        return { success: false, message: '只能删除自己的评论' }
      }
      list.splice(index, 1)
      await db.collection('tasks').doc(taskId).update({
        data: { comments: list, updateTime: db.serverDate() }
      })
      return { success: true, message: '评论已删除' }
    }

    return { success: false, message: '未知 action: ' + action }
  } catch (err) {
    console.error('[taskExtra] 失败:', err)
    return { success: false, message: '操作失败：' + (err.errMsg || err.message || err) }
  }
}
