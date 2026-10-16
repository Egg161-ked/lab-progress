<template>

<view class="page">

	<!-- 滚动后出现的吸顶毛玻璃标题 -->
	<view class="nav-blur" v-if="navShow">
		<text class="nav-blur-title">{{ navTitle }}</text>
	</view>

	<!-- ==================== 项目信息 ==================== -->
	<view class="card" v-if="project">
		<view class="t-row">
			<text class="t-xl t-flex1 t-ellipsis">{{ project.name }}</text>
			<text class="badge" :class="'badge-' + pj.statusKey">{{ pj.status }}</text>
		</view>

		<text v-if="project.description" class="t-sub t-mt12">{{ project.description }}</text>

		<view class="pg">
			<view class="pg-bar">
				<view
					class="pg-fill"
					:class="pj.statusKey === 'done' ? 'pg-fill-done' : ''"
					:style="{ width: pj.progress + '%' }"
				></view>
			</view>
			<text class="pg-text">{{ pj.progress }}%</text>
		</view>

		<text class="perm-tip" v-if="permMsg" :class="permMsgWarn ? 'perm-tip-warn' : ''">
			{{ permMsg }}
		</text>

		<!-- 项目组 -->
		<view class="team">
			<text class="team-title">项目组（{{ teamCount }} 人）</text>
			<view class="team-row" v-for="m in teamList" :key="m.id">
				<view class="avatar-sm">
					<text class="avatar-sm-text">{{ m.initial }}</text>
				</view>
				<text class="team-name t-ellipsis">{{ m.name }}</text>
				<text v-if="m.isLeader" class="badge badge-leader">负责人</text>
			</view>
			<view v-if="teamCount === 0" class="t-weak">还没有组员，点「编辑项目」添加</view>
		</view>

		<view class="btn-row">
			<button
				v-if="canCreateTask"
				class="btn btn-primary"
				size="mini"
				@click="createTask"
			>
				新建任务
			</button>
			<button
				v-if="canEditThis"
				class="btn"
				size="mini"
				@click="editProject"
			>
				编辑项目
			</button>
			<button
				class="btn"
				size="mini"
				@click="openBoard"
			>
				看板视图
			</button>
			<button
				v-if="canDelete"
				class="btn btn-danger"
				size="mini"
				@click="removeProject"
			>
				删除项目
			</button>
		</view>
	</view>

	<view class="sec" v-if="project">
		<text class="sec-title">任务（{{ taskCount }}）</text>
		<text class="sec-extra">{{ doneCount }} 已完成</text>
	</view>

	<!-- ==================== 任务列表 ==================== -->
	<view
		class="card"
		v-for="t in taskList"
		:key="t.id"
		hover-class="pressed"
		hover-stay-time="60"
		@click="openTask(t)"
	>
		<view class="t-row">
			<text class="t-title t-ellipsis t-flex1">{{ t.title }}</text>
			<text class="badge" :class="'badge-' + t.statusKey">{{ t.status }}</text>
		</view>

		<text v-if="t.description" class="t-sub t-mt6 t-ellipsis">{{ t.description }}</text>

		<view class="card-meta">
			<text class="t-weak">负责人：{{ t.assigneeName }}</text>
			<text class="t-weak" :class="t.overdue ? 't-danger' : ''">
				截止：{{ t.deadline }}{{ t.overdue ? '（已逾期）' : '' }}
			</text>
		</view>

		<view class="pg">
			<view class="pg-bar">
				<view
					class="pg-fill"
					:class="t.statusKey === 'done' ? 'pg-fill-done' : ''"
					:style="{ width: t.progress + '%' }"
				></view>
			</view>
			<text class="pg-text">{{ t.progress }}%</text>
		</view>
	</view>

	<!-- 加载骨架 -->
	<view v-if="loading">
		<view class="sk-card" v-for="i in 2" :key="i">
			<view class="sk-line sk-line-mid"></view>
			<view class="sk-line sk-line-short sk-gap"></view>
			<view class="sk-line sk-line-bar"></view>
		</view>
	</view>

	<view v-else-if="project && taskCount === 0" class="empty-state">
		<view class="empty-art">
			<view class="empty-doc">
				<view class="empty-doc-line"></view>
				<view class="empty-doc-line empty-doc-line-short"></view>
			</view>
		</view>
		<text class="empty-title">这个项目还没有任务</text>
		<text class="empty-tip">{{ canCreateTask ? '点上面「新建任务」布置第一个任务' : '等项目负责人布置任务' }}</text>
	</view>

