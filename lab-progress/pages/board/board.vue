<template>

<view class="container">

	<!-- 顶部：项目名 + 各状态数量 -->
	<view class="bar">
		<text class="bar-title">{{ project ? project.name : '看板视图' }}</text>
		<text class="bar-sub">
			共 {{ tasks.length }} 个任务 ｜ 完成率 {{ doneRate }}%
		</text>
		<view class="chips">
			<view
				class="chip"
				v-for="c in columns"
				:key="c.key"
				@click="scrollTo(c.index)"
			>
				<view class="dot" :style="{ background: c.color }"></view>
				<text class="chip-text">{{ c.key }} {{ c.tasks.length }}</text>
			</view>
		</view>
	</view>

	<!-- 看板主体：横向滚动 + 每列纵向滚动 -->
	<scroll-view
		class="board"
		scroll-x="true"
		:scroll-into-view="scrollTarget"
		scroll-with-animation="true"
	>
		<view class="board-inner">

			<view
				class="col"
				v-for="c in columns"
				:key="c.key"
				:id="'col-' + c.index"
			>
				<view class="col-head">
					<view class="dot" :style="{ background: c.color }"></view>
					<text class="col-title">{{ c.key }}</text>
					<text class="col-count">{{ c.tasks.length }}</text>
				</view>

				<scroll-view class="col-body" scroll-y="true">
					<view
						class="tcard"
						v-for="t in c.tasks"
						:key="t._id"
						hover-class="pressed"
						hover-stay-time="60"
						@click="openTask(t)"
					>
						<text class="t-title">{{ t.title }}</text>

						<text class="t-line">
							负责人：{{ t.assignUserName || '未指派' }}
						</text>

						<text class="t-line" :class="{ 't-over': isOverdue(t) }">
							截止：{{ t.deadline || '未设置' }}{{ isOverdue(t) ? '（已逾期）' : '' }}
						</text>

						<view class="bar-wrap">
							<view
								class="bar-fill"
								:style="{ width: (t.progress || 0) + '%', background: c.color }"
							></view>
						</view>
						<text class="t-progress">{{ t.progress || 0 }}%</text>

						<view class="t-actions" v-if="canMove(t)">
							<view class="mini" @click.stop="advance(t)">
								{{ nextLabel(t.status) }}
							</view>
							<view
								class="mini mini-plain"
								v-if="t.status === '进行中'"
								@click.stop="pause(t)"
							>
								暂停
							</view>
						</view>
					</view>

					<view v-if="c.tasks.length === 0" class="col-empty">
						暂无任务
					</view>
				</scroll-view>
			</view>

		</view>
	</scroll-view>

	<view class="tip">
		点卡片进任务详情；有权限时可在卡片上直接推进状态。左右滑动切换列。
	</view>

</view>

</template>

<script>

import { ensureLogin, loadPerm, perm, currentOpenid } from '@/utils/perm.js'
import { api } from '@/utils/api.js'

// 看板四列（与任务状态字段取值一致）
const COLUMNS = [
	{ key: '未开始', color: '#8E8E93' },
	{ key: '进行中', color: '#007AFF' },
	{ key: '已完成', color: '#34C759' },
	{ key: '已暂停', color: '#FF9500' }
]

