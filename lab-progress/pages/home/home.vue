<template>

<view class="page">

	<!-- 滚动后出现的吸顶毛玻璃标题 -->
	<view class="nav-blur" v-if="navShow">
		<text class="nav-blur-title">{{ navTitle }}</text>
	</view>

	<!-- 顶部：问候 + 角色 + 我的头像 -->
	<view class="hero">
		<view class="hero-left">
			<text class="hero-hi">{{ greeting }}</text>
			<text class="hero-role">{{ roleName }}{{ myName ? ' · ' + myName : '' }}</text>
		</view>
		<image
			v-if="avatarUrl"
			class="avatar"
			:src="avatarUrl"
			mode="aspectFill"
		/>
		<view v-else class="avatar-text">{{ nameInitial }}</view>
	</view>

	<!-- 快捷入口 -->
	<view class="grid">
		<view
			class="grid-item"
			v-for="a in actions"
			:key="a.key"
			hover-class="pressed"
			hover-stay-time="60"
			@click="go(a.key)"
		>
			<view class="grid-ico" :class="'grid-ico-' + a.tone">
				<text class="grid-ico-text">{{ a.icon }}</text>
			</view>
			<text class="grid-label">{{ a.label }}</text>
		</view>
	</view>

	<view class="sec">
		<text class="sec-title">项目（{{ projectCount }}）</text>
		<text class="sec-extra">下拉可刷新</text>
	</view>

	<!-- 项目卡片 -->
	<view
		class="card"
		v-for="p in projectList"
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
			<text class="t-weak">负责人：{{ p.leaderName }}</text>
			<text class="t-weak">项目组 {{ p.memberCount }} 人</text>
		</view>

		<view class="card-meta">
			<text class="t-weak">{{ p.taskText }}</text>
			<text v-if="p.overdueText" class="t-weak t-danger">{{ p.overdueText }}</text>
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

	<!-- 加载骨架 -->
	<view v-if="loading">
		<view class="sk-card" v-for="i in 3" :key="i">
			<view class="sk-line sk-line-mid"></view>
			<view class="sk-line sk-line-short sk-gap"></view>
			<view class="sk-line sk-line-bar"></view>
		</view>
	</view>

	<view v-else-if="projectCount === 0" class="empty-state">
		<view class="empty-art">
			<view class="empty-doc">
				<view class="empty-doc-line"></view>
				<view class="empty-doc-line empty-doc-line-short"></view>
			</view>
		</view>
		<text class="empty-title">还没有项目</text>
		<text class="empty-tip">点上面「新建项目」开始，或让管理员建好后把你拉进项目组</text>
	</view>

</view>

</template>

<script>

import { ensureLogin, loadPerm, perm, roleText, user, currentOpenid } from '@/utils/perm.js'
import { api } from '@/utils/api.js'