</view>

</template>

<script>

import { ensureLogin, loadPerm, perm, currentOpenid, roleText } from '@/utils/perm.js'
import { api } from '@/utils/api.js'

function todayStr() {
	const d = new Date()
	const p = (n) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default {

	data() {
		return {
			navShow: false,
			navTitle: '',
			projectId: '',
			project: null,
			tasks: [],
			loading: true,
			canEditThis: false,
			canDelete: false,
			canCreateTask: false,
			isProjectLeader: false,
			permMsg: '',
			permMsgWarn: false,
			// 哑数据（模板只绑一层字段）
			pj: { status: '未开始', statusKey: 'todo', progress: 0 },
			teamList: [],
			teamCount: 0,
			taskList: [],
			taskCount: 0,
			doneCount: 0,
			today: todayStr()
		}
	},

	onLoad(options) {
		this.projectId = options.id
		this.init()
	},

	// 从编辑页返回时静默刷新（silent 避免 loading 顶掉提示）
	onShow() {
		if (this.projectId && this.project) {
			this.loadProject(true)
			this.loadTasks(true)
		}
	},

	// 滚动超过 80px 显示吸顶毛玻璃标题（iOS 大标题收起的效果）
	onPageScroll(e) {
		const show = (e && e.scrollTop ? e.scrollTop : 0) > 80
		if (show) {
			const t = (this.project && this.project.name) || '项目详情'
			if (t !== this.navTitle) this.navTitle = t
		}
		if (show !== this.navShow) this.navShow = show
	},

	methods: {

		async init() {
			try {
				await ensureLogin()
			} catch (e) {}
			const p = await loadPerm(true)
			this.applyPerm(p)

			await this.loadProject()
			await this.loadTasks()
		},

		statusKey(s) {
			if (s === '已完成') return 'done'
			if (s === '进行中') return 'doing'
			if (s === '已暂停') return 'paused'
			return 'todo'
		},

		applyPerm(p) {
			const role = p.role
			this.canDelete = !!p.canDeleteProject
			// 项目负责人是【项目级身份】，与全局角色无关（交接文档：解耦决策）
			const isProjectLeader = !!(this.project && this.project.leaderId && this.project.leaderId === currentOpenid())
			this.isProjectLeader = isProjectLeader

			if (role === 'admin') {
				this.canEditThis = true
				this.canCreateTask = true
				this.permMsg = `当前角色：${roleText(role)}，可编辑 / 删除该项目，可布置任务`
				this.permMsgWarn = false
			} else if (role === 'mentor') {
				this.canEditThis = true
				this.canCreateTask = true
				this.permMsg = `当前角色：${roleText(role)}，可编辑项目并布置任务`
				this.permMsgWarn = false
			} else if (isProjectLeader) {
				this.canEditThis = true
				this.canCreateTask = true
				this.permMsg = '你是本项目负责人，可调整项目组、编辑项目并布置任务'
				this.permMsgWarn = false
			} else {
				this.canEditThis = false
				this.canCreateTask = false
				this.permMsg = `当前角色：${roleText(role)}，该项目不由你负责，只读`
				this.permMsgWarn = true
			}
		},

		/** 项目组渲染成"哑数据"：模板只绑一层字段，避免复杂表达式串位 */
		refreshTeam() {
			const p = this.project || {}
			const ids = Array.isArray(p.memberIds) ? p.memberIds : []
			const names = Array.isArray(p.memberNames) ? p.memberNames : []
			this.teamList = ids.map((id, i) => {
				const name = names[i] || '成员'
				return {
					id,
					name,
					initial: name.slice(0, 1),
					isLeader: id === p.leaderId
				}
			})
			this.teamCount = this.teamList.length

			this.pj = {
				status: p.status || '未开始',
				statusKey: this.statusKey(p.status),
				progress: Number(p.progress) || 0
			}
		},

		/** 任务列表渲染成"哑数据" */
		refreshTasks() {
			this.taskList = this.tasks.map((t) => {
				const done = this.statusKey(t.status) === 'done'
				return {
					id: t._id,
					title: t.title || '未命名任务',
					description: t.description || '',
					status: t.status || '未开始',
					statusKey: this.statusKey(t.status),
					progress: Number(t.progress) || 0,
					assigneeName: t.assignUserName || '未指派',
					deadline: t.deadline || '未设置',
					overdue: !!t.deadline && !done && t.deadline < this.today
				}
			})
			this.taskCount = this.taskList.length
			this.doneCount = this.taskList.filter((t) => t.statusKey === 'done').length
		},

		async loadProject(silent) {
			try {
				const res = await api.getProject(this.projectId, silent)
				this.project = res.project || null
				this.refreshTeam()
				this.applyPerm(perm())
			} catch (e) {
				console.error('[project] 加载项目失败:', e)
			}
		},

		async loadTasks(silent) {
			if (!silent) this.loading = true
			try {
				const res = await api.getTasks(this.projectId, silent)
				this.tasks = res.tasks || []
			} catch (e) {
				this.tasks = []
			} finally {
				this.loading = false
			}
			this.refreshTasks()
		},

		editProject() {
			uni.navigateTo({
				url: '/pages/projectEdit/projectEdit?id=' + this.projectId
			})
		},

		createTask() {
			uni.navigateTo({
				url: '/pages/taskEdit/taskEdit?projectId=' + this.projectId
			})
		},

		removeProject() {
			uni.showModal({
				title: '确认删除',
				content: '删除项目会同时删除其下所有任务，且不可恢复，确定继续？',
				confirmColor: '#FF3B30',
				success: async (res) => {
					if (!res.confirm) return
					try {
						await api.deleteProject(this.projectId)
						setTimeout(() => uni.navigateBack(), 1500)
					} catch (e) {
						console.error('[project] 删除失败:', e)
					}
				}
			})
		},

		openTask(item) {
			uni.navigateTo({
				url: '/pages/task/task?id=' + item.id
			})
		},

		openBoard() {
			uni.navigateTo({
				url: '/pages/board/board?projectId=' + this.projectId
			})
		}

	}

}

</script>

<style>

/* ---------- 权限提示 ---------- */
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

/* ---------- 项目组 ---------- */
.team{
	margin-top:20rpx;
	background:rgba(120,120,128,0.06);
	border-radius:14rpx;
	padding:20rpx;
}

.team-title{
	display:block;
	font-size:24rpx;
	color:#6C6C70;
	margin-bottom:14rpx;
}

.team-row{
	display:flex;
	align-items:center;
	padding:18rpx 0;
	border-bottom:1rpx solid rgba(60, 60, 67, 0.10);
}

.team-row:last-child{
	border-bottom:none;
	padding-bottom:6rpx;
}

.avatar-sm{
	width:44rpx;
	height:44rpx;
	border-radius:50%;
	background:rgba(0,122,255,0.12);
	display:flex;
	align-items:center;
	justify-content:center;
	margin-right:14rpx;
	flex-shrink:0;
}

.avatar-sm-text{
	font-size:24rpx;
	color:#007AFF;
	line-height:1;
}

.team-name{
	font-size:26rpx;
	color:#1C1C1E;
	flex:1;
}

/* ---------- 卡片补充 ---------- */
.card-meta{
	display:flex;
	justify-content:space-between;
	margin-top:14rpx;
}

</style>
