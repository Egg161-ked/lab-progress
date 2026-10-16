<template>

<view class="page">

	<!-- 滚动后出现的吸顶毛玻璃标题 -->
	<view class="nav-blur" v-if="navShow">
		<text class="nav-blur-title">{{ navTitle }}</text>
	</view>

	<view class="hero">
		<text class="hero-hi">成员管理</text>
		<text class="hero-role">当前角色：{{ myRoleText }}{{ canManage ? '（可修改成员角色）' : '（仅查看）' }}</text>
	</view>

	<!-- 搜索 -->
	<view class="toolbar">
		<input
			class="search"
			v-model="keyword"
			placeholder="搜索昵称"
			confirm-type="search"
			@confirm="load()"
		/>
		<button class="btn btn-primary search-btn" size="mini" @click="load()">搜索</button>
	</view>

	<!-- 在职 / 已归档 -->
	<view class="chips">
		<text
			v-for="s in statusFilters"
			:key="s.value"
			class="chip"
			:class="memberStatus === s.value ? 'chip-on' : ''"
			@click="setStatus(s.value)"
		>
			{{ s.label }}
		</text>
	</view>

	<!-- 角色筛选 -->
	<view class="chips">
		<text
			v-for="f in roleFilters"
			:key="f.value"
			class="chip"
			:class="role === f.value ? 'chip-on' : ''"
			@click="setRole(f.value)"
		>
			{{ f.label }}
		</text>
	</view>

	<!-- 成员列表 -->
	<view
		class="card member"
		v-for="m in rows"
		:key="m.id"
		hover-class="pressed"
		hover-stay-time="60"
		@click="openDetail(m)"
	>
		<image
			v-if="m.avatarUrl"
			class="avatar"
			:src="m.avatarUrl"
			mode="aspectFill"
		></image>
		<view v-else class="avatar-text">{{ m.initial }}</view>

		<view class="info">
			<view class="t-row-left">
				<text class="t-title">{{ m.name }}</text>
				<text class="badge" :class="'role-' + m.roleKey">{{ m.roleName }}</text>
				<text v-if="m.isMe" class="me-tag">我</text>
				<text v-if="m.archived" class="badge badge-plain archived-tag">已归档</text>
			</view>
			<text class="t-weak t-mt6">{{ m.direction }}</text>
		</view>
	</view>

	<view v-if="loading" class="loading-text">加载中…</view>

	<view v-else-if="count === 0" class="empty-state">
		<view class="empty-art">
			<view class="empty-doc">
				<view class="empty-doc-line"></view>
				<view class="empty-doc-line empty-doc-line-short"></view>
			</view>
		</view>
		<text class="empty-title">没有匹配的成员</text>
		<text class="empty-tip">换个关键词或角色筛选试试</text>
	</view>

</view>

</template>

<script>

import { ensureLogin, loadPerm, perm, roleText } from '@/utils/perm.js'
import { api } from '@/utils/api.js'

export default {

	data() {
		return {
			navShow: false,
			navTitle: '',
			members: [],
			loading: true,
			keyword: '',
			role: '',
			memberStatus: 'active',
			myRoleText: '',
			canManage: false,
			rows: [],
			count: 0,
			statusFilters: [
				{ label: '在职', value: 'active' },
				{ label: '已归档', value: 'archived' },
				{ label: '全部', value: 'all' }
			],
			roleFilters: [
				{ label: '全部', value: '' },
				{ label: '管理员', value: 'admin' },
				{ label: '组长', value: 'leader' },
				{ label: '导师', value: 'mentor' },
				{ label: '成员', value: 'member' }
			]
		}
	},

	async onLoad() {
		try {
			await ensureLogin()
		} catch (e) {}
		const p = await loadPerm(true)
		this.myRoleText = roleText(p.role)
		this.canManage = !!p.canManageMember
		await this.load()
	},

	// 从成员详情返回时静默刷新（角色可能已改动，避免显示旧角色）
	onShow() {
		if (this._firstShowDone) {
			loadPerm(true)
			this.load(true)
		} else {
			this._firstShowDone = true
		}
	},

	async onPullDownRefresh() {
		await this.load()
		uni.stopPullDownRefresh()
	},

	// 滚动超过 80px 显示吸顶毛玻璃标题（iOS 大标题收起的效果）
	onPageScroll(e) {
		const show = (e && e.scrollTop ? e.scrollTop : 0) > 80
		if (show) {
			const t = '成员管理 · ' + this.count
			if (t !== this.navTitle) this.navTitle = t
		}
		if (show !== this.navShow) this.navShow = show
	},

	methods: {

		refreshRows() {
			this.rows = this.members.map((m) => {
				const name = m.nickName || '微信用户'
				return {
					id: m._id,
					name,
					initial: name.slice(0, 1),
					avatarUrl: m.avatarTempUrl || m.avatarUrl || '',
					roleKey: m.role || 'member',
					roleName: roleText(m.role),
					direction: m.direction || '未填写方向',
					isMe: !!m.isMe,
					archived: !!m.archived
				}
			})
			this.count = this.rows.length
		},

		setStatus(v) {
			this.memberStatus = v
			this.load()
		},

		setRole(v) {
			this.role = v
			this.load()
		},

		async load(silent) {
			if (!silent) this.loading = true
			try {
				const res = await api.getMembers({
					keyword: this.keyword,
					role: this.role,
					memberStatus: this.memberStatus
				}, silent)
				this.members = res.members || []
			} catch (e) {
				this.members = []
			} finally {
				this.loading = false
			}
			this.refreshRows()
		},

		openDetail(m) {
			uni.navigateTo({
				url: '/pages/member/memberDetail?id=' + m.id
			})
		}

	}

}

</script>

<style>

.toolbar{
	display:flex;
	align-items:center;
	margin-bottom:20rpx;
}

.search{
	flex:1;
	background:#fff;
	border-radius:999rpx;
	padding:16rpx 28rpx;
	font-size:28rpx;
}

.search-btn{
	margin:0 0 0 16rpx;
	border-radius:999rpx;
}

.member{
	display:flex;
	align-items:center;
}

.avatar{
	width:88rpx;
	height:88rpx;
	border-radius:50%;
	background:rgba(120,120,128,0.12);
	margin-right:22rpx;
	flex-shrink:0;
}

.avatar-text{
	width:88rpx;
	height:88rpx;
	border-radius:50%;
	background:rgba(0,122,255,0.12);
	color:#007AFF;
	font-size:34rpx;
	font-weight:bold;
	display:flex;
	align-items:center;
	justify-content:center;
	margin-right:22rpx;
	flex-shrink:0;
}

.info{
	flex:1;
	overflow:hidden;
}

/* 角色徽章（浅底 + 同色深字，与状态徽章同一套观感） */
/* 角色徽章（浅底 + 同色深字，与状态徽章同一套观感） */
.role-admin{ color:#FF3B30; background:rgba(255,59,48,0.14); }
.role-mentor{ color:#AF52DE; background:rgba(175,82,222,0.14); }
.role-leader{ color:#007AFF; background:rgba(0,122,255,0.12); }
.role-member{ color:#6C6C70; background:rgba(120,120,128,0.12); }

.me-tag{
	font-size:20rpx;
	color:#34C759;
	background:rgba(52,199,89,0.16);
	border-radius:999rpx;
	padding:2rpx 12rpx;
	margin-left:12rpx;
}

.archived-tag{
	margin-left:12rpx;
}

</style>