export default {

	data() {
		return {
			projectId: '',
			project: null,
			tasks: [],
			loading: true,
			canManage: false,
			scrollTarget: ''
		}
	},

	computed: {

		columns() {
			return COLUMNS.map((c, i) => ({
				...c,
				index: i,
				tasks: this.tasks.filter((t) => this.normalize(t.status) === c.key)
			}))
		},

		doneRate() {
			if (this.tasks.length === 0) return 0
			const done = this.tasks.filter((t) => this.normalize(t.status) === '已完成').length
			return Math.round((done / this.tasks.length) * 100)
		}

	},

	onLoad(options) {
		this.projectId = options.projectId || options.id || ''
		this.init()
	},

	onShow() {
		if (this.projectId && this.project) {
			this.loadProject(true)
			this.loadTasks(true)
		}
	},

	methods: {

		async init() {
			try {
				await ensureLogin()
			} catch (e) {}
			await loadPerm(true)
			await this.loadProject()
			await this.loadTasks()
		},

		async loadProject(silent) {
			try {
				const res = await api.getProject(this.projectId, silent)
				this.project = res.project || null
				this.applyPerm()
			} catch (e) {
				console.error('[board] 加载项目失败:', e)
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
		},

		applyPerm() {
			const p = perm()
			const role = p.role
			// 项目负责人是【项目级身份】，与全局角色无关（交接文档：解耦决策）
			const isProjectLeader = !!(this.project && this.project.leaderId &&
				this.project.leaderId === currentOpenid())
			// 与云函数 updateTask 的服务端规则保持一致
			this.canManage = role === 'admin' || role === 'mentor' || isProjectLeader
		},

		normalize(status) {
			return COLUMNS.some((c) => c.key === status) ? status : '未开始'
		},

		isOverdue(t) {
			if (!t.deadline) return false
			if (this.normalize(t.status) === '已完成') return false
			return t.deadline < this.today()
		},

		today() {
			const d = new Date()
			const p = (n) => String(n).padStart(2, '0')
			return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
		},

		/** 当前用户能否推动这条任务（管理者全部可动；普通成员只能动自己的） */
		canMove(t) {
			if (this.canManage) return true
			return !!t.assignUser && t.assignUser === currentOpenid()
		},

		nextLabel(status) {
			const s = this.normalize(status)
			if (s === '未开始') return '开始'
			if (s === '进行中') return '完成'
			if (s === '已完成') return '退回'
			return '恢复'
		},

		nextStatus(status) {
			const s = this.normalize(status)
			if (s === '未开始') return { status: '进行中' }
			if (s === '进行中') return { status: '已完成', progress: 100 }
			if (s === '已完成') return { status: '进行中' }
			return { status: '进行中' }
		},

		advance(t) {
			const patch = this.nextStatus(t.status)
			this.applyStatus(t, patch)
		},

		pause(t) {
			this.applyStatus(t, { status: '已暂停' })
		},

		applyStatus(t, patch) {
			uni.showModal({
				title: '确认操作',
				content: `「${t.title}」→ ${patch.status}`,
				success: async (res) => {
					if (!res.confirm) return
					try {
						await api.updateTaskStatus(t._id, patch.status, patch.progress)
						// 本地先改，界面立即响应，再静默拉一次服务端数据
						t.status = patch.status
						if (patch.progress !== undefined) t.progress = patch.progress
						await this.loadTasks(true)
					} catch (e) {
						console.error('[board] 状态更新失败:', e)
					}
				}
			})
		},

		scrollTo(index) {
			this.scrollTarget = ''
			this.$nextTick(() => {
				this.scrollTarget = 'col-' + index
			})
		},

		openTask(t) {
			uni.navigateTo({
				url: '/pages/task/task?id=' + t._id
			})
		}

	}

}

</script>

<style>

page{
	height:100%;
	background:#F2F2F7;
}

.container{
	display:flex;
	flex-direction:column;
	height:100vh;
	padding:20rpx 20rpx 0;
	box-sizing:border-box;
}

.bar{
	background:#fff;
	border-radius:18rpx;
	padding:24rpx;
	box-shadow:0 4rpx 16rpx rgba(0,0,0,0.06);
}

.bar-title{
	font-size:34rpx;
	font-weight:bold;
	display:block;
	margin-bottom:8rpx;
}

.bar-sub{
	font-size:24rpx;
	color:#888;
	display:block;
	margin-bottom:16rpx;
}

.chips{
	display:flex;
	flex-wrap:wrap;
}

.chip{
	display:flex;
	align-items:center;
	background:#F2F2F7;
	border-radius:24rpx;
	padding:8rpx 18rpx;
	margin:0 14rpx 8rpx 0;
}

.chip-text{
	font-size:24rpx;
	color:#1C1C1E;
}

.dot{
	width:14rpx;
	height:14rpx;
	border-radius:50%;
	margin-right:10rpx;
}

.board{
	flex:1;
	margin-top:20rpx;
	white-space:nowrap;
}

.board-inner{
	display:flex;
	height:100%;
}

.col{
	width:480rpx;
	flex-shrink:0;
	margin-right:20rpx;
	background:rgba(120,120,128,0.12);
	border-radius:18rpx;
	display:flex;
	flex-direction:column;
	height:100%;
	box-sizing:border-box;
	padding:18rpx 16rpx;
}

.col-head{
	display:flex;
	align-items:center;
	padding:6rpx 6rpx 16rpx;
}

.col-title{
	font-size:28rpx;
	font-weight:bold;
	color:#1C1C1E;
	flex:1;
}

.col-count{
	font-size:24rpx;
	color:#888;
}

.col-body{
	flex:1;
	height:0;
}

.col-empty{
	text-align:center;
	color:#aaa;
	font-size:24rpx;
	padding:40rpx 0;
}

.tcard{
	background:#fff;
	border-radius:16rpx;
	padding:22rpx;
	margin-bottom:18rpx;
	box-shadow:0 4rpx 12rpx rgba(0,0,0,0.05);
	white-space:normal;
}

.t-title{
	font-size:30rpx;
	font-weight:bold;
	color:#222;
	display:block;
	margin-bottom:12rpx;
}

.t-line{
	font-size:24rpx;
	color:#6C6C70;
	display:block;
	margin-bottom:6rpx;
}

.t-over{
	color:#FF3B30;
}

.bar-wrap{
	height:12rpx;
	background:rgba(60,60,67,0.12);
	border-radius:8rpx;
	margin-top:14rpx;
	overflow:hidden;
}

.bar-fill{
	height:12rpx;
	border-radius:8rpx;
}

.t-progress{
	font-size:22rpx;
	color:#8E8E93;
	display:block;
	margin-top:6rpx;
}

.t-actions{
	display:flex;
	margin-top:16rpx;
}

.mini{
	font-size:26rpx;
	color:#fff;
	background:#007AFF;
	border-radius:16rpx;
	min-height:88rpx;
	line-height:88rpx;
	padding:0 28rpx;
	margin-right:14rpx;
	text-align:center;
}

.mini-plain{
	background:rgba(60,60,67,0.12);
	color:#6C6C70;
}

.tip{
	font-size:22rpx;
	color:#8E8E93;
	text-align:center;
	padding:16rpx 0;
}

</style>
