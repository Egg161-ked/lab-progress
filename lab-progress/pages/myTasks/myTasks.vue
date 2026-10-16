<template>

<view class="page">

	<!-- 滚动后出现的吸顶毛玻璃标题 -->
	<view class="nav-blur" v-if="navShow">
		<text class="nav-blur-title">{{ navTitle }}</text>
	</view>

	<view class="hero">
		<text class="hero-hi">我的任务</text>
		<text class="hero-role">{{ myName }}（{{ roleName }}）｜共 {{ taskCount }} 项</text>
	</view>

	<!-- 我负责的项目 -->
	<view v-if="projCount > 0">
		<view class="sec">
			<text class="sec-title">我负责的项目（{{ projCount }}）</text>
		</view>

		<view
			class="card"
			v-for="p in projList"
			:key="p.id"
			hover-class="pressed"
			hover-stay-time="60"
			@click="openProject(p)"
		>
			<view class="t-row">
				<text class="t-title t-ellipsis t-flex1">{{ p.name }}</text>
				<text class="badge" :class="'badge-' + p.statusKey">{{ p.status }}</text>
			</view>

			<text v-if="p.description" class="t-sub t-mt6 t-ellipsis">{{ p.description }}</text>

			<view class="card-meta">
				<text class="t-weak">共 {{ p.taskCount }} 个任务，已完成 {{ p.doneCount }}</text>
				<text v-if="p.overdueCount > 0" class="t-weak t-danger">逾期 {{ p.overdueCount }}</text>
			</view>

			<view class="pg">
				<view class="pg-bar">
					<view
						class="pg-fill"
						:class="p.statusKey === 'done' ? 'pg-fill-done' : ''"
						:style="{ width: p.progress + '%' }"
					></view>
				</view>
				<text class="pg-text">{{ p.progress }}%</text>
			</view>
		</view>
	</view>

	<view class="sec">
		<text class="sec-title">我负责的任务（{{ shownCount }}）</text>
	</view>

	<!-- 筛选 -->
	<view class="chips">
		<text
			v-for="f in filters"
			:key="f.value"
			class="chip"
			:class="filter === f.value ? 'chip-on' : ''"
			@click="setFilter(f.value)"
		>
			{{ f.label }}
		</text>
	</view>

	<!-- 任务列表 -->
	<view
		class="card"
		v-for="item in shown"
		:key="item.id"
		hover-class="pressed"
		hover-stay-time="60"
		@click="openTask(item)"
	>
		<view class="t-row">
			<text class="t-title t-ellipsis t-flex1">{{ item.title }}</text>
			<text class="badge" :class="'badge-' + item.statusKey">{{ item.status }}</text>
		</view>

		<text v-if="item.description" class="t-sub t-mt6 t-ellipsis">{{ item.description }}</text>

		<view class="card-meta">
			<text class="t-weak t-ellipsis">项目：{{ item.projectName }}</text>
			<text class="t-weak" :class="item.overdue ? 't-danger' : ''">
				截止：{{ item.deadline }}{{ item.overdue ? '（已逾期）' : '' }}
			</text>
		</view>

		<view class="pg">
			<view class="pg-bar">
				<view
					class="pg-fill"
					:class="item.statusKey === 'done' ? 'pg-fill-done' : ''"
					:style="{ width: item.progress + '%' }"
				></view>
			</view>
			<text class="pg-text">{{ item.progress }}%</text>
		</view>
	</view>

	<!-- 加载骨架 -->
	<view v-if="loading">
		<view class="sk-card" v-for="i in 3" :key="i">
			<view class="sk-line sk-line-mid"></view>
			<view class="sk-line sk-line-short sk-gap"></view>
			<view class="sk-line sk-line-bar"></view>
		</view>
	</view>

	<view v-else-if="shownCount === 0" class="empty-state">
		<view class="empty-art">
			<view class="empty-doc">
				<view class="empty-doc-line"></view>
				<view class="empty-doc-line empty-doc-line-short"></view>
			</view>
		</view>
		<text class="empty-title">{{ taskCount === 0 ? '还没有指派给你的任务' : '这个筛选下没有任务' }}</text>
		<text class="empty-tip">{{ taskCount === 0 ? '等项目负责人布置任务，或去项目里看看' : '换个筛选条件试试' }}</text>
	</view>

