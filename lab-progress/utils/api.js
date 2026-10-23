/**
 * 云函数统一调用层
 *
 * 目的：统一「错误提示 / loading / 返回结构」，避免每个页面各写一遍 try-catch。
 * 约定：所有云函数返回 { success: boolean, message?: string, ...业务字段 }
 *
 * 用法：
 *   import { api } from '@/utils/api.js'
 *   const { projects } = await api.getProjects()
 */

/**
 * 调用云函数
 * @param {string} name 云函数名
 * @param {object} data 传给云函数的参数
 * @param {object} options
 *   - loading     {boolean} 是否显示 loading，默认 false
 *   - loadingText {string}  loading 文案
 *   - showError   {boolean} 失败时是否自动 toast，默认 true
 *   - successText {string}  成功后的提示文案（传了才提示）
 * @returns {Promise<object>} 云函数返回体
 *
 * 注意：微信小程序里 hideLoading 与 showToast 在同一个 tick 调用时，
 *       提示会被 loading 的关闭动作吞掉（用户看不到"保存成功"）。
 *       因此这里统一先关 loading，再延迟 150ms 弹提示。
 */
/** 统一跳转：账号未通过审核 → 申请页（带防抖，避免多请求同时跳） */
let _redirectingPending = false
function redirectToPending() {
	if (_redirectingPending) return
	_redirectingPending = true
	const pages = getCurrentPages()
	const cur = pages.length ? pages[pages.length - 1].route : ''
	if (cur && cur.indexOf('pages/pending') >= 0) {
		_redirectingPending = false
		return
	}
	setTimeout(() => {
		uni.reLaunch({
			url: '/pages/pending/pending',
			complete: () => { _redirectingPending = false }
		})
	}, 100)
}

export async function callFunction(name, data = {}, options = {}) {
	const {
		loading = false,
		loadingText = '加载中...',
		showError = true,
		successText = ''
	} = options

	if (loading) {
		uni.showLoading({ title: loadingText, mask: true })
	}

	try {
		const res = await wx.cloud.callFunction({ name, data })
		const result = res && res.result

		if (!result) {
			throw new Error('云函数无返回，请确认已部署')
		}

		// ---------- 注册审核闸门 ----------
		// 服务端判定"账号未通过审核"时返回 code，这里统一跳去申请页，
		// 这样任何页面（含深层页面）被拒都会自动转走，不用每页各写一遍。
		if (result.success === false && result.code &&
			['PENDING', 'REJECTED', 'BLOCKED'].includes(result.code)) {
			if (loading) uni.hideLoading()
			redirectToPending()
			throw new Error(result.message || '账号未通过审核')
		}

		if (result.success === false) {
			throw new Error(result.message || '操作失败')
		}

		if (loading) uni.hideLoading()
		if (successText) {
			setTimeout(() => {
				uni.showToast({ title: successText, icon: 'success' })
			}, 150)
		}
		return result
	} catch (err) {
		const msg = (err && err.message) ? err.message : '网络异常，请重试'
		console.error(`[api] 调用云函数 ${name} 失败:`, err)

		if (loading) uni.hideLoading()
		if (showError) {
			setTimeout(() => {
				uni.showToast({ title: msg, icon: 'none', duration: 2500 })
			}, 150)
		}
		throw err
	}
}

/**
 * 上传文件到云存储（头像等）
 * 说明：微信 chooseAvatar 返回的是临时路径，必须上传到云存储拿 fileID，
 *       否则临时路径会失效，导致头像显示不出来。
 * @param {string} filePath 本地临时文件路径
 * @param {string} dir 云存储目录，默认 avatars
 * @returns {Promise<string>} fileID
 */
export async function uploadFile(filePath, dir = 'avatars') {
	const ext = (filePath.split('.').pop() || 'png').split('?')[0]
	const cloudPath = `${dir}/${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`
	const res = await wx.cloud.uploadFile({ cloudPath, filePath })
	return res.fileID
}

