<template>

<view class="page">

	<!-- 滚动后出现的吸顶毛玻璃标题 -->
	<view class="nav-blur" v-if="navShow">
		<text class="nav-blur-title">{{ navTitle }}</text>
	</view>

	<view class="card" v-if="task">

		<view class="t-row">
			<text class="t-xl t-flex1">{{task.title}}</text>
			<text class="badge" :class="'badge-' + statusKey">{{ status || '未开始' }}</text>
		</view>

		<text v-if="task.projectName" class="t-weak t-mt6">所属项目：{{task.projectName}}</text>

		<text class="t-sub t-mt12">{{task.description || '（无描述）'}}</text>

		<view class="card-meta">
			<text class="t-weak">负责人：{{task.assignUserName || '未指派'}}</text>
			<text class="t-weak" :class="overdue ? 't-danger' : ''">截止：{{task.deadline || '未设置'}}{{ overdue ? '（已逾期）' : '' }}</text>
		</view>

		<!-- 权限提示 -->
		<text class="perm-tip" :class="permTipWarn ? 'perm-tip-warn' : ''">
			{{permTip}}
		</text>

		<view class="item">

			<text class="label">
				进度：{{progress}}%
			</text>

			<slider
				:min="0"
				:max="100"
				:value="progress"
				:disabled="!editable"
				@change="changeProgress"
			/>

		</view>

		<view class="item">

			<text class="label">
				状态
			</text>

			<picker
				:range="statusList"
				:value="statusIndex"
				:disabled="!editable"
				@change="changeStatus"
			>

				<view class="picker" :class="{ 'picker-off': !editable }">
					{{status || '请选择'}}
				</view>

			</picker>

		</view>

		<button
			v-if="editable"
			class="btn-block btn-save"
			:disabled="saving"
			@click="saveTask"
		>
			{{ saving ? '保存中…' : '保存修改' }}
		</button>

		<view v-else class="readonly-box">
			你对该任务只有查看权限
		</view>

	</view>

	<!-- ==================== 成果附件 ==================== -->
	<view class="card" v-if="task">

		<text class="section-title">成果附件（{{ attachments.length }}）</text>

		<view class="att" v-for="a in attList" :key="a.fileID">
			<image
				v-if="a.url"
				class="att-thumb"
				:src="a.url"
				mode="aspectFill"
				@click="openAttachment(a)"
			/>
			<view class="att-main" @click="openAttachment(a)">
				<text class="att-name">{{ a.name }}</text>
				<text class="att-meta">{{ a.uploaderName }} · {{ a.time }}<text v-if="a.size"> · {{ fmtSize(a.size) }}</text></text>
			</view>
			<text
				v-if="canDeleteAtt(a)"
				class="att-del"
				@click.stop="removeAttachment(a)"
			>删除</text>
		</view>

		<view v-if="attachments.length === 0" class="empty-line">还没有提交成果</view>

		<view v-if="canUpload" class="att-btns">
			<button class="mini-btn" size="mini" type="primary" @click="uploadImage">上传图片</button>
			<button class="mini-btn" size="mini" @click="uploadFile">上传文件</button>
		</view>
		<view v-else class="empty-line">只有任务负责人或管理者可以提交成果</view>

	</view>

	<!-- ==================== 评论 ==================== -->
	<view class="card" v-if="task">

		<text class="section-title">评论（{{ comments.length }}）</text>

		<view class="comment" v-for="(c, i) in comments" :key="i">
			<view class="c-head">
				<text class="c-author">{{ c.authorName }}</text>
				<text class="c-time">{{ c.time }}</text>
				<text
					v-if="canDeleteComment(c)"
					class="c-del"
					@click.stop="removeComment(i)"
				>删除</text>
			</view>
			<text class="c-text">{{ c.text }}</text>
		</view>

		<view v-if="comments.length === 0" class="empty-line">还没有评论</view>

		<view class="c-input-row">
			<input
				class="c-input"
				v-model="commentText"
				placeholder="说点什么…"
				maxlength="300"
				confirm-type="send"
				@confirm="sendComment"
			/>
			<button class="c-send" size="mini" type="primary" :disabled="sending" @click="sendComment">
				{{ sending ? '…' : '发送' }}
			</button>
		</view>

	</view>

	<view v-if="!task" class="empty">
		加载中…
	</view>

