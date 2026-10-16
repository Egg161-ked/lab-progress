import App from './App'
import { CLOUD_ENV } from './utils/config.js'

// 微信云开发初始化（环境 ID 在 utils/config.js 里改）
// #ifdef MP-WEIXIN
if (wx.cloud) {

	wx.cloud.init({

		env: CLOUD_ENV,

		traceUser: true

	})

	console.log("微信云开发初始化成功")

}
// #endif



// #ifndef VUE3
import Vue from 'vue'
import './uni.promisify.adaptor'
Vue.config.productionTip = false
App.mpType = 'app'
const app = new Vue({
	...App
})
app.$mount()
// #endif

// #ifdef VUE3
import {
	createSSRApp
} from 'vue'
export function createApp() {
	const app = createSSRApp(App)
	return {
		app
	}
}
// #endif