export default {

	data() {
		return {
			navShow: false,
			navTitle: '',
			projects: [],
			loading: true,
			roleName: '',
			myName: '',
			avatarUrl: '',
			nameInitial: '',
			canCreateProject: false,
			// 给模板用的"哑数据"（模板只绑一层字段）
			projectList: [],
			projectCount: 0,
			greeting: '你好',
			actions: []
		}
	},

	async onLoad() {
		await this.init()
	},

	// 从其他页返回时静默刷新（项目增删/角色变化都能反映）
	async onShow() {
		if (this._firstShowDone) {
			const p = await loadPerm(true)
			this.applyPerm(p)
			await this.loadProjects(true)
		} else {
			this._firstShowDone = true
		}
	},

	// 下拉刷新
	async onPullDownRefresh() {
		await this.loadProjects()
		uni.stopPullDownRefresh()
	},

	// 滚动超过 80px 显示吸顶毛玻璃标题（iOS 大标题收起的效果）
	onPageScroll(e) {
		const show = (e && e.scrollTop ? e.scrollTop : 0) > 80
		if (show) {
			const t = '项目 · ' + this.projectCount
			if (t !== this.navTitle) this.navTitle = t
		}
		if (show !== this.navShow) this.navShow = show
	},

	methods: {

		async init() {
			try {
				await ensureLogin()
			} catch (e) {
				// 未登录也允许浏览（权限按最小处理）
			}
			const p = await loadPerm(true)
			this.applyPerm(p)
			this.refreshMe()
			await this.loadProjects()
		},

		applyPerm(p) {
			this.roleName = '当前身份：' + roleText(p.role)
			this.canCreateProject = !!p.canCreateProject
			this.refreshActions()
		},

		refreshMe() {
			const u = user() || {}
			this.myName = u.nickName || ''
			this.avatarUrl = u.avatarUrl || ''
			this.nameInitial = (this.myName || '我').slice(0, 1)
			this.refreshGreeting()
		},

		refreshGreeting() {
			const h = new Date().getHours()
			if (h < 6) this.greeting = '夜深了'
			else if (h < 11) this.greeting = '早上好'
			else if (h < 14) this.greeting = '中午好'
			else if (h < 18) this.greeting = '下午好'
			else this.greeting = '晚上好'
		},

		refreshActions() {
			const list = []
			if (this.canCreateProject) list.push({ key: 'create', label: '新建项目', icon: '＋', tone: 'blue' })
			list.push({ key: 'myTasks', label: '我的任务', icon: '✓', tone: 'green' })
			list.push({ key: 'stats', label: '进度统计', icon: '％', tone: 'orange' })
			list.push({ key: 'members', label: '成员管理', icon: '人', tone: 'gray' })
			this.actions = list
		},

		/** 把项目整理成模板能直接渲染的扁平结构 */
		refreshProjects() {
			this.projectList = this.projects.map((p) => {
				const total = p.taskCount || 0
				const done = p.doneCount || 0
				const overdue = p.overdueCount || 0
				return {
					id: p._id,
					name: p.name || '未命名项目',
					description: p.description || '',
					status: p.status || '未开始',
					statusKey: this.statusKey(p.status),
					progress: Number(p.progress) || 0,
					leaderName: p.leaderName || '未指定',
					memberCount: (p.memberIds || []).length,
					taskText: total === 0 ? '暂无任务' : `任务 ${total} 个 · 已完成 ${done}`,
					overdueText: overdue > 0 ? `逾期 ${overdue}` : ''
				}
			})
			this.projectCount = this.projectList.length
		},

		statusKey(s) {
			if (s === '已完成') return 'done'
			if (s === '进行中') return 'doing'
			if (s === '已暂停') return 'paused'
			return 'todo'
		},

		async loadProjects(silent) {
			if (!silent) this.loading = true
			try {
				const res = await api.getProjects(silent)
				this.projects = res.projects || []
			} catch (e) {
				this.projects = []
			} finally {
				this.loading = false
			}
			this.refreshProjects()
		},

		openProject(item) {
			uni.navigateTo({
				url: '/pages/project/project?id=' + item.id
			})
		},

		go(key) {
			if (key === 'create') {
				uni.navigateTo({ url: '/pages/projectEdit/projectEdit' })
			} else if (key === 'myTasks') {
				uni.navigateTo({ url: '/pages/myTasks/myTasks' })
			} else if (key === 'stats') {
				uni.navigateTo({ url: '/pages/stats/stats' })
			} else if (key === 'members') {
				uni.navigateTo({ url: '/pages/member/member' })
			}
		}

	}

}

</script>

<style>

/* ---------- 顶部问候 ---------- */
.hero-left{
	flex:1;
	padding-right:20rpx;
	overflow:hidden;
}

/* ---------- 快捷入口 ---------- */
.grid{
	display:flex;
	background:#fff;
	border-radius:20rpx;
	padding:28rpx 8rpx;
	box-shadow:0 4rpx 16rpx rgba(0,0,0,0.06);
	margin-bottom:8rpx;
}

.grid-item{
	flex:1;
	display:flex;
	flex-direction:column;
	align-items:center;
}

.grid-ico{
	width:88rpx;
	height:88rpx;
	border-radius:24rpx;
	display:flex;
	align-items:center;
	justify-content:center;
	margin-bottom:14rpx;
	background:rgba(120,120,128,0.12);
}

.grid-ico-text{
	font-size:38rpx;
	color:#6C6C70;
	line-height:1;
}

.grid-ico-blue{
	background:rgba(0,122,255,0.12);
}

.grid-ico-blue .grid-ico-text{
	color:#007AFF;
}

.grid-ico-green{
	background:rgba(52,199,89,0.16);
}

.grid-ico-green .grid-ico-text{
	color:#34C759;
}

.grid-ico-orange{
	background:rgba(255,149,0,0.16);
}

.grid-ico-orange .grid-ico-text{
	color:#FF9500;
}

.grid-label{
	font-size:24rpx;
	color:#6C6C70;
}

/* ---------- 项目卡片补充 ---------- */
.card-meta{
	display:flex;
	justify-content:space-between;
	margin-top:14rpx;
}

</style>