</view>

</template>

<script>

import { ensureLogin, loadPerm, perm, isMyTask, roleText, currentOpenid } from '@/utils/perm.js'
import { api } from '@/utils/api.js'

export default {

	data() {
		return {
			navShow: false,
			navTitle: '',
			taskId: '',
			task: null,
			progress: 0,
			status: '',
			statusList: ['未开始', '进行中', '已完成', '已暂停'],
			statusIndex: 0,
			saving: false,
			// 权限
			canEdit: false,        // 完整编辑权（admin / 导师 / 本项目的 leader）
			canSelfUpdate: false,  // 只能改自己任务的进度/状态
			canManageTask: false,  // 管理者（可提交/删除任意成果）
			isProjectLeader: false,// 我是不是这个项目的负责人（项目级身份）
			// 附件与评论
			commentText: '',
			sending: false,
			fileUrls: {},          // fileID → 临时链接（云存储默认仅创建者可读，需服务端换链接）
			attList: []            // 附件 + 已解析出的图片链接（模板直接渲染，避免异步不刷新）
		}
	},

	computed: {
		editable() {
			return this.canEdit || this.canSelfUpdate
		},
		permTipWarn() {
			return !this.canEdit && !this.canSelfUpdate
		},
		statusKey() {
			const s = this.status
			if (s === '已完成') return 'done'
			if (s === '进行中') return 'doing'
			if (s === '已暂停') return 'paused'
			return 'todo'
		},
		overdue() {
			if (!this.task || !this.task.deadline) return false
			if (this.statusKey === 'done') return false
			const d = new Date()
			const p = (n) => String(n).padStart(2, '0')
			const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
			return this.task.deadline < today
		},
		permTip() {
			const p = perm()
			const r = roleText(p.role)
			if (this.isProjectLeader) return `你是本项目负责人，可完整修改该任务、提交成果`
			if (p.role === 'admin') return `当前角色：${r}，可完整修改该任务`
			if (p.role === 'mentor') return `当前角色：${r}，可管理所有项目的任务`
			if (this.canSelfUpdate) return `当前角色：${r}，这是你的任务，可更新进度与状态`
			return `当前角色：${r}，只读`
		},
		attachments() {
			return (this.task && Array.isArray(this.task.attachments)) ? this.task.attachments : []
		},
		comments() {
			return (this.task && Array.isArray(this.task.comments)) ? this.task.comments : []
		},
		// 能否提交成果：任务负责人本人，或管理者（admin / 导师 / 本项目组长）
		canUpload() {
			return this.canManageTask || (this.task && isMyTask(this.task))
		},
		myOpenid() {
			return currentOpenid()
		}
	},

	async onLoad(options) {
		this.taskId = options.id
		await this.initPerm()
		await this.getTask()
	},

	// 滚动超过 80px 显示吸顶毛玻璃标题（iOS 大标题收起的效果）
	onPageScroll(e) {
		const show = (e && e.scrollTop ? e.scrollTop : 0) > 80
		if (show) {
			const t = (this.task && this.task.title) || '任务详情'
			if (t !== this.navTitle) this.navTitle = t
		}
		if (show !== this.navShow) this.navShow = show
	},

	methods: {

		async initPerm() {
			try {
				await ensureLogin()
			} catch (e) {}
			await loadPerm(true)
		},

		async getTask(silent) {
			try {
				const res = await api.getTask(this.taskId, silent)
				const task = res.task

				if (!task) {
					uni.showToast({ title: '任务不存在', icon: 'none' })
					return
				}

				this.task = task
				this.progress = Number(task.progress) || 0
				this.status = task.status || ''
				const idx = this.statusList.indexOf(this.status)
				this.statusIndex = idx >= 0 ? idx : 0

				this.applyPerm(task)
				await this.loadFileUrls()
			} catch (e) {
				console.error('[task] 获取详情失败:', e)
			}
		},

		/**
		 * 权限判定（与云函数 updateTask / taskExtra 的服务端规则保持一致）
		 * why 不能用全局权限位 canEditTask：它对所有组长都是 true，
		 *     会让组长在【别人负责的项目】里也看到上传/保存按钮，
		 *     点了却被服务端拒绝（界面在骗人）。这里按任务所属项目判定。
		 */
		applyPerm(task) {
			const p = perm()
			const role = p.role
			// 项目负责人是【项目级身份】，与全局角色无关（交接文档：解耦决策）
			const leaderOfThisProject = !!task.projectLeaderId &&
				task.projectLeaderId === currentOpenid()

			this.isProjectLeader = leaderOfThisProject
			this.canManageTask = role === 'admin' || role === 'mentor' || leaderOfThisProject
			this.canEdit = this.canManageTask
			this.canSelfUpdate = !!p.canUpdateOwnTask && isMyTask(task)
		},

		changeProgress(e) {
			this.progress = e.detail.value
		},

		changeStatus(e) {
			this.statusIndex = e.detail.value
			this.status = this.statusList[e.detail.value]
		},

		async saveTask() {
			if (this.saving || !this.editable) return
			this.saving = true
			try {
				await api.updateTask({
					taskId: this.taskId,
					progress: this.progress,
					status: this.status
				})
			} catch (e) {
				console.error('[task] 保存失败:', e)
			} finally {
				this.saving = false
			}
		},

		// ==================== 附件 ====================

		fmtSize(n) {
			const size = Number(n) || 0
			if (size < 1024) return size + ' B'
			if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
			return (size / 1024 / 1024).toFixed(1) + ' MB'
		},

		/**
		 * 是否图片：name 和 fileID 都要看
		 * why 上传图片时 name 常是"图片"这种没有扩展名的名字（uni.chooseImage 只给临时路径），
		 *     只看 name 会把它当普通文件，导致没有缩略图、点开也走下载分支。
		 */
		isImage(a) {
			const re = /\.(png|jpe?g|gif|webp|bmp)$/i
			return re.test((a && a.name) || '') || re.test((a && a.fileID) || '')
		},

		/** 重算附件渲染列表（任务刷新 / 拿到临时链接后都要调） */
		refreshAttList() {
			this.attList = this.attachments.map((a) => ({
				...a,
				isImg: this.isImage(a),
				url: this.isImage(a) ? (this.fileUrls[a.fileID] || '') : ''
			}))
		},

		/** 批量取临时链接（图片用来出缩略图） */
		async loadFileUrls() {
			this.refreshAttList()
			const ids = this.attachments.filter((a) => this.isImage(a)).map((a) => a.fileID)
			if (ids.length === 0) return
			try {
				const res = await api.getFileURLs(this.taskId, ids.slice(0, 20))
				const map = { ...this.fileUrls }
				;(res.list || []).forEach((f) => {
					if (f.tempFileURL) map[f.fileID] = f.tempFileURL
				})
				this.fileUrls = map
			} catch (e) {
				console.error('[task] 取附件临时链接失败:', e)
			}
			this.refreshAttList()
		},

		/** 单个文件的临时链接（打开时用，带缓存） */
		async urlOf(fileID) {
			if (this.fileUrls[fileID]) return this.fileUrls[fileID]
			try {
				const res = await api.getFileURLs(this.taskId, [fileID])
				const f = (res.list || [])[0]
				if (f && f.tempFileURL) {
					this.fileUrls = { ...this.fileUrls, [fileID]: f.tempFileURL }
					this.refreshAttList()
					return f.tempFileURL
				}
			} catch (e) {
				console.error('[task] 取临时链接失败:', e)
			}
			return ''
		},

		canDeleteAtt(a) {
			return a.uploader === this.myOpenid || this.canManageTask
		},

		uploadImage() {
			uni.chooseImage({
				count: 3,
				success: async (res) => {
					for (const p of res.tempFilePaths) {
						await this.doUpload(p, '图片')
					}
				},
				fail: () => {}
			})
		},

		uploadFile() {
			// 从聊天记录里选文件（微信小程序能力）
			uni.chooseMessageFile({
				count: 1,
				type: 'file',
				success: async (res) => {
					const f = res.tempFiles && res.tempFiles[0]
					if (f) await this.doUpload(f.path, f.name, f.size)
				},
				fail: () => {}
			})
		},

		async doUpload(filePath, name, size) {
			const ext = (filePath.split('.').pop() || 'dat').split('?')[0]
			// 上传图片时 name 只有"图片"两个字，带上扩展名更好认、也便于判断类型
			let fileName = name || '未命名文件'
			if (!/\.[a-z0-9]{2,5}$/i.test(fileName) && ext) fileName = fileName + '.' + ext

			uni.showLoading({ title: '上传中…', mask: true })
			try {
				const cloudPath = `task-files/${this.taskId}/${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`
				const up = await wx.cloud.uploadFile({ cloudPath, filePath })
				uni.hideLoading()
				await api.addAttachment({
					taskId: this.taskId,
					fileID: up.fileID,
					name: fileName,
					size: size || 0
				})
				await this.getTask(true)
			} catch (e) {
				uni.hideLoading()
				uni.showToast({ title: '上传失败，请重试', icon: 'none' })
				console.error('[task] 上传失败:', e)
			}
		},

		async openAttachment(a) {
			uni.showLoading({ title: this.isImage(a) ? '打开中…' : '下载中…' })
			try {
				// 服务端换链接：云存储默认「仅创建者可读写」，客户端直连别人传的文件会被拒
				const url = await this.urlOf(a.fileID)

				if (this.isImage(a)) {
					uni.hideLoading()
					if (!url) {
						uni.showToast({ title: '打开失败（文件可能已被删除）', icon: 'none' })
						return
					}
					uni.previewImage({ urls: [url] })
					return
				}

				const tempFilePath = await this.downloadToTemp(a, url)
				uni.hideLoading()
				uni.openDocument({ filePath: tempFilePath, showMenu: true })
			} catch (e) {
				uni.hideLoading()
				uni.showToast({ title: '打开失败（文件可能已被删除）', icon: 'none' })
				console.error('[task] 打开附件失败:', e)
			}
		},

		/**
		 * 下载到本地临时文件（三级兜底）
		 * 1) wx.cloud.downloadFile：不需要配置合法域名，但受云存储读权限限制
		 * 2) 服务端换来的临时链接 + uni.downloadFile：不受存储权限限制，
		 *    但正式版可能受「downloadFile 合法域名」限制
		 * 3) 云函数把文件内容转 base64 返回，客户端落盘：两条路都被堵时仍能打开（小文件）
		 */
		async downloadToTemp(a, url) {
			try {
				const res = await wx.cloud.downloadFile({ fileID: a.fileID })
				if (res && res.tempFilePath) return res.tempFilePath
			} catch (e) {
				console.warn('[task] 云存储直连下载失败，改用临时链接:', e)
			}

			if (url) {
				try {
					const r = await new Promise((resolve, reject) => {
						uni.downloadFile({ url, success: resolve, fail: reject })
					})
					if (r && r.tempFilePath) return r.tempFilePath
				} catch (e) {
					console.warn('[task] 临时链接下载失败，改用云函数取内容:', e)
				}
			}

			const res = await api.getFileBase64(this.taskId, a.fileID)
			if (!res || !res.base64) throw new Error('下载失败')
			const fs = wx.getFileSystemManager()
			const path = `${wx.env.USER_DATA_PATH}/${Date.now()}-${a.name || 'file'}`
			await new Promise((resolve, reject) => {
				fs.writeFile({ filePath: path, data: res.base64, encoding: 'base64', success: resolve, fail: reject })
			})
			return path
		},

		removeAttachment(a) {
			uni.showModal({
				title: '删除附件',
				content: '确定删除「' + a.name + '」？',
				confirmColor: '#FF3B30',
				success: async (res) => {
					if (!res.confirm) return
					try {
						await api.deleteAttachment(this.taskId, a.fileID)
						await this.getTask(true)
					} catch (e) {
						console.error('[task] 删除附件失败:', e)
					}
				}
			})
		},

		// ==================== 评论 ====================

		canDeleteComment(c) {
			return c.author === this.myOpenid || this.canManageTask
		},

		async sendComment() {
			if (this.sending) return
			const text = (this.commentText || '').trim()
			if (!text) {
				uni.showToast({ title: '请输入评论内容', icon: 'none' })
				return
			}
			this.sending = true
			try {
				await api.addComment(this.taskId, text)
				this.commentText = ''
				await this.getTask(true)
			} catch (e) {
				console.error('[task] 评论失败:', e)
			} finally {
				this.sending = false
			}
		},

		removeComment(index) {
			uni.showModal({
				title: '删除评论',
				content: '确定删除这条评论？',
				confirmColor: '#FF3B30',
				success: async (res) => {
					if (!res.confirm) return
					try {
						await api.deleteComment(this.taskId, index)
						await this.getTask(true)
					} catch (e) {
						console.error('[task] 删除评论失败:', e)
					}
				}
			})
		}

	}

}