/** 业务接口集合（页面统一从这里调用，避免散落的 wx.cloud.callFunction） */
export const api = {
	/** 登录 / 获取用户（不传 profile 为静默登录；传了则更新头像昵称） */
	login: (profile) => callFunction('login', profile ? { userInfo: profile } : {}, {
		showError: false
	}),

	/** 项目列表（silent=true 时不显示 loading，用于返回页面时的静默刷新） */
	getProjects: (silent) => callFunction('getProjects', {}, { loading: !silent }),

	/** 单个项目详情 */
	getProject: (projectId, silent) => callFunction('getProjects', { projectId }, { loading: !silent }),

	/** 新建项目（admin / leader） */
	createProject: (data) => callFunction('createProject', data, {
		loading: true,
		loadingText: '创建中...',
		successText: '项目已创建'
	}),

	/** 修改项目（admin 任意；leader 仅自己负责的） */
	updateProject: (data) => callFunction('updateProject', data, {
		loading: true,
		loadingText: '保存中...',
		successText: '保存成功'
	}),

	/** 删除项目（仅 admin，会级联删除任务） */
	deleteProject: (projectId) => callFunction('deleteProject', { projectId }, {
		loading: true,
		loadingText: '删除中...',
		successText: '项目已删除'
	}),

	/** 某项目下的任务列表 */
	getTasks: (projectId, silent) => callFunction('getTasks', { projectId }, { loading: !silent }),

	/** 单个任务详情 */
	getTask: (taskId, silent) => callFunction('getTask', { taskId }, { loading: !silent }),

	/** 修改任务 */
	updateTask: (data) => callFunction('updateTask', data, {
		loading: true,
		loadingText: '保存中...',
		successText: '保存成功'
	}),

	/** 新建任务（布置任务） */
	createTask: (data) => callFunction('createTask', data, {
		loading: true,
		loadingText: '创建中...',
		successText: '任务已创建'
	}),

	/**
	 * 看板上的快捷状态流转
	 * 与 updateTask 走同一云函数（服务端同样校验权限），
	 * 但不弹 loading、不弹「保存成功」，避免连续拖动时提示刷屏。
	 */
	updateTaskStatus: (taskId, status, progress) => callFunction('updateTask',
		progress === undefined ? { taskId, status } : { taskId, status, progress },
		{ showError: true }),

	/** 删除任务 */
	deleteTask: (taskId) => callFunction('deleteTask', { taskId }, {
		loading: true,
		loadingText: '删除中...',
		successText: '任务已删除'
	}),

	/** 提交成果（附件） */
	addAttachment: (data) => callFunction('taskExtra', { action: 'addAttachment', ...data }, {
		loading: true,
		loadingText: '提交中...',
		successText: '成果已提交'
	}),

	/** 删除附件 */
	deleteAttachment: (taskId, fileID) => callFunction('taskExtra', {
		action: 'deleteAttachment', taskId, fileID
	}, { loading: true, loadingText: '删除中...', successText: '附件已删除' }),

	/** 发表评论 */
	addComment: (taskId, text) => callFunction('taskExtra', {
		action: 'addComment', taskId, text
	}, { loading: true, loadingText: '发送中...', successText: '评论已发布' }),

	/** 删除评论 */
	deleteComment: (taskId, index) => callFunction('taskExtra', {
		action: 'deleteComment', taskId, index
	}, { loading: true, loadingText: '删除中...', successText: '评论已删除' }),

	/**
	 * 取附件的临时访问链接
	 * why 必须走云函数：云存储默认「仅创建者可读写」，客户端自己取别人上传的
	 *     文件会报 STORAGE_EXCEED_AUTHORITY（表现为"别人传的图片/文件打不开"）。
	 */
	getFileURLs: (taskId, fileIDs) => callFunction('taskExtra', {
		action: 'getFileURLs', taskId, fileIDs
	}, { showError: false }),

	/**
	 * 读文件内容（base64，小文件兜底）
	 * 用于「别人上传的文件」在直连和临时链接都失败时仍能打开。
	 */
	getFileBase64: (taskId, fileID) => callFunction('taskExtra', {
		action: 'getFileBase64', taskId, fileID
	}, { loading: true, loadingText: '打开中...', showError: false }),

	/** 查询当前用户权限 */
	checkPermission: () => callFunction('checkPermission', {}, { showError: false }),

	/** 我的任务（指派给当前用户，跨项目） */
	getMyTasks: (silent) => callFunction('getMyTasks', {}, { loading: !silent }),

	/** 进度汇总统计 */
	getTaskStats: (silent) => callFunction('getTaskStats', {}, { loading: !silent }),

	/** 成员列表（可按昵称搜索 / 按角色筛选） */
	getMembers: (params, silent) => callFunction('getMembers', params || {}, { loading: !silent }),

	/** 单个成员详情 */
	getMember: (memberId, silent) => callFunction('getMembers', { memberId }, { loading: !silent }),

	/** 修改成员资料或角色 */
	updateMember: (data) => callFunction('updateMember', data, {
		loading: true,
		loadingText: '保存中...',
		successText: '保存成功'
	}),

	/**
	 * 成员归档 / 恢复（毕业交接）
	 * 归档 = 软删除：从成员列表、指派下拉、统计里隐藏，历史数据不断链
	 */
	archivePreview: (memberId) => callFunction('archiveMember', {
		action: 'preview', memberId
	}, { loading: true, loadingText: '检查中...' }),
	archiveMember: (data) => callFunction('archiveMember', { action: 'archive', ...data }, {
		loading: true,
		loadingText: '归档中...',
		successText: '已归档'
	}),
	restoreMember: (memberId) => callFunction('archiveMember', { action: 'restore', memberId }, {
		loading: true,
		loadingText: '恢复中...',
		successText: '已恢复'
	}),

	// ==================== 注册审核 ====================
	/** 查自己的审核状态（申请页用） */
	applyStatus: () => callFunction('apply', { action: 'myStatus' }, { showError: false }),
	/** 提交 / 重新提交加入申请 */
	applySubmit: (data) => callFunction('apply', { action: 'submit', ...data }, {
		loading: true,
		loadingText: '提交中...',
		successText: '申请已提交'
	}),
	/** 待审核数量（入口红点） */
	reviewPendingCount: () => callFunction('review', { action: 'pendingCount' }, { showError: false }),
	/** 审核列表 */
	reviewList: (filter) => callFunction('review', { action: 'list', filter }, { loading: true }),
	/** 通过（可指定角色） */
	reviewApprove: (memberId, role) => callFunction('review', { action: 'approve', memberId, role }, {
		loading: true,
		loadingText: '处理中...',
		successText: '已通过'
	}),
	/** 拒绝 */
	reviewReject: (memberId, reason) => callFunction('review', { action: 'reject', memberId, reason }, {
		loading: true,
		loadingText: '处理中...',
		successText: '已拒绝'
	}),
	/** 禁用 */
	reviewBlock: (memberId, reason) => callFunction('review', { action: 'block', memberId, reason }, {
		loading: true,
		loadingText: '处理中...',
		successText: '已禁用'
	}),
	/** 放回待审核 */
	reviewRestore: (memberId) => callFunction('review', { action: 'restore', memberId }, {
		loading: true,
		loadingText: '处理中...',
		successText: '已放回待审核'
	}),

	/** 数据导出 / 备份（仅管理员） */
	exportAll: () => callFunction('dataExport', { action: 'exportAll' }, {
		loading: true,
		loadingText: '导出中...'
	})
}

export default api