</view>

</template>

<script>

import { ensureLogin, loadPerm, roleText } from '@/utils/perm.js'
import { api } from '@/utils/api.js'

function todayStr() {
	const d = new Date()
	const m = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${d.getFullYear()}-${m}-${day}`
}

export default {

	data() {
		return {
			navShow: false,
			navTitle: '',
			tasks: [],
			myProjects: [],
			loading: true,
			myName: '',
			roleName: '',
			filter: 'all',
			today: todayStr(),
			filters: [
				{ label: '全部', value: 'all' },
				{ label: '进行中', value: '进行中' },
				{ label: '未开始', value: '未开始' },
				{ label: '已完成', value: '已完成' },
				{ label: '已逾期', value: 'overdue' }
			],
			// 哑数据
			projList: [],
			projCount: 0,
			taskCount: 0,
			shownCount: 0,
			rows: []
		}
	},

	computed: {
		shown() {
			if (this.filter === 'all') return this.rows
			if (this.filter === 'overdue') return this.rows.filter((t) => t.overdue)
			return this.rows.filter((t) => t.status === this.filter)
		}
	},

	async onLoad() {
		try {
			await ensureLogin()
		} catch (e) {}
		const p = await loadPerm()
		this.roleName = roleText(p.role)
		await this.load()
	},

	async onPullDownRefresh() {
		await this.load()
		uni.stopPullDownRefresh()
	},

	// 从任务详情返回时静默刷新（进度可能已上传）
	onShow() {
		if (this._firstShowDone) {
			this.load(true)
		} else {
			this._firstShowDone = true
		}
	},

	// 滚动超过 80px 显示吸顶毛玻璃标题（iOS 大标题收起的效果）
	onPageScroll(e) {
		const show = (e && e.scrollTop ? e.scrollTop : 0) > 80
		if (show) {
			const t = '我的任务 · ' + this.taskCount
			if (t !== this.navTitle) this.navTitle = t
		}
		if (show !== this.navShow) this.navShow = show
	},

	methods: {

		statusKey(s) {
			if (s === '已完成') return 'done'
			if (s === '进行中') return 'doing'
			if (s === '已暂停') return 'paused'
			return 'todo'
		},

		/** 整理成模板直接可渲染的结构 */
		refreshRows() {
			this.rows = this.tasks.map((t) => {
				const done = this.statusKey(t.status) === 'done'
				return {
					id: t._id,
					title: t.title || '未命名任务',
					description: t.description || '',
					projectName: t.projectName || '',
					status: t.status || '未开始',
					statusKey: this.statusKey(t.status),
					progress: Number(t.progress) || 0,
					deadline: t.deadline || '未设置',
					overdue: !!t.deadline && !done && t.deadline < this.today
				}
			})
			this.taskCount = this.rows.length
			this.projList = this.myProjects.map((p) => ({
				id: p._id,
				name: p.name || '未命名项目',
				description: p.description || '',
				status: p.status || '未开始',
				statusKey: this.statusKey(p.status),
				progress: Number(p.progress) || 0,
				taskCount: p.taskCount || 0,
				doneCount: p.doneCount || 0,
				overdueCount: p.overdueCount || 0
			}))
			this.projCount = this.projList.length
			this.shownCount = this.shown.length
		},

		setFilter(v) {
			this.filter = v
			this.$nextTick(() => {
				this.shownCount = this.shown.length
			})
		},

		async load(silent) {
			if (!silent) this.loading = true
			try {
				const res = await api.getMyTasks(silent)
				this.tasks = res.tasks || []
				this.myProjects = res.myProjects || []
				this.myName = res.myName || ''
			} catch (e) {
				this.tasks = []
				this.myProjects = []
			} finally {
				this.loading = false
			}
			this.refreshRows()
		},

		openProject(p) {
			uni.navigateTo({
				url: '/pages/project/project?id=' + p.id
			})
		},

		openTask(item) {
			uni.navigateTo({
				url: '/pages/task/task?id=' + item.id
			})
		}

	}

}

</script>

<style>

.card-meta{
	display:flex;
	justify-content:space-between;
	margin-top:14rpx;
}

</style>