</script>

<style>

/* 页面容器/卡片/按钮/表单基础样式走全局（App.vue 的 C 阶段设计层），这里只放本页特有样式 */

.card-meta{
	display:flex;
	justify-content:space-between;
	margin-top:14rpx;
}

.perm-tip{
	display:block;
	font-size:22rpx;
	color:#007AFF;
	background:rgba(0,122,255,0.08);
	padding:14rpx 18rpx;
	border-radius:12rpx;
	margin-top:20rpx;
}

.perm-tip-warn{
	color:#C93400;
	background:rgba(255,149,0,0.12);
}

.item{
	margin-bottom:32rpx;
}

.picker{
	background:#F2F2F7;
	padding:20rpx;
	border-radius:12rpx;
	margin-top:16rpx;
}

.picker-off{
	color:#C7C7CC;
}

.readonly-box{
	text-align:center;
	color:#8E8E93;
	font-size:26rpx;
	padding:20rpx 0;
}

.btn-save{
	background:#007AFF;
	color:#fff;
	border:none;
}

.btn-save::after{
	border:none;
}

.section-title{
	display:flex;
	align-items:center;
	font-size:30rpx;
	font-weight:bold;
	margin-bottom:20rpx;
	color:#1C1C1E;
}

.empty-line{
	font-size:24rpx;
	color:#8E8E93;
	padding:10rpx 0;
}

