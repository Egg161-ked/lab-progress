<template>
	<view class="page">

		<view class="header">
			<text class="title">实验室项目进度</text>
			<text class="subtitle">任务可视化管理系统</text>
		</view>

		<!-- 登录中 -->
		<view v-if="loading" class="box">
			<text class="tip">正在登录…</text>
		</view>

		<!-- 已登录 -->
		<view v-else class="box">

			<image
				v-if="userInfo.avatarUrl"
				:src="userInfo.avatarUrl"
				class="avatar"
				mode="aspectFill"
			></image>
			<view v-else class="avatar avatar-empty">
				<text class="avatar-empty-text">暂无头像</text>
			</view>

			<text class="nickname">{{ userInfo.nickName || '微信用户' }}</text>
			<text class="role">角色：{{ roleText }}</text>

			<!-- 完善资料：微信现行规范（chooseAvatar + type=nickname） -->
			<view class="profile">
				<text class="profile-title">完善个人资料</text>

				<button
					class="avatar-btn"
					open-type="chooseAvatar"
					@chooseavatar="onChooseAvatar"
				>
					从微信选择头像
				</button>

				<input
					class="nick-input"
					type="nickname"
					placeholder="请输入昵称"
					:value="form.nickName"
					@input="onNickInput"
					@blur="onNickInput"
				/>

				<button
					class="save-btn"
					type="primary"
					:disabled="saving"
					@click="saveProfile"
				>
					{{ saving ? '保存中…' : '保存资料' }}
				</button>
			</view>

			<button class="enter-btn" type="primary" @click="goHome">进入系统</button>

			<text class="login-hint">已自动登录（openid 建号），可在上方完善头像昵称</text>

		</view>

	</view>
</template>

<script>
	import { ensureLogin, loadPerm } from '@/utils/perm.js'
	import { uploadFile } from '@/utils/api.js'

	export default {

		data() {
			return {
				loading: true,   // 登录中
				saving: false,   // 资料保存中
				userInfo: {},
				form: {
					nickName: '',
					avatarTempPath: ''  // 本地临时头像路径，保存时才上传
				}
			}
		},

		computed: {
			roleText() {
				return this.getRoleText(this.userInfo.role)
			}
		},

		onLoad() {
			this.doLogin()
		},

		methods: {

			// =========================
			// 静默登录（自动建号）
			// =========================
			async doLogin() {
				this.loading = true
				try {
					const user = await ensureLogin()
					this.userInfo = user || {}
					this.form.nickName = this.userInfo.nickName || ''
					await loadPerm(true)   // 预加载权限矩阵，供后续页面直接用
				} catch (e) {
					uni.showToast({ title: '登录失败，请稍后重试', icon: 'none' })
				} finally {
					this.loading = false
				}
			},

			// =========================
			// 选择微信头像（返回临时路径）
			// =========================
			onChooseAvatar(e) {
				const avatarUrl = e && e.detail ? e.detail.avatarUrl : ''
				if (!avatarUrl) return
				this.form.avatarTempPath = avatarUrl
				this.userInfo = { ...this.userInfo, avatarUrl: avatarUrl }
			},

			onNickInput(e) {
				this.form.nickName = (e && e.detail ? e.detail.value : '').trim()
			},

			// =========================
			// 保存资料：先上传头像到云存储，再写库
			// =========================
			async saveProfile() {
				if (this.saving) return

				const nickName = (this.form.nickName || '').trim()
				if (!nickName) {
					uni.showToast({ title: '请先填写昵称', icon: 'none' })
					return
				}

				this.saving = true
				try {
					let avatarUrl = this.userInfo.avatarUrl || ''

					// 临时路径必须上传到云存储，否则会失效
					if (this.form.avatarTempPath) {
						avatarUrl = await uploadFile(this.form.avatarTempPath)
					}

					const user = await ensureLogin({ nickName, avatarUrl })
					this.userInfo = user || this.userInfo
					this.form.avatarTempPath = ''
					await loadPerm(true)

					uni.showToast({ title: '资料已保存' })
				} catch (e) {
					uni.showToast({ title: '保存失败，请重试', icon: 'none' })
				} finally {
					this.saving = false
				}
			},

			// =========================
			// 角色文案
			// =========================
			getRoleText(role) {
				const map = {
					admin: '超级管理员',
					mentor: '导师',
					leader: '组长',
					member: '普通成员'
				}
				return map[role] || '普通成员'
			},

			// =========================
			// 进入系统
			// =========================
			goHome() {
				uni.reLaunch({ url: '/pages/home/home' })
			}

		}
	}
</script>

<style>
	.container {
		padding: 60rpx 40rpx;
		min-height: 100vh;
		background: linear-gradient(180deg, #f0f7ff 0%, #ffffff 100%);
		box-sizing: border-box;
	}

	.header {
		text-align: center;
		margin-bottom: 60rpx;
	}

	.title {
		font-size: 56rpx;
		font-weight: 600;
		letter-spacing: -1.4rpx;
		line-height: 1.2;
		color: #1C1C1E;
		display: block;
	}

	.subtitle {
		font-size: 26rpx;
		color: #8E8E93;
		margin-top: 12rpx;
		display: block;
	}

	.box {
		background: #fff;
		border-radius: 24rpx;
		padding: 56rpx 40rpx;
		box-shadow: 0 1rpx 3rpx rgba(0, 0, 0, 0.03);
		text-align: center;
	}

	.avatar {
		width: 140rpx;
		height: 140rpx;
		border-radius: 50%;
		margin: 0 auto 20rpx;
		display: block;
		background: rgba(120,120,128,0.10);
	}

	.avatar-empty {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.avatar-empty-text {
		font-size: 22rpx;
		color: #C7C7CC;
	}

	.nickname {
		font-size: 38rpx;
		font-weight: 600;
		letter-spacing: -0.4rpx;
		display: block;
		margin-bottom: 10rpx;
	}

	.role {
		font-size: 26rpx;
		color: #8E8E93;
		display: block;
		margin-bottom: 32rpx;
	}

	.profile {
		border-top: 1rpx solid rgba(60,60,67,0.12);
		padding-top: 32rpx;
		margin-bottom: 32rpx;
	}

	.profile-title {
		font-size: 24rpx;
		color: #8E8E93;
		display: block;
		margin-bottom: 20rpx;
	}

	.avatar-btn {
		font-size: 28rpx;
		font-weight: 500;
		background: rgba(0,122,255,0.12);
		color: #007AFF;
		border-radius: 20rpx;
		margin-bottom: 20rpx;
	}

	.nick-input {
		height: 88rpx;
		background: rgba(120,120,128,0.10);
		border-radius: 20rpx;
		padding: 0 24rpx;
		font-size: 30rpx;
		text-align: left;
		margin-bottom: 20rpx;
	}

	.save-btn {
		font-size: 30rpx;
		font-weight: 500;
		background: rgba(0,122,255,0.12);
		color: #007AFF;
		border-radius: 20rpx;
	}

	.enter-btn {
		font-size: 32rpx;
		font-weight: 600;
		background: #007AFF;
		color: #fff;
		border-radius: 24rpx;
	}

	.tip {
		font-size: 26rpx;
		color: #8E8E93;
	}

	.login-hint {
		font-size: 22rpx;
		color: #C7C7CC;
		display: block;
		margin-top: 24rpx;
	}
</style>