/* ---------- 附件 ---------- */
.att{
	display:flex;
	align-items:center;
	justify-content:space-between;
	padding:18rpx 0;
	border-bottom:1rpx solid rgba(60,60,67,0.12);
}

.att-main{
	flex:1;
	overflow:hidden;
}

.att-thumb{
	width:96rpx;
	height:96rpx;
	border-radius:12rpx;
	margin-right:20rpx;
	background:rgba(120,120,128,0.12);
	flex-shrink:0;
}

.att-name{
	display:block;
	font-size:28rpx;
	color:#007AFF;
}

.att-meta{
	display:block;
	font-size:22rpx;
	color:#8E8E93;
	margin-top:6rpx;
}

.att-del{
	font-size:24rpx;
	color:#FF3B30;
	padding-left:20rpx;
}

.att-btns{
	display:flex;
	margin-top:24rpx;
}

.mini-btn{
	margin-right:16rpx;
}

/* ---------- 评论 ---------- */
.comment{
	padding:18rpx 0;
	border-bottom:1rpx solid rgba(60,60,67,0.12);
}

.c-head{
	display:flex;
	align-items:center;
	margin-bottom:8rpx;
}

.c-author{
	font-size:26rpx;
	font-weight:bold;
	color:#1C1C1E;
	margin-right:16rpx;
}

.c-time{
	font-size:22rpx;
	color:#C7C7CC;
	flex:1;
}

.c-del{
	font-size:22rpx;
	color:#FF3B30;
}

.c-text{
	display:block;
	font-size:28rpx;
	color:#1C1C1E;
	line-height:1.5;
}

.c-input-row{
	display:flex;
	align-items:center;
	margin-top:24rpx;
}

.c-input{
	flex:1;
	background:rgba(120,120,128,0.10);
	border-radius:10rpx;
	padding:16rpx 20rpx;
	font-size:28rpx;
	margin-right:16rpx;
}

.c-send{
	margin:0;
}

.empty{
	text-align:center;
	color:#8E8E93;
	margin-top:100rpx;
}

</style>
